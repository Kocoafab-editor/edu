// Minimal SPA for personality quiz (student/teacher)
// By default, we only use vanilla JS + the JSON files in /data

const Views = {
  home: document.getElementById('view-home'),
  role: document.getElementById('view-role'),
  quiz: document.getElementById('view-quiz'),
  loading: document.getElementById('view-loading'),
  result: document.getElementById('view-result'),
};

const UI = {
  start: document.getElementById('btn-start'),
  roleCards: () => Array.from(document.querySelectorAll('.role-card')),
  progress: document.getElementById('progress'),
  qText: document.getElementById('question-text'),
  optA: document.getElementById('option-a'),
  optB: document.getElementById('option-b'),
  btnAllTypes: document.getElementById('btn-all-types'),
  btnShare: document.getElementById('btn-share'),
  resultName: document.getElementById('result-name'),
  resultImg: document.getElementById('result-image'),
  resultDesc: document.getElementById('result-desc'),
  resultQuote: document.getElementById('result-quote'),
  modal: document.getElementById('modal-types'),
  typesGrid: document.getElementById('types-grid'),
  loadingImage: document.getElementById('loading-image'),
  loadingText: document.getElementById('loading-text'),
};

let state = {
  role: null, // 'student' | 'teacher'
  questions: [], // all 20
  selected: [],  // 10 picked
  index: 0,
  scores: {}, // { key: number }
  results: [], // categories/meta
  lastResult: null, // {id, key, name, ...}
};

// ===== ASSET HELPERS =====
const ASSET_BASE = 'assets';
const ASSET_COUNTS = {
  student: { loading: 6, result: 6, modal: 6 },
  teacher: { loading: 6, result: 6, modal: 6 },
};

// pic1.png ~ picN.png 배열 생성
function buildImages(kind, role) {
  const r = role || 'student';
  const n = (ASSET_COUNTS[r] && ASSET_COUNTS[r][kind]) || 8;
  const base = `${ASSET_BASE}/${r}/${kind}`;
  return Array.from({ length: n }, (_, i) => `${base}/pic${i + 1}.png`);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 간단 프리로드(깜박임 완화)
function preload(images = []) {
  images.forEach(src => { const im = new Image(); im.src = src; });
}

let __toastTimer = null;
function showToast(text, { icon = '✓', timeout = 2000 } = {}){
  const el = document.getElementById('toast');
  if (!el) return;
  const ico = el.querySelector('.toast__icon');
  const msg = el.querySelector('.toast__text');
  if (ico) ico.textContent = icon;
  if (msg) msg.textContent = text;

  el.classList.add('is-show');
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => el.classList.remove('is-show'), timeout);
}

let __resultRaf = null;
let __resultActionsRO = null;

function getSafeAreaInsetBottomPx() {
  // 캐시
  if (getSafeAreaInsetBottomPx._v !== undefined) return getSafeAreaInsetBottomPx._v;
  const probe = document.createElement('div');
  probe.style.cssText = `
    position: fixed; bottom: 0; left: 0; height: 0;
    padding-bottom: env(safe-area-inset-bottom);
    visibility: hidden; pointer-events: none; z-index: -1;`;
  document.body.appendChild(probe);
  const v = parseFloat(getComputedStyle(probe).paddingBottom || '0') || 0;
  document.body.removeChild(probe);
  getSafeAreaInsetBottomPx._v = v;
  return v;
}

function syncResultBottomSpace(){
  const view = document.getElementById('view-result');
  if (!view) return;

  const content = view.querySelector('.view-content.result-flow');
  const actions = document.querySelector('.actions.actions--result');
  if (!content) return;

  if (!actions) { content.style.paddingBottom = '0px'; return; }

  // 측정 (확대/폰트/레이아웃 변화 반영)
  const rectC = content.getBoundingClientRect();
  const rectA = actions.getBoundingClientRect();

  const actionsH = Math.ceil(rectA.height);     // 버튼 실제 높이
  const GAP     = 16;                           // 버튼과 콘텐츠 사이 여유
  const MULT    = 2;                            // ✅ 요청: 기본 2배로 확보
  const SAFE    = getSafeAreaInsetBottomPx();   // iOS 하단 홈바 등

  // 지금 상태에서 겹칠지 판단(기존 버튼 상단 기준)
  const willOverlap = rectC.bottom > (window.innerHeight - (actionsH + GAP));

  // 겹칠 때만 "2배 + 여유 + 안전영역" 만큼 패딩 부여
  const pad = willOverlap ? Math.ceil(actionsH * MULT + GAP + SAFE) : 0;

  // 필요할 때만 업데이트(리플로우 최소화)
  const cur = parseFloat(content.style.paddingBottom || '0') || 0;
  if (Math.abs(cur - pad) > 0.5) {
    content.style.paddingBottom = pad + 'px';
  }
}

function scheduleSyncResultBottomSpace(){
  if (__resultRaf) return;
  __resultRaf = requestAnimationFrame(() => {
    __resultRaf = null;
    syncResultBottomSpace();
  });
}

// 활성화/해제(뷰 전환 시 사용)
function enableResultPaddingSync(){
  scheduleSyncResultBottomSpace();

  // 확대/리사이즈/스크롤에 반응
  window.addEventListener('resize', scheduleSyncResultBottomSpace);
  window.addEventListener('scroll', scheduleSyncResultBottomSpace, { passive: true });

  // 결과 이미지/콘텐츠 변화 반영
  document.getElementById('result-image')?.addEventListener('load', scheduleSyncResultBottomSpace);

  // ✅ actions 자체의 크기 변화(글자 줄바꿈/버튼 줄 추가/확대 등) 추적
  const actions = document.querySelector('.actions.actions--result');
  if (actions) {
    __resultActionsRO = new ResizeObserver(() => scheduleSyncResultBottomSpace());
    __resultActionsRO.observe(actions);
  }
}

function disableResultPaddingSync(){
  window.removeEventListener('resize', scheduleSyncResultBottomSpace);
  window.removeEventListener('scroll', scheduleSyncResultBottomSpace);
  document.getElementById('result-image')?.removeEventListener('load', scheduleSyncResultBottomSpace);
  if (__resultActionsRO) { __resultActionsRO.disconnect(); __resultActionsRO = null; }
}

function stopPressLoop(){
  isPressing = false;
  clearInterval(pressTimer);
  pressTimer = null;
  // ✅ 해제
  document.body.classList.remove('no-select', 'no-drag');
}

// === Heart FX 설정값(원하는 대로 조절) ===
const HeartFX = {
  emoji: '♥️',          // 이모지 초기 버전
  useImage: false,      // true면 아래 imageSrc의 PNG 사용
  imageSrc: 'assets/heart.png', // 나중에 PNG로 바꿀 때 경로 지정

  perBurst: 2,          // 단일 발생 시 하트 개수
  rateMs: 120,          // 꾹 누르는 동안 생성 주기(ms)
  rise: [160, 220],     // 떠오르는 높이(px) 범위
  size: [18, 32],       // 이모지 font-size(px) 또는 PNG width(px) 범위
  duration: [900, 1400],// 애니메이션 시간(ms) 범위
  driftX: [-40, 40],    // 좌우 드리프트(px)
  spin:  [-25, 25],     // 회전 추가(deg)
  scale: [0.9, 1.2],    // 초기 스케일 범위(이모지/PNG 공통)
};

// 유틸: 랜덤 helpers
const rand = (min, max) => min + Math.random() * (max - min);
const randi = (min, max) => Math.floor(rand(min, max));
const randFrom = (arr) => arr[randi(0, arr.length)];

// FX 레이어
const fxLayer = document.getElementById('fx-layer');

// 하트 하나 생성
function spawnHeart(x, y){
  if (!fxLayer) return;

  const el = document.createElement('span');
  el.className = 'fx-heart';
  el.style.setProperty('--x', `${x}px`);
  el.style.setProperty('--y', `${y}px`);
  el.style.setProperty('--dx', `${rand(HeartFX.driftX[0], HeartFX.driftX[1])}px`);
  el.style.setProperty('--rise', `${rand(HeartFX.rise[0], HeartFX.rise[1])}px`);
  el.style.setProperty('--dur', `${randi(HeartFX.duration[0], HeartFX.duration[1])}ms`);
  el.style.setProperty('--rot', `${randi(-10, 10)}deg`);
  el.style.setProperty('--spin', `${randi(HeartFX.spin[0], HeartFX.spin[1])}deg`);
  el.style.setProperty('--scale', rand(HeartFX.scale[0], HeartFX.scale[1]));

  if (HeartFX.useImage) {
    el.classList.add('is-img');
    const img = new Image();
    img.src = HeartFX.imageSrc;
    el.style.setProperty('--imgW', `${randi(HeartFX.size[0], HeartFX.size[1])}px`);
    el.appendChild(img);
  } else {
    el.classList.add('is-emoji');
    el.textContent = HeartFX.emoji;
    el.style.setProperty('--fontSize', `${randi(HeartFX.size[0], HeartFX.size[1])}px`);
  }

  fxLayer.appendChild(el);

  // 애니메이션 끝나면 정리
  const dur = parseInt(el.style.getPropertyValue('--dur')) || 1200;
  setTimeout(() => el.remove(), dur + 80);
}

// 여러 개 생성
function burstHearts(x, y, n = HeartFX.perBurst){
  for (let i = 0; i < n; i++){
    // 한 점에서 살짝 시간차/위치차로 더 자연스럽게
    const jitter = randi(0, 120);
    setTimeout(() => spawnHeart(
      x + randi(-6, 6),
      y + randi(-6, 6)
    ), jitter);
  }
}

// 누르고 있는 동안 반복 발생
let isPressing = false;
let pressTimer = null;
let lastPos = { x: 0, y: 0 };

function startPressLoop(x, y){
  isPressing = true;
  lastPos = { x, y };
  document.body.classList.add('no-select', 'no-drag');

  burstHearts(x, y);
  clearInterval(pressTimer);
  pressTimer = setInterval(() => {
    burstHearts(lastPos.x, lastPos.y);
  }, HeartFX.rateMs);
}

function stopPressLoop(){
  isPressing = false;
  clearInterval(pressTimer);
  pressTimer = null;
}

// 포인터 이벤트(마우스/펜/터치 공통) 바인딩
(function bindHeartFX(){
  // Pointer 계열 지원 시
  if ('onpointerdown' in window){
    document.addEventListener('pointerdown', (e) => {
      startPressLoop(e.clientX, e.clientY);
    });
    document.addEventListener('pointermove', (e) => {
      if (isPressing) {
        lastPos = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    }, { passive: true });
    document.addEventListener('pointerup', stopPressLoop);
    document.addEventListener('pointercancel', stopPressLoop);
    document.addEventListener('pointerleave', stopPressLoop);
  } else {
    // 마우스 폴백
    document.addEventListener('mousedown', (e) => startPressLoop(e.clientX, e.clientY));
    document.addEventListener('mousemove', (e) => { if (isPressing) lastPos = { x: e.clientX, y: e.clientY }; });
    document.addEventListener('mouseup', stopPressLoop);
    document.addEventListener('mouseleave', stopPressLoop);
    // 터치 폴백
    document.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; if (!t) return;
      startPressLoop(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!isPressing) return;
      const t = e.touches[0]; if (!t) return;
      lastPos = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    document.addEventListener('touchend', stopPressLoop);
    document.addEventListener('touchcancel', stopPressLoop);
  }
})();

function blockWhilePressing(e){
  if (isPressing) e.preventDefault();
}
document.addEventListener('selectstart', blockWhilePressing); // 텍스트/요소 선택 시작
document.addEventListener('dragstart',   blockWhilePressing); // 이미지/링크 드래그 시작


// ---- Utilities

function syncQuizDockHeight(){
  const quiz = document.getElementById('view-quiz');
  const dock = document.getElementById('quiz-dock');
  if (!quiz || !dock) return;
  const h = dock.offsetHeight || 0;
  // 해당 섹션에만 변수 주입(다른 섹션에 영향 없음)
  quiz.style.setProperty('--quiz-dock-h', h + 'px');
}

function showView(name) {
  Object.values(Views).forEach(v => v.classList.remove('is-active'));
  Views[name].classList.add('is-active');

  const header = document.querySelector('.site-header');
  const active = Views[name];
  const dockEl = active ? active.querySelector('.dock') : null;

  document.body.setAttribute('data-view', name);

  if (name === 'role') {
    enableRoleGridSync();
  } else {
    disableRoleGridSync();
  }

  if (name === 'quiz') {
    requestAnimationFrame(() => {
      syncQuizDockHeight();
    });
  }

  if (name === 'result') {
    enableResultPaddingSync();
  } else {
    disableResultPaddingSync();
  }

  const topProg = document.getElementById('top-progress');
  if (topProg) {
    const isQuiz = (name === 'quiz');
    topProg.hidden = !isQuiz;

    if (isQuiz) {
      const total = (state?.selected?.length) ? state.selected.length : 10;
      const cur   = (state?.index ?? 0);
      setTopProgress(cur, total);
    } else {
      // 홈으로 돌아오거나, 로딩/결과 등 퀴즈 밖 화면에서는 0%로 리셋
      setTopProgress(0, 10);
    }
  }

  // body 클래스 토글
  document.body.classList.toggle('has-dock', !!dockEl);

  // 다음 페인트 타이밍에 높이 측정 → CSS 변수 반영
  requestAnimationFrame(() => {
    const headerH = header ? header.offsetHeight : 0;
    const dockH = dockEl ? dockEl.offsetHeight : 0;
    document.body.style.setProperty('--header-h', headerH + 'px');
    document.body.style.setProperty('--dock-h', dockH + 'px');
  });
}

function syncRoleGridWidth(){
  const title = document.getElementById('role-title');
  const grid  = document.getElementById('role-grid');
  if (!title || !grid) return;

  // 제목의 실제 보이는 너비(px)
  const titleW = Math.ceil(title.getBoundingClientRect().width);

  // 최대 프레임(500px) 안에서만 적용
  const maxwVar = parseFloat(getComputedStyle(document.documentElement)
                   .getPropertyValue('--maxw')) || 500;
  const w = Math.min(titleW, maxwVar);

  grid.style.width = w + 'px';
}

let __roleTitleRO = null;
function enableRoleGridSync(){
  syncRoleGridWidth();
  const title = document.getElementById('role-title');
  if (!title) return;
  if (!__roleTitleRO) {
    __roleTitleRO = new ResizeObserver(() => syncRoleGridWidth());
  }
  __roleTitleRO.observe(title);

  // 뷰포트 변화(가로폭/주소창 변동)에도 갱신
  window.addEventListener('resize', syncRoleGridWidth);
}
function disableRoleGridSync(){
  if (__roleTitleRO) { __roleTitleRO.disconnect(); __roleTitleRO = null; }
  window.removeEventListener('resize', syncRoleGridWidth);
}

function $(sel, parent=document){ return parent.querySelector(sel); }
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function parseQuery(){
  return new URLSearchParams(window.location.search);
}
function updateQuery(params){
  const usp = new URLSearchParams(params);
  const newUrl = `${location.pathname}?${usp.toString()}`;
  history.replaceState(null, '', newUrl);
}
async function fetchJSON(path){
  const res = await fetch(path, {cache:'no-store'});
  if(!res.ok) throw new Error('데이터를 불러오지 못했습니다: '+path);
  return await res.json();
}
function copyToClipboard(text){
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta);
  ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
}

function setTopProgress(curIndex, total) {
  const el = document.getElementById('top-progress');
  if (!el) return;
  const bar = el.querySelector('.bar');
  if (!bar) return;

  // curIndex: 0..N, total: N
  const pct = total > 0 ? Math.max(0, Math.min(1, curIndex / total)) * 100 : 0;
  bar.style.width = pct + '%';
  el.setAttribute('aria-valuenow', String(Math.round(pct)));
}

// ---- Data loading per role
async function loadDataForRole(role){
  state.role = role;
  const base = role === 'student' ? 'student' : 'teacher';
  const [qs, rs] = await Promise.all([
    fetchJSON(`data/${base}_questions.json`),
    fetchJSON(`data/${base}_results.json`),
  ]);
  state.questions = qs;
  state.results = rs;
  // Reset scores map with 0 by key
  state.scores = {};
  for(const r of state.results) state.scores[r.key] = 0;
}

function startQuiz(){
  // pick 10 unique random questions (out of 20)
  setTopProgress(0, state.selected.length);
  state.selected = shuffle(state.questions).slice(0, 10);
  state.index = 0;
  for(const k of Object.keys(state.scores)) state.scores[k] = 0;
  renderQuestion();
  showView('quiz');
  updateQuery({ view:'quiz', role: state.role });
}

function renderQuestion(){
  const i = state.index;
  const q = state.selected[i];
  UI.progress.textContent = `[ ${i+1} / 10 ]`;
  UI.qText.textContent = q.text;
  // Fill options
  UI.optA.textContent = `A. ${q.options[0].text}`;
  UI.optB.textContent = `B. ${q.options[1].text}`;
  // Set handlers
  UI.optA.onclick = () => answer(0);
  UI.optB.onclick = () => answer(1);
  setTopProgress(state.index, state.selected.length); 
}

function answer(choiceIndex){
  const q = state.selected[state.index];
  const chosen = q.options[choiceIndex];
  // Increment category
  state.scores[chosen.cat] = (state.scores[chosen.cat] || 0) + 1;

  // Next
  state.index++;
  if(state.index < state.selected.length){
    renderQuestion();
  }else{
    // Finish -> Compute result
    setTopProgress(state.index, state.selected.length);
    showView('loading');
    const loadingImgs = shuffle(buildImages('loading', state.role));
    preload(loadingImgs);
    startLoadingFX(loadingImgs);
    setTimeout(()=>{
      const res = computeResult();
      state.lastResult = res;
      try{
        localStorage.setItem('goldenKids-last', JSON.stringify({role: state.role, resultId: res.id, when: Date.now()}));
      }catch{}
      updateQuery({ view:'result', role: state.role, rid: String(res.id) });
      renderResult(res);
      stopLoadingFX();
      showView('result');
    }, 5000);
  }
}

function computeResult(){
  // build a map from key -> {score, id}
  // id is used for tie-breaking (lowest id wins)
  const byKey = {};
  for(const r of state.results) byKey[r.key] = {score: state.scores[r.key]||0, id: r.id, data: r};
  // find max score
  let best = null;
  for(const k of Object.keys(byKey)){
    const cur = byKey[k];
    if(!best || cur.score > best.score || (cur.score === best.score && cur.id < best.id)){
      best = cur;
    }
  }
  return best.data;
}

function renderResult(res){
  const role = state.role || 'student';
  const id = res?.id || 1; // 1~6
  const src = `${ASSET_BASE}/${role}/result/pic${id}.png`;

  const img = document.getElementById('result-image');
  if (img) {
    img.src = src;
    img.alt = `결과 카드 ${id}`;
  }

  // 텍스트들은 이제 사용하지 않으므로 지우거나 숨김(이미 제거했으면 생략)
  const name = document.getElementById('result-name');
  const desc = document.getElementById('result-desc');
  const quote = document.getElementById('result-quote');
  if (name) name.textContent = '';
  if (desc) desc.textContent = '';
  if (quote) quote.textContent = '';

  // 프리로드: 모달 썸네일도 미리
  preload(buildImages('modal', role));
}

function populateTypesGridForModal(){
  const role = state.role || 'student';
  const grid = document.getElementById('types-grid'); // 기존 모달 내부 그리드
  if (!grid) return;

  // modal 폴더의 이미지 로드(수량은 상단 상수에서 제어)
  const imgs = buildImages('modal', role);

  // 그리드 채우기(이미지 단독)
  grid.innerHTML = imgs.map(src => `
    <div class="type-card">
      <img src="${src}" alt="유형 이미지">
    </div>
  `).join('');
}

// ===== Loading animation: 1초마다 이미지/점 변화 (배열 인자 받도록 변경) =====
let __loading_img_timer = null;
let __loading_dot_timer = null;

function startLoadingFX(images) {
  const list = (images && images.length) ? images : [];
  // 이미지 순환
  if (UI.loadingImage && list.length) {
    let idx = 0;
    UI.loadingImage.src = list[0];
    __loading_img_timer = setInterval(() => {
      idx = (idx + 1) % list.length;
      UI.loadingImage.src = list[idx];
    }, 1000);
  }
  // 말줄임표 순환(기존 그대로)
  if (UI.loadingText) {
    let dots = 0;
    UI.loadingText.textContent = '금쪽이 찾는 중';
    __loading_dot_timer = setInterval(() => {
      dots = (dots + 1) % 4;
      UI.loadingText.textContent = '금쪽이 찾는 중' + '.'.repeat(dots);
    }, 300);
  }
}
function stopLoadingFX(){
  if (__loading_img_timer){ clearInterval(__loading_img_timer); __loading_img_timer = null; }
  if (__loading_dot_timer){ clearInterval(__loading_dot_timer); __loading_dot_timer = null; }
}


// ---- Modal helpers
function openModal(){
  UI.modal.classList.add('is-open');
  UI.modal.setAttribute('aria-hidden', 'false');
}
function closeModal(){
  UI.modal.classList.remove('is-open');
  UI.modal.setAttribute('aria-hidden', 'true');
}

// ---- Share
async function shareResult(){
  if(!state.lastResult) return;
  const url = new URL(location.href);
  // ensure params present
  url.searchParams.set('view','result');
  url.searchParams.set('role', state.role);
  url.searchParams.set('rid', String(state.lastResult.id));
  const shareUrl = url.toString();
  if(navigator.share){
    try{
      await navigator.share({ title: '내 금쪽이 결과', text: state.lastResult.name, url: shareUrl });
    }catch(e){ /* user cancelled */ }
  }else{
    copyToClipboard(shareUrl);
    showToast('복사 완료', { icon: '✓', timeout: 2000 });
  }
}

// ---- Wiring buttons
UI.start?.addEventListener('click', ()=>{ showView('role'); updateQuery({ view:'role' }); });
document.body.addEventListener('click',(e)=>{
  const go = e.target.closest('[data-go]');
  if(go){
    const dest = go.getAttribute('data-go');
    showView(dest);
    if(dest==='home') updateQuery({}); // clear query
    else updateQuery({ view: dest, role: state.role || '' });
  }
  const rc = e.target.closest('.role-card');
  if(rc){
    const role = rc.getAttribute('data-role');
    (async ()=>{
      await loadDataForRole(role);
      startQuiz();
    })();
  }
  if(e.target.matches('[data-close]')) closeModal();
});
UI.btnAllTypes?.addEventListener('click', openModal);
UI.btnShare?.addEventListener('click', shareResult);

window.addEventListener('load', () => {
  const active = document.querySelector('.view.is-active');
  if (active) {
    const id = Object.keys(Views).find(k => Views[k] === active);
    if (id) showView(id);
  }
});

// 리사이즈에 대응 (주소창 변화 포함)
window.addEventListener('resize', () => {
  const active = document.querySelector('.view.is-active');
  if (active) {
    const id = Object.keys(Views).find(k => Views[k] === active);
    if (id) showView(id);
  }
});

window.addEventListener('resize', syncQuizDockHeight);
document.getElementById('quiz-dock')?.addEventListener('click', syncQuizDockHeight);

document.getElementById('btn-all-types')?.addEventListener('click', () => {
  populateTypesGridForModal();
  openModal('types'); // ← 기존 모달 오픈 함수 사용
});

// ---- Deep link handling (view=result&role=...&rid=...)
(async function initFromURL(){
  const q = parseQuery();
  const view = q.get('view');
  const role = q.get('role');
  const rid = q.get('rid');

  if(view === 'result' && role && rid){
    try{
      await loadDataForRole(role === 'teacher' ? 'teacher' : 'student');
      const res = state.results.find(r => String(r.id) === String(rid)) || state.results[0];
      state.lastResult = res;
      renderResult(res);
      showView('result');
      return;
    }catch(e){
      console.error(e);
    }
  }
  // default landing
  showView('home');
})();

