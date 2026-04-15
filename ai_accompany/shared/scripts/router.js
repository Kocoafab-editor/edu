const ROUTE_MAP = {
  'login': 'index.html',
  'admin-overview': 'admin/overview/index.html',
  'admin-schools': 'admin/schools/index.html',
  'instructor': 'instructor/index.html',
  'team': 'team/index.html',
  'student-home': 'student-home/index.html',
  'student': 'student/index.html',
  'lesson': 'lesson/index.html',
  'evaluation': 'evaluation/index.html',
};

function normalizeRootPath(rootPath = '.') {
  const trimmed = String(rootPath || '.').replace(/\/+$/, '');
  return trimmed || '.';
}

export function buildHref(rootPath, routeKey, params = {}) {
  const normalizedRoot = normalizeRootPath(rootPath);
  const routePath = ROUTE_MAP[routeKey];
  if (routePath === undefined) {
    throw new Error(`Unknown route: ${routeKey}`);
  }

  const baseHref = normalizedRoot === '.'
    ? `./${routePath}`
    : `${normalizedRoot}/${routePath}`;

  const search = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();

  return search ? `${baseHref}?${search}` : baseHref;
}

export function readQueryParam(name, search = globalThis.window?.location?.search || '') {
  return new URLSearchParams(search).get(name);
}

export function getBodyRootPath() {
  return globalThis.document?.body?.dataset?.appRoot || '.';
}

export function redirectTo(rootPath, routeKey, params = {}) {
  const href = buildHref(rootPath, routeKey, params);
  if (typeof window !== 'undefined') {
    window.location.href = href;
  }
  return href;
}

