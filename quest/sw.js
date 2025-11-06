// sw.js
const VERSION = 'v1.0.1';
const RUNTIME_IMG = `img-${VERSION}`;
const RUNTIME_JSON = `json-${VERSION}`;
const SHELL = `shell-${VERSION}`;
const SHELL_ASSETS = [
  './', './index.html', './style.css', './app.js', './assets/fonts/CookieRun-Regular.woff',
  // 폰트/아이콘을 CDN이 아닌 로컬로 두셨으면 여기에 추가
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(SHELL).then(c=>c.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![SHELL, RUNTIME_IMG, RUNTIME_JSON].includes(k))
                         .map(k => caches.delete(k)));
  })());
  self.clients.claim();
});

self.addEventListener('message', (e)=>{
  const data = e.data || {};
  if (data.type === 'PREFETCH_IMAGES' && Array.isArray(data.urls)) {
    e.waitUntil((async ()=>{
      const cache = await caches.open(RUNTIME_IMG);
      await Promise.all(
        data.urls.map(async (u)=>{
          try {
            const req = new Request(u, { cache: 'reload' }); // 네트워크 강제
            const res = await fetch(req);
            if (res && res.ok) await cache.put(req, res.clone());
          } catch(_) {}
        })
      );
    })());
  }
});

// helper
const isImage = (url)=> (url)=> url.pathname.includes('/assets/') &&
                                /\.(png|jpe?g|gif|webp|svg)$/i.test(url.pathname);
const isJSON  = (url)=> (url)=> url.pathname.includes('/assets/reco/chart-flows.json');
const isCSSJS = (url)=> (url)=> /\.(css|js)$/i.test(url.pathname);

self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);

  // same-origin만 다룸(타 도메인 CDN이면 패스)
  if (url.origin !== location.origin) return;

  if (isCSSJS(url)) {
    e.respondWith(fetch(new Request(e.request, { cache:'no-store' })).catch(async ()=>{
      // 오프라인 시에만 캐시 폴백
      const cache = await caches.open(SHELL);
      return (await cache.match(e.request)) || Response.error();
    }));
    return;
  }

  // 1) 이미지: Cache First
  if (isImage(url)) {
    e.respondWith((async()=>{
      const cache = await caches.open(RUNTIME_IMG);
      const cached = await cache.match(e.request, { ignoreVary: true });
      if (cached) return cached;
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    })());
    return;
  }

  // 2) flows.json: Stale-While-Revalidate
  if (isJSON(url)) {
    e.respondWith((async()=>{
      const cache = await caches.open(RUNTIME_JSON);
      const cached = await cache.match(e.request);
      const network = fetch(e.request).then(res=>{
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(()=>null);
      return cached || network || new Response('{}', { headers: { 'content-type': 'application/json' }});
    })());
    return;
  }

  // 3) 앱 쉘: Network First (오프라인 시 캐시)
  if (e.request.mode === 'navigate' || isCSSJS(url)) {
   e.respondWith(
     fetch(new Request(e.request, { cache: 'no-store' }))
       .catch(async () => {
         // 오프라인 폴백: 캐시에 있으면 그것이라도
         const cache = await caches.open(SHELL);
         return (await cache.match(e.request)) || (await cache.match('./index.html'));
       })
   );
   return;
 }
});
