import { buildHref, redirectTo } from './router.js';

const SESSION_KEY = 'ai-accompany.session';

function getSessionStorage() {
  try {
    return globalThis.sessionStorage || null;
  } catch (error) {
    return null;
  }
}

function toSessionUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    displayName: user.displayName || user.id,
    schoolId: user.schoolId || '',
    clubId: user.clubId || '',
    teamId: user.teamId || '',
    teamIds: Array.isArray(user.teamIds) ? [...user.teamIds] : user.teamId ? [user.teamId] : [],
    studentId: user.studentId || '',
  };
}

export function authenticateUser(data, id, password) {
  const match = (data?.users || []).find((user) => user.id === id && user.password === password);
  return match ? toSessionUser(match) : null;
}

export function saveSession(sessionUser) {
  const storage = getSessionStorage();
  if (!storage || !sessionUser) return;
  storage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
}

export function loadSession() {
  const storage = getSessionStorage();
  if (!storage) return null;

  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    storage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearSession() {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.removeItem(SESSION_KEY);
}

export function getLandingHref(rootPath, sessionUser) {
  if (!sessionUser) return buildHref(rootPath, 'login');
  if (sessionUser.role === 'admin') return buildHref(rootPath, 'admin-overview');
  if (sessionUser.role === 'instructor') return buildHref(rootPath, 'instructor');
  return buildHref(rootPath, 'student-home');
}

export function ensureSession(rootPath, allowedRoles = []) {
  const sessionUser = loadSession();
  if (!sessionUser) {
    redirectTo(rootPath, 'login');
    return null;
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(sessionUser.role)) {
    const href = getLandingHref(rootPath, sessionUser);
    if (typeof window !== 'undefined') {
      window.location.href = href;
    }
    return null;
  }

  return sessionUser;
}

export function attachLogout(rootPath, target = globalThis.document) {
  const button = target?.getElementById?.('logoutButton');
  if (!button) return;

  button.addEventListener('click', () => {
    clearSession();
    redirectTo(rootPath, 'login');
  });
}

