const EVALUATION_KEY = 'ai-accompany.evaluation-overrides';

function getLocalStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (error) {
    return null;
  }
}

export function loadEvaluationOverrides() {
  const storage = getLocalStorage();
  if (!storage) return [];

  const raw = storage.getItem(EVALUATION_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    storage.removeItem(EVALUATION_KEY);
    return [];
  }
}

export function saveEvaluationOverride(override) {
  const storage = getLocalStorage();
  if (!storage) return [];

  const current = loadEvaluationOverrides();
  const next = current.filter(
    (item) => !(item.studentId === override.studentId && item.lessonId === override.lessonId)
  );
  next.push({ ...override, updatedAt: new Date().toISOString() });
  storage.setItem(EVALUATION_KEY, JSON.stringify(next));
  return next;
}

export function clearEvaluationOverrides() {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.removeItem(EVALUATION_KEY);
}
