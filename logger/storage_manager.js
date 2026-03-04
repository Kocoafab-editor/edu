
/* Local storage manager */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'loggerState.v1';
  const STATE_DB = 'loggerStateDb';
  const STATE_STORE = 'state';
  const SAVE_DEBOUNCE_MS = 1200;
  const DUMMY_PREFIX = 'loggerDummy_';
  const DUMMY_DB = 'loggerDummyStorage';
  const DUMMY_STORE = 'chunks';
  const DUMMY_CHUNK_SIZE = 1024 * 100;
  const LOCAL_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;

  const ctx = {
    getGroups: () => [],
    getLastActiveGroupId: () => null,
    autoSeriesMap: [],
    alignGroupsToGlobalTimeline: () => {},
    showNotification: () => {},
    applyState: () => false,
    setGroupPanelOpen: () => {},
    createGroup: () => {},
  };

  let saveTimer = null;
  let pendingSave = false;
  let storageWarned = false;
  let storageCheckTimer = null;
  let storageInit = null;
  const storageAdapter = createStorageAdapter();

  function init(options = {}) {
    Object.keys(ctx).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(options, key)) {
        ctx[key] = options[key];
      }
    });
    ensureStorageReady();
  }

  function ensureStorageReady() {
    if (!storageInit) {
      storageInit = storageAdapter.init();
    }
    return storageInit;
  }

  function openStateDb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error('IndexedDB not available'));
        return;
      }
      const request = indexedDB.open(STATE_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function idbGetState(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STATE_STORE, 'readonly');
      const store = tx.objectStore(STATE_STORE);
      const request = store.get(STORAGE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  function idbSetState(db, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STATE_STORE, 'readwrite');
      const store = tx.objectStore(STATE_STORE);
      const request = store.put(value, STORAGE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function idbRemoveState(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STATE_STORE, 'readwrite');
      const store = tx.objectStore(STATE_STORE);
      const request = store.delete(STORAGE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function createStorageAdapter() {
    let mode = 'localStorage';
    let db = null;

    async function initAdapter() {
      if (!global.indexedDB) {
        mode = 'localStorage';
        return false;
      }
      try {
        db = await openStateDb();
        mode = 'indexedDB';
        return true;
      } catch (err) {
        console.warn('Failed to initialize IndexedDB, fallback to localStorage.', err);
        mode = 'localStorage';
        db = null;
        return false;
      }
    }

    async function getValue() {
      if (mode === 'indexedDB' && db) {
        return idbGetState(db);
      }
      if (!global.localStorage) return null;
      return localStorage.getItem(STORAGE_KEY);
    }

    async function setValue(value) {
      if (mode === 'indexedDB' && db) {
        await idbSetState(db, value);
        return;
      }
      if (!global.localStorage) return;
      localStorage.setItem(STORAGE_KEY, value);
    }

    async function removeValue() {
      if (mode === 'indexedDB' && db) {
        await idbRemoveState(db);
        return;
      }
      if (!global.localStorage) return;
      localStorage.removeItem(STORAGE_KEY);
    }

    return {
      init: initAdapter,
      get: getValue,
      set: setValue,
      remove: removeValue,
      getMode: () => mode,
    };
  }

  function scheduleSave() {
    pendingSave = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (!pendingSave) return;
      pendingSave = false;
      saveState();
    }, SAVE_DEBOUNCE_MS);
  }

  function serializeGroupData(group) {
    const data = {};
    const source = group.graph?.data;
    group.series.forEach((series) => {
      const points = source?.get(series.id) || [];
      data[series.id] = points.map((pt) => ({ t: pt.t, v: pt.v }));
    });
    return data;
  }

  function buildStatePayload() {
    const groups = ctx.getGroups();
    return {
      version: 1,
      lastActiveGroupId: ctx.getLastActiveGroupId(),
      autoSeriesMap: Array.isArray(ctx.autoSeriesMap) ? ctx.autoSeriesMap.slice() : [],
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        series: group.series.map((series) => ({
          id: series.id,
          label: series.label,
          color: series.color,
        })),
        data: serializeGroupData(group),
        bodyHeight: group.elements.body?.clientHeight || null,
        isFolded: group.isFolded,
      })),
    };
  }

  function getGlobalDataRange() {
    let minTime = Infinity;
    let maxTime = -Infinity;
    let totalPoints = 0;
    ctx.getGroups().forEach((group) => {
      if (!group.graph?.data) return;
      group.series.forEach((series) => {
        const points = group.graph.data.get(series.id) || [];
        points.forEach((pt) => {
          if (!Number.isFinite(pt?.t)) return;
          totalPoints += 1;
          minTime = Math.min(minTime, pt.t);
          maxTime = Math.max(maxTime, pt.t);
        });
      });
    });
    if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || totalPoints === 0) {
      return null;
    }
    return { minTime, maxTime, duration: Math.max(0, maxTime - minTime), totalPoints };
  }

  function trimOldestData(ratio = 0.1) {
    const range = getGlobalDataRange();
    if (!range) return false;
    let removed = 0;
    const groups = ctx.getGroups();
    if (range.duration > 0) {
      const sliceMs = Math.max(1, Math.floor(range.duration * ratio));
      const cutoff = range.minTime + sliceMs;
      groups.forEach((group) => {
        if (!group.graph?.data) return;
        group.series.forEach((series) => {
          const points = group.graph.data.get(series.id) || [];
          if (!points.length) return;
          const filtered = points.filter((pt) => Number.isFinite(pt?.t) && pt.t >= cutoff);
          removed += points.length - filtered.length;
          group.graph.data.set(series.id, filtered);
        });
      });
    } else {
      groups.forEach((group) => {
        if (!group.graph?.data) return;
        group.series.forEach((series) => {
          const points = group.graph.data.get(series.id) || [];
          if (!points.length) return;
          const removeCount = Math.max(1, Math.floor(points.length * ratio));
          const filtered = points.slice(removeCount);
          removed += points.length - filtered.length;
          group.graph.data.set(series.id, filtered);
        });
      });
    }

    ctx.alignGroupsToGlobalTimeline({ recalc: true });
    return removed > 0;
  }

  async function saveState() {
    await ensureStorageReady();
    let payload = buildStatePayload();
    let raw = JSON.stringify(payload);
    try {
      await storageAdapter.set(raw);
      scheduleStorageCheck();
    } catch (err) {
      if (err && err.name === 'QuotaExceededError') {
        let trimmed = false;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const ratio = 0.1 + attempt * 0.1;
          const removed = trimOldestData(ratio);
          if (!removed) break;
          trimmed = true;
          payload = buildStatePayload();
          raw = JSON.stringify(payload);
          try {
            await storageAdapter.set(raw);
            scheduleStorageCheck();
            if (trimmed) {
              ctx.showNotification('저장 공간이 부족해 오래된 데이터를 일부 삭제했습니다.', 'error');
            }
            return;
          } catch (retryErr) {
            if (!retryErr || retryErr.name !== 'QuotaExceededError') {
              console.warn('Failed to save state', retryErr);
              return;
            }
          }
        }
        ctx.showNotification('저장 공간이 부족합니다.', 'error');
      }
      console.warn('Failed to save state', err);
    }
  }

  function scheduleStorageCheck() {
    if (storageCheckTimer) return;
    storageCheckTimer = setTimeout(() => {
      storageCheckTimer = null;
      checkStorageUsage();
    }, 2500);
  }

  async function checkStorageUsage(options = {}) {
    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') return null;
    try {
      const estimate = await navigator.storage.estimate();
      const usage = Number(estimate?.usage);
      const quota = Number(estimate?.quota);
      if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return null;
      const ratio = usage / quota;
      if (ratio >= 0.8 && (!storageWarned || options.forceToast)) {
        storageWarned = true;
        const percent = Math.round(ratio * 100);
        ctx.showNotification(`저장 공간 사용량이 ${percent}% 입니다.`, 'error');
      } else if (ratio < 0.7 && storageWarned) {
        storageWarned = false;
      }
    } catch (err) {
      console.warn('Failed to estimate storage', err);
      return null;
    }
  }
  function openDummyDb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DUMMY_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DUMMY_STORE)) {
          db.createObjectStore(DUMMY_STORE, { autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function fillIndexedDb(db, targetBytes) {
    if (!db || targetBytes <= 0) return Promise.resolve(0);
    let written = 0;
    return new Promise((resolve) => {
      const writeBatch = () => {
        const tx = db.transaction(DUMMY_STORE, 'readwrite');
        const store = tx.objectStore(DUMMY_STORE);
        for (let i = 0; i < 10 && written < targetBytes; i += 1) {
          const blob = new Blob(['0'.repeat(DUMMY_CHUNK_SIZE)], { type: 'text/plain' });
          store.add(blob);
          written += DUMMY_CHUNK_SIZE;
        }
        tx.oncomplete = () => {
          if (written >= targetBytes) {
            resolve(written);
          } else {
            setTimeout(writeBatch, 0);
          }
        };
        tx.onerror = () => resolve(written);
      };
      writeBatch();
    });
  }

  function fillLocalStorage(targetBytes) {
    if (!global.localStorage) return Promise.resolve({ written: 0, quotaExceeded: true });
    const prefix = `${DUMMY_PREFIX}${Date.now()}`;
    const chunk = '0'.repeat(DUMMY_CHUNK_SIZE);
    let written = 0;
    let index = 0;
    return new Promise((resolve) => {
      const writeBatch = () => {
        for (let i = 0; i < 10 && written < targetBytes; i += 1) {
          try {
            localStorage.setItem(`${prefix}_${index++}`, chunk);
            written += DUMMY_CHUNK_SIZE;
          } catch (err) {
            if (err && err.name === 'QuotaExceededError') {
              resolve({ written, quotaExceeded: true });
              return;
            }
            console.warn('Failed to add dummy storage', err);
            resolve({ written, quotaExceeded: true });
            return;
          }
        }
        if (written >= targetBytes) {
          resolve({ written, quotaExceeded: false });
        } else {
          setTimeout(writeBatch, 0);
        }
      };
      writeBatch();
    });
  }

  function scheduleStorageWarningCheck(retries = 3) {
    let remaining = retries;
    const tick = () => {
      checkStorageUsage({ forceToast: true });
      if (remaining <= 0) return;
      remaining -= 1;
      setTimeout(tick, 800);
    };
    tick();
  }

  function getLocalStorageUsageBytes() {
    if (!global.localStorage) return 0;
    let total = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) || '';
      total += (key.length + value.length) * 2;
    }
    return total;
  }

  async function logLocalStorageUsage() {
    await ensureStorageReady();
    if (storageAdapter.getMode() === 'indexedDB' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = Number(estimate?.usage) || 0;
        const quota = Number(estimate?.quota) || LOCAL_STORAGE_QUOTA_BYTES;
        const percent = Math.round((usage / quota) * 100);
        const usedMb = (usage / (1024 * 1024)).toFixed(2);
        const quotaMb = (quota / (1024 * 1024)).toFixed(2);
        console.info(`[Storage] estimated: ${usedMb} MB (${percent}% of ${quotaMb}MB)`);
        return;
      } catch (err) {
        console.warn('Failed to estimate storage usage', err);
      }
    }
    const used = getLocalStorageUsageBytes();
    const percent = Math.round((used / LOCAL_STORAGE_QUOTA_BYTES) * 100);
    const usedMb = (used / (1024 * 1024)).toFixed(2);
    console.info(`[Storage] localStorage: ${usedMb} MB (${percent}% of 5MB)`);
  }

  async function fillStorageForTest() {
    storageWarned = false;
    await ensureStorageReady();
    let quota = LOCAL_STORAGE_QUOTA_BYTES;
    let usage = getLocalStorageUsageBytes();
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        quota = Number(estimate?.quota) || quota;
        usage = Number(estimate?.usage) || usage;
      } catch (err) {
        console.warn('Failed to estimate storage usage', err);
      }
    }

    const targetBytes = Math.floor(quota * 0.82);
    const neededBytes = Math.max(0, targetBytes - usage);
    if (neededBytes <= 0) {
      ctx.showNotification('용량 테스트가 80%에 도달하지 못했습니다.', 'error');
      checkStorageUsage({ forceToast: true });
      scheduleStorageWarningCheck();
      return;
    }

    if (storageAdapter.getMode() === 'indexedDB' && global.indexedDB) {
      try {
        const db = await openDummyDb();
        if (db) {
          await fillIndexedDb(db, neededBytes);
          db.close();
        }
      } catch (err) {
        ctx.showNotification('용량 테스트 중 오류가 발생했습니다.', 'error');
        console.warn('Failed to fill IndexedDB', err);
      }
    } else {
      const result = await fillLocalStorage(neededBytes);
      if (result.quotaExceeded) {
        ctx.showNotification('로컬 스토리지 용량이 부족합니다.', 'error');
      }
    }

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const finalUsage = Number(estimate?.usage) || usage;
        const percent = Math.round((finalUsage / quota) * 100);
        if (finalUsage >= targetBytes) {
          ctx.showNotification(`로컬 스토리지 사용량이 ${percent}% 입니다.`, 'error');
        } else {
          ctx.showNotification('용량 테스트가 80%에 도달하지 못했습니다.', 'error');
        }
      } catch (err) {
        console.warn('Failed to estimate storage usage', err);
      }
    }

    checkStorageUsage({ forceToast: true });
    scheduleStorageWarningCheck();
  }

  async function clearStorageTestData() {
    if (global.localStorage) {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(DUMMY_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    }
    if (global.indexedDB) {
      try {
        const db = await openDummyDb();
        if (db) {
          const tx = db.transaction(DUMMY_STORE, 'readwrite');
          tx.objectStore(DUMMY_STORE).clear();
          await new Promise((resolve) => {
            tx.oncomplete = resolve;
            tx.onerror = resolve;
          });
          db.close();
        }
      } catch (err) {
        console.warn('Failed to clear IndexedDB dummy data', err);
      }
    }
    storageWarned = false;
    checkStorageUsage({ forceToast: true });
  }

  async function loadState() {
    await ensureStorageReady();
    const raw = await storageAdapter.get();
    if (!raw) return false;
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      console.warn('Failed to parse state', err);
      return false;
    }
    if (!payload || !Array.isArray(payload.groups)) return false;
    return ctx.applyState(payload);
  }

  async function resetProject() {
    await ensureStorageReady();
    try {
      await storageAdapter.remove();
    } catch (err) {
      console.warn('Failed to clear logger state', err);
    }
    ctx.setGroupPanelOpen(false);
    ctx.applyState({ version: 1, groups: [], autoSeriesMap: [], lastActiveGroupId: null });
    ctx.createGroup();
  }

  global.StorageManager = {
    init,
    scheduleSave,
    saveState,
    loadState,
    resetProject,
    fillStorageForTest,
    clearStorageTestData,
    logLocalStorageUsage,
    checkStorageUsage,
    scheduleStorageWarningCheck,
  };
})(window);
