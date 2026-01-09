(function () {
  const headerSettingsBar = document.querySelector('.header-settings-bar');
  const headerToggleBtn = document.getElementById('headerToggleBtn');
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const navOverlay = document.getElementById('navOverlay');
  const overlayMount = document.getElementById('overlaySettingsMount');
  const headerEl = document.querySelector('.header');
  const containerEl = document.querySelector('.ble-interface .container');
  const mobileHint = document.querySelector('.mobile-hint');
  const mainSectionEl = document.querySelector('.main-section');

  const deviceSelect = document.getElementById('deviceSelect');
  const editorButton = document.getElementById('editorButton');
  const connectButton = document.getElementById('connectButton');
  const connectBtnTextEl = document.getElementById('connectBtnText');
  const connectionToggle = document.getElementById('connectionToggle');
  const statusIndicatorEl = connectButton?.querySelector('.status-indicator');

  const serialStatusEl = document.getElementById('serialStatus');
  const deviceLabelEl = document.getElementById('currentDevice');
  const connectionTypeValueEl = document.getElementById('connectionTypeValue');

  const groupListEl = document.getElementById('groupList');
  const graphListEl = document.getElementById('graphList');
  const addGroupBtn = document.getElementById('addGroupBtn');
  const editGroupsBtn = document.getElementById('editGroupsBtn');
  const groupPanelDrawer = document.getElementById('groupPanelDrawer');
  const groupPanelOverlay = document.getElementById('groupPanelOverlay');
  const groupPanelToggleBtn = document.getElementById('groupPanelToggleBtn');
  const closeGroupPanelBtn = document.getElementById('closeGroupPanelBtn');

  const refreshModal = document.getElementById('refreshModal');
  const refreshConfirmBtn = document.getElementById('refreshConfirmBtn');
  const refreshCancelBtn = document.getElementById('refreshCancelBtn');
  const newProjectModal = document.getElementById('newProjectModal');
  const newProjectConfirmBtn = document.getElementById('newProjectConfirmBtn');
  const newProjectCancelBtn = document.getElementById('newProjectCancelBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const importCsvBtn = document.getElementById('importCsvBtn');
  const exportModal = document.getElementById('exportModal');
  const exportSelectAll = document.getElementById('exportSelectAll');
  const exportSeparate = document.getElementById('exportSeparate');
  const exportGroupList = document.getElementById('exportGroupList');
  const exportCancelBtn = document.getElementById('exportCancelBtn');
  const exportConfirmBtn = document.getElementById('exportConfirmBtn');
  const importModal = document.getElementById('importModal');
  const importCancelBtn = document.getElementById('importCancelBtn');
  const importSaveBtn = document.getElementById('importSaveBtn');
  const importConfirmBtn = document.getElementById('importConfirmBtn');
  const importFileInput = document.getElementById('importFileInput');
  const newProjectBtn = document.getElementById('newProjectBtn');
  const storageTestBtn = document.getElementById('storageTestBtn');
  const storageClearBtn = document.getElementById('storageClearBtn');
  const storageUsageBtn = document.getElementById('storageUsageBtn');

  const UI_LABEL = { microbit: '마이크로비트', esp32: 'ESP32', orange: '오렌지보드' };
  const isMobileWidth = () => window.matchMedia('(max-width: 900px)').matches;

  const GRAPH_CONFIG = {
    padding: { top: 20, right: 20, bottom: 44, left: 0 },
    axisWidth: 52,
    pxPerSec: 36,
    minWidth: 0,
  };
  const SCROLLBAR_PADDING = 18;
  const FOLD_THRESHOLD = 110;
  const COLOR_PALETTE = ['#667eea', '#38a169', '#f6ad55', '#ed64a6', '#4299e1', '#805ad5'];
  const getCanvasHeight = (bodyHeight) => Math.max(0, bodyHeight - SCROLLBAR_PADDING);
  const TOUCH_LONG_PRESS_MS = 280;
  const TOUCH_MOVE_TOLERANCE = 10;
  const TOUCH_SCROLL_EDGE = 70;
  const TOUCH_SCROLL_SPEED = 12;
  const HOVER_TOLERANCE_PX = 12;

  const groups = [];
  const labelMap = new Map();
  const autoSeriesMap = [];
  let activeDragData = null;
  let activeDropRow = null;
  let activeGroupDropCard = null;
  let groupCounter = 0;
  let seriesCounter = 0;
  let isEditMode = false;
  let isResizingGraph = false;
  let isGroupDragging = false;
  let lastActiveGroupId = null;
  let allowUnload = false;
  let isGroupPanelOpen = false;
  let pendingImportAfterExport = false;
  let isTouchDragging = false;
  let touchDrag = null;
  let touchGhost = null;
  let touchDrop = null;
  let storageWarned = false;
  let storageCheckTimer = null;
  const modalFocusMap = new WeakMap();
  const DUMMY_PREFIX = 'loggerDummy_';
  const DUMMY_DB = 'loggerDummyStorage';
  const DUMMY_STORE = 'chunks';
  const DUMMY_CHUNK_SIZE = 1024 * 100;
  const LOCAL_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;
  const TEXT_ENCODER = new TextEncoder();
  const TEXT_DECODER = new TextDecoder('utf-8');

  function normalizeLabel(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function isLabelAvailable(label, seriesId) {
    const normalized = normalizeLabel(label);
    if (!normalized) return true;
    if (!labelMap.has(normalized)) return true;
    const mapping = labelMap.get(normalized);
    return mapping.seriesId === seriesId;
  }

  function makeUniqueLabel(baseLabel) {
    if (!baseLabel) return '';
    let candidate = baseLabel;
    let index = 1;
    while (!isLabelAvailable(candidate, null)) {
      candidate = `${baseLabel}_${index++}`;
    }
    return candidate;
  }

  function getGroupById(groupId) {
    return groups.find((group) => group.id === groupId) || null;
  }

  function setActiveGroup(group) {
    if (!group) return;
    lastActiveGroupId = group.id;
  }

  function getActiveGroup() {
    if (lastActiveGroupId) {
      const found = getGroupById(lastActiveGroupId);
      if (found) return found;
    }
    return groups[groups.length - 1] || groups[0] || null;
  }

  const STORAGE_KEY = 'loggerState.v1';
  const SAVE_DEBOUNCE_MS = 1200;
  let saveTimer = null;
  let pendingSave = false;

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
    return {
      version: 1,
      lastActiveGroupId,
      autoSeriesMap: autoSeriesMap.slice(),
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
    groups.forEach((group) => {
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

    alignGroupsToGlobalTimeline({ recalc: true });
    return removed > 0;
  }

  function saveState() {
    if (!window.localStorage) return;
    let payload = buildStatePayload();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            scheduleStorageCheck();
            if (trimmed) {
              showNotification('저장 공간이 부족해 오래된 데이터를 삭제했습니다.', 'error');
            }
            return;
          } catch (retryErr) {
            if (!retryErr || retryErr.name !== 'QuotaExceededError') {
              console.warn('Failed to save state', retryErr);
              return;
            }
          }
        }
        showNotification('브라우저 저장 공간이 부족합니다.', 'error');
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
        showNotification(`브라우저 저장 공간이 ${percent}% 사용되었습니다.`, 'error');
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
      if (!window.indexedDB) {
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
    if (!window.localStorage) return Promise.resolve({ written: 0, quotaExceeded: true });
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

  function showNotification(message, type = 'info') {
    try {
      const note = document.createElement('div');
      note.textContent = message;
      note.style.position = 'fixed';
      note.style.right = '16px';
      note.style.bottom = '16px';
      note.style.zIndex = '5000';
      note.style.padding = '10px 14px';
      note.style.borderRadius = '10px';
      note.style.color = '#fff';
      note.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
      note.style.background = type === 'error' ? '#e55353' : '#4a5568';
      document.body.appendChild(note);
      setTimeout(() => {
        note.style.opacity = '0';
        note.style.transition = 'opacity 0.3s';
        setTimeout(() => note.remove(), 300);
      }, 2000);
    } catch (e) {
      console[type === 'error' ? 'error' : 'log'](message);
    }
  }

  function isAnyModalOpen() {
    return (
      refreshModal?.classList.contains('open') ||
      newProjectModal?.classList.contains('open') ||
      exportModal?.classList.contains('open') ||
      importModal?.classList.contains('open')
    );
  }

  function updateBodyScrollLock() {
    document.body.style.overflow = isAnyModalOpen() ? 'hidden' : '';
  }

  function setModalOpen(modal, open) {
    if (!modal) return;
    if (open) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modalFocusMap.set(modal, active);
    } else {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (active && modal.contains(active)) {
        active.blur();
        const fallback = modalFocusMap.get(modal);
        if (fallback && typeof fallback.focus === 'function') {
          fallback.focus();
        }
      }
    }
    modal.classList.toggle('open', open);
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    if ('inert' in modal) {
      modal.inert = !open;
    }
    updateBodyScrollLock();
  }

  function isDeviceConnected() {
    const statusText = serialStatusEl?.textContent || '';
    const statusClass = serialStatusEl?.className || '';
    try {
      if (window.connectionManager?.isConnected?.()) return true;
    } catch (_) {
    }
    if (/status-ready|status-connected/.test(statusClass)) return true;
    if (/connected|연결됨/i.test(statusText)) return true;
    return false;
  }

  function setGroupPanelOpen(open) {
    isGroupPanelOpen = open;
    if (mainSectionEl) {
      mainSectionEl.classList.toggle('group-panel-open', open);
    }
    if (groupPanelDrawer) {
      if (!open) {
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (active && groupPanelDrawer.contains(active)) {
          active.blur();
        }
      }
      groupPanelDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      if ('inert' in groupPanelDrawer) {
        groupPanelDrawer.inert = !open;
      }
    }
    updateBodyScrollLock();
  }

  function showRefreshModal() {
    setModalOpen(refreshModal, true);
  }

  function hideRefreshModal() {
    setModalOpen(refreshModal, false);
  }

  function showNewProjectModal() {
    setModalOpen(newProjectModal, true);
  }

  function hideNewProjectModal() {
    setModalOpen(newProjectModal, false);
  }

  function requestReload() {
    if (!isDeviceConnected()) {
      allowUnload = true;
      saveState();
      window.location.reload();
      return;
    }
    showRefreshModal();
  }

  function getDateStamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  function formatSeconds(sec) {
    if (!Number.isFinite(sec)) return '';
    if (sec === 0) return '0s';
    const fixed = sec % 1 === 0 ? sec.toFixed(0) : sec.toFixed(2);
    const trimmed = fixed.replace(/\.?0+$/, '');
    return `${trimmed || '0'}s`;
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function encodeUtf8(value) {
    return TEXT_ENCODER.encode(String(value));
  }

  function decodeUtf8(value) {
    return TEXT_DECODER.decode(value);
  }

  function wrapImportError(stage, err) {
    const message = err && err.message ? err.message : String(err);
    const error = new Error(`[${stage}] ${message}`);
    error.cause = err;
    return error;
  }

  function getLocalStorageUsageBytes() {
    if (!window.localStorage) return 0;
    let total = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) || '';
      total += (key.length + value.length) * 2;
    }
    return total;
  }

  function logLocalStorageUsage() {
    const used = getLocalStorageUsageBytes();
    const percent = Math.round((used / LOCAL_STORAGE_QUOTA_BYTES) * 100);
    const usedMb = (used / (1024 * 1024)).toFixed(2);
    console.info(`[Storage] localStorage: ${usedMb} MB (${percent}% of 5MB)`);
  }

  function normalizeGroupName(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function makeUniqueGroupName(baseName, nameSet) {
    const safeBase = sanitizeText(baseName) || '그룹';
    let candidate = safeBase;
    let index = 0;
    while (nameSet.has(normalizeGroupName(candidate))) {
      index += 1;
      candidate = `${safeBase}_${index}`;
    }
    nameSet.add(normalizeGroupName(candidate));
    return candidate;
  }

  function safeSheetName(name, index) {
    const fallback = `Group ${index + 1}`;
    const base = sanitizeText(name || '') || fallback;
    const trimmed = base.replace(/[\[\]\*\/\\\:\?]/g, '_').slice(0, 31);
    return trimmed || fallback;
  }

  function buildGroupTable(group) {
    const labels = group.series.map((series) => series.label || '');
    const dataRows = new Map();
    let minTime = Infinity;

    group.series.forEach((series, seriesIndex) => {
      const points = group.graph?.data?.get(series.id) || [];
      points.forEach((pt) => {
        if (!Number.isFinite(pt?.t) || !Number.isFinite(pt?.v)) return;
        minTime = Math.min(minTime, pt.t);
        if (!dataRows.has(pt.t)) {
          dataRows.set(pt.t, Array(labels.length).fill(''));
        }
        dataRows.get(pt.t)[seriesIndex] = pt.v;
      });
    });

    const startTime = Number.isFinite(group.startTime)
      ? group.startTime
      : (minTime === Infinity ? 0 : minTime);

    const rows = Array.from(dataRows.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, values]) => ({
        timeSec: Math.max(0, (time - startTime) / 1000),
        values,
      }));

    return { labels, rows };
  }

  function columnName(index) {
    let name = '';
    let num = index + 1;
    while (num > 0) {
      const rem = (num - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      num = Math.floor((num - 1) / 26);
    }
    return name;
  }

  function buildInlineCell(rowIndex, colIndex, text) {
    const ref = `${columnName(colIndex)}${rowIndex}`;
    return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`;
  }

  function buildNumberCell(rowIndex, colIndex, value) {
    const ref = `${columnName(colIndex)}${rowIndex}`;
    return `<c r="${ref}"><v>${value}</v></c>`;
  }

  function buildSheetXml(table) {
    const rows = [];
    rows.push('<row r="1"/>');

    const headerCells = ['time', ...table.labels]
      .map((label, colIndex) => buildInlineCell(2, colIndex, label))
      .join('');
    rows.push(`<row r="2">${headerCells}</row>`);

    let rowIndex = 3;
    table.rows.forEach((row) => {
      const cells = [];
      cells.push(buildInlineCell(rowIndex, 0, formatSeconds(row.timeSec)));
      row.values.forEach((value, colIndex) => {
        if (Number.isFinite(value)) {
          cells.push(buildNumberCell(rowIndex, colIndex + 1, value));
        }
      });
      rows.push(`<row r="${rowIndex}">${cells.join('')}</row>`);
      rowIndex += 1;
    });

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${rows.join('')}</sheetData>` +
      '</worksheet>'
    );
  }

  function buildWorkbookXml(sheetNames) {
    const sheets = sheetNames
      .map((name, index) => (
        `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
      ))
      .join('');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets>${sheets}</sheets>` +
      '</workbook>'
    );
  }

  function buildWorkbookRelsXml(sheetCount) {
    const rels = [];
    for (let i = 0; i < sheetCount; i += 1) {
      rels.push(
        `<Relationship Id="rId${i + 1}" ` +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
        `Target="worksheets/sheet${i + 1}.xml"/>`
      );
    }
    rels.push(
      `<Relationship Id="rId${sheetCount + 1}" ` +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" ' +
      'Target="styles.xml"/>'
    );
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels.join('') +
      '</Relationships>'
    );
  }

  function buildRootRelsXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" ' +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ' +
      'Target="xl/workbook.xml"/>' +
      '</Relationships>'
    );
  }

  function buildContentTypesXml(sheetCount) {
    const overrides = [];
    for (let i = 0; i < sheetCount; i += 1) {
      overrides.push(
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ` +
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      );
    }
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ' +
      'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ' +
      'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      overrides.join('') +
      '</Types>'
    );
  }

  function buildStylesXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font></fonts>' +
      '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }

  function makeCrcTable() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let crc = i;
      for (let j = 0; j < 8; j += 1) {
        crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
      table[i] = crc >>> 0;
    }
    return table;
  }

  const CRC_TABLE = makeCrcTable();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function concatBytes(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }

  function buildZip(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach((entry) => {
      const nameBytes = encodeUtf8(entry.name);
      const data = entry.data instanceof Uint8Array ? entry.data : encodeUtf8(entry.data);
      const crc = crc32(data);

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, 0, true);
      localView.setUint16(12, 0, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      localParts.push(localHeader, data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, 0, true);
      centralView.setUint16(14, 0, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      centralParts.push(centralHeader);

      offset += localHeader.length + data.length;
    });

    const centralDirectory = concatBytes(centralParts);
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, entries.length, true);
    eocdView.setUint16(10, entries.length, true);
    eocdView.setUint32(12, centralDirectory.length, true);
    eocdView.setUint32(16, offset, true);
    eocdView.setUint16(20, 0, true);

    return concatBytes([...localParts, centralDirectory, eocd]);
  }

  function buildXlsx(groupsToExport) {
    const sheets = groupsToExport.map((group, index) => {
      const table = buildGroupTable(group);
      const name = safeSheetName(group.name, index);
      return { name, xml: buildSheetXml(table) };
    });

    const entries = [
      { name: '[Content_Types].xml', data: buildContentTypesXml(sheets.length) },
      { name: '_rels/.rels', data: buildRootRelsXml() },
      { name: 'xl/workbook.xml', data: buildWorkbookXml(sheets.map((sheet) => sheet.name)) },
      { name: 'xl/_rels/workbook.xml.rels', data: buildWorkbookRelsXml(sheets.length) },
      { name: 'xl/styles.xml', data: buildStylesXml() },
    ];

    sheets.forEach((sheet, index) => {
      entries.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: sheet.xml });
    });

    return buildZip(entries);
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportSelectedGroups(selectedGroups, options = {}) {
    const separate = options.separate !== false;
    if (!selectedGroups.length) {
      showNotification('내보낼 그룹을 선택해 주세요.', 'error');
      return false;
    }
    if (separate) {
      selectedGroups.forEach((group, index) => {
        const workbook = buildXlsx([group]);
        const name = `${safeSheetName(group.name, index)}-${getDateStamp()}.xlsx`;
        downloadFile(workbook, name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      });
    } else {
      const workbook = buildXlsx(selectedGroups);
      const name = `sensor-data-${getDateStamp()}.xlsx`;
      downloadFile(workbook, name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    return true;
  }

  function renderExportList() {
    if (!exportGroupList) return;
    exportGroupList.innerHTML = '';
    groups.forEach((group) => {
      const label = document.createElement('label');
      label.className = 'modal-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = group.id;
      input.checked = true;
      const text = document.createElement('span');
      text.textContent = `${group.name} (${group.series.length}채널)`;
      label.appendChild(input);
      label.appendChild(text);
      exportGroupList.appendChild(label);
    });
  }

  function getSelectedGroupIds() {
    if (!exportGroupList) return [];
    const inputs = Array.from(exportGroupList.querySelectorAll('input[type="checkbox"]'));
    return inputs.filter((input) => input.checked).map((input) => input.value);
  }

  function openExportModal() {
    if (groups.length <= 1) {
      const ok = exportSelectedGroups(groups.slice(0, 1), { separate: true });
      if (ok && pendingImportAfterExport) {
        pendingImportAfterExport = false;
        setTimeout(() => importFileInput?.click(), 200);
      }
      return;
    }
    renderExportList();
    if (exportSelectAll) {
      exportSelectAll.checked = true;
    }
    if (exportSeparate) {
      exportSeparate.checked = true;
    }
    setModalOpen(exportModal, true);
  }

  function closeExportModal() {
    setModalOpen(exportModal, false);
  }

  function openImportModal() {
    setModalOpen(importModal, true);
  }

  function closeImportModal() {
    setModalOpen(importModal, false);
  }

  function parseTimeToSec(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) return null;
    const trimmed = value.endsWith('s') ? value.slice(0, -1) : value;
    const num = Number.parseFloat(trimmed);
    if (!Number.isFinite(num) || num < 0) return null;
    return num;
  }

  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let current = '';
    let inQuotes = false;
    const input = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      if (inQuotes) {
        if (char === '"') {
          if (input[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(current);
        current = '';
      } else if (char === '\n') {
        row.push(current);
        rows.push(row);
        row = [];
        current = '';
      } else if (char === '\r') {
        continue;
      } else {
        current += char;
      }
    }
    if (current.length || row.length) {
      row.push(current);
      rows.push(row);
    }
    return rows;
  }

  function parseRowsToTable(rows, name, sourceLabel) {
    const normalized = rows.map((cells) => (
      (Array.isArray(cells) ? cells : []).map((cell) => String(cell ?? '').trim())
    ));
    if (normalized.length < 2) throw new Error(`${sourceLabel} 파일이 비어 있습니다.`);

    const header = normalized[1] || [];
    if (!header.length || normalizeLabel(header[0]) !== 'time') {
      throw new Error(`${sourceLabel} 형식이 올바르지 않습니다. (2번째 행)`);
    }
    const labels = header.slice(1).map((label) => sanitizeText(label)).filter(Boolean);
    if (!labels.length) throw new Error('라벨이 없습니다.');

    const dataRows = [];
    for (let i = 2; i < normalized.length; i += 1) {
      const cells = normalized[i] || [];
      if (!cells.length || cells.every((cell) => cell === '')) continue;
      const timeSec = parseTimeToSec(cells[0]);
      if (timeSec === null) throw new Error('시간 형식이 올바르지 않습니다.');
      const values = labels.map((_, index) => {
        const value = Number.parseFloat(cells[index + 1]);
        return Number.isFinite(value) ? value : null;
      });
      dataRows.push({ timeSec, values });
    }
    return { name, labels, rows: dataRows };
  }

  function parseCsvTable(text, name) {
    const rows = parseCsvRows(text);
    return parseRowsToTable(rows, name, 'CSV');
  }

  function parseWorksheetRow(row, cellTag) {
    const cells = [];
    let colIndex = 0;
    const cellNodes = Array.from(row.getElementsByTagName(cellTag));
    cellNodes.forEach((cell) => {
      const indexAttr = cell.getAttribute('ss:Index') || cell.getAttribute('Index');
      if (indexAttr) {
        const target = Number.parseInt(indexAttr, 10) - 1;
        while (colIndex < target) {
          cells.push('');
          colIndex += 1;
        }
      }
      const dataNode = cell.getElementsByTagName('Data')[0];
      cells.push(dataNode ? dataNode.textContent || '' : '');
      colIndex += 1;
    });
    return cells;
  }

  function parseSpreadsheetXml(text) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('파일을 읽을 수 없습니다.');
    }
    const worksheets = Array.from(doc.getElementsByTagName('Worksheet'));
    if (!worksheets.length) throw new Error('워크시트를 찾을 수 없습니다.');
    const tables = [];
    worksheets.forEach((sheet, index) => {
      const name = sheet.getAttribute('ss:Name') || sheet.getAttribute('Name') || `그룹 ${index + 1}`;
      const tableNode = sheet.getElementsByTagName('Table')[0];
      if (!tableNode) return;
      const rows = Array.from(tableNode.getElementsByTagName('Row'));
      if (!rows.length) return;
      const parsedRows = rows.map((row) => parseWorksheetRow(row, 'Cell'));
      tables.push(parseRowsToTable(parsedRows, name, '엑셀'));
    });
    if (!tables.length) throw new Error('데이터가 없습니다.');
    return tables;
  }

  function columnLettersToIndex(letters) {
    let index = 0;
    for (let i = 0; i < letters.length; i += 1) {
      index = index * 26 + (letters.charCodeAt(i) - 64);
    }
    return Math.max(0, index - 1);
  }

  function parseSharedStrings(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return [];
    const items = Array.from(doc.getElementsByTagName('si'));
    return items.map((item) => {
      const texts = Array.from(item.getElementsByTagName('t')).map((node) => node.textContent || '');
      return texts.join('');
    });
  }

  function parseSheetXmlRows(xml, sharedStrings) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('엑셀 형식이 올바르지 않습니다.');
    }
    const rows = [];
    const rowNodes = Array.from(doc.getElementsByTagName('row'));
    rowNodes.forEach((rowNode) => {
      const rowIndex = Number.parseInt(rowNode.getAttribute('r'), 10) || rows.length + 1;
      const cells = [];
      let fallbackCol = 0;
      const cellNodes = Array.from(rowNode.getElementsByTagName('c'));
      cellNodes.forEach((cell) => {
        const ref = cell.getAttribute('r') || '';
        const letters = ref.replace(/[0-9]/g, '');
        const colIndex = letters ? columnLettersToIndex(letters) : fallbackCol;
        fallbackCol = colIndex + 1;

        const type = cell.getAttribute('t');
        let value = '';
        if (type === 'inlineStr') {
          const textNodes = Array.from(cell.getElementsByTagName('t'));
          value = textNodes.map((node) => node.textContent || '').join('');
        } else {
          const vNode = cell.getElementsByTagName('v')[0];
          const raw = vNode ? vNode.textContent || '' : '';
          if (type === 's') {
            const idx = Number.parseInt(raw, 10);
            value = Number.isFinite(idx) ? (sharedStrings[idx] || '') : '';
          } else {
            value = raw;
          }
        }
        cells[colIndex] = value;
      });
      rows[rowIndex - 1] = cells.map((cell) => cell ?? '');
    });
    return rows.filter(Boolean);
  }

  function parseWorkbookRels(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const rels = new Map();
    Array.from(doc.getElementsByTagName('Relationship')).forEach((rel) => {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target) rels.set(id, target);
    });
    return rels;
  }

  function parseZip(buffer) {
    const view = new DataView(buffer);
    let eocdOffset = -1;
    const maxSearch = Math.max(0, buffer.byteLength - 22 - 0xffff);
    for (let i = buffer.byteLength - 22; i >= maxSearch; i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error('ZIP 구조를 찾을 수 없습니다.');

    const centralSize = view.getUint32(eocdOffset + 12, true);
    const centralOffset = view.getUint32(eocdOffset + 16, true);
    const entries = new Map();
    let ptr = centralOffset;
    while (ptr < centralOffset + centralSize) {
      if (view.getUint32(ptr, true) !== 0x02014b50) break;
      const method = view.getUint16(ptr + 10, true);
      const compressedSize = view.getUint32(ptr + 20, true);
      const uncompressedSize = view.getUint32(ptr + 24, true);
      const nameLength = view.getUint16(ptr + 28, true);
      const extraLength = view.getUint16(ptr + 30, true);
      const commentLength = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const nameBytes = new Uint8Array(buffer, ptr + 46, nameLength);
      const name = decodeUtf8(nameBytes);
      entries.set(name, {
        name,
        method,
        compressedSize,
        uncompressedSize,
        localOffset,
      });
      ptr += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  function getZipEntryData(entry, buffer) {
    const view = new DataView(buffer);
    const offset = entry.localOffset;
    if (view.getUint32(offset, true) !== 0x04034b50) {
      throw new Error('ZIP 엔트리를 읽을 수 없습니다.');
    }
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataOffset = offset + 30 + nameLength + extraLength;
    return new Uint8Array(buffer, dataOffset, entry.compressedSize);
  }

  async function inflateRaw(data) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('브라우저에서 XLSX 압축 해제 기능을 지원하지 않습니다.');
    }
    let stream = null;
    try {
      stream = new DecompressionStream('deflate-raw');
    } catch (err) {
      stream = new DecompressionStream('deflate');
    }
    const decompressed = await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer();
    return new Uint8Array(decompressed);
  }

  async function readZipEntry(entry, buffer) {
    const data = getZipEntryData(entry, buffer);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateRaw(data);
    throw new Error(`지원하지 않는 압축 방식입니다. (method=${entry.method})`);
  }

  async function readZipEntryText(entries, buffer, name) {
    const entry = entries.get(name);
    if (!entry) return null;
    const bytes = await readZipEntry(entry, buffer);
    return decodeUtf8(bytes);
  }

  async function parseXlsx(buffer) {
    let entries = null;
    try {
      entries = parseZip(buffer);
    } catch (err) {
      throw wrapImportError('ZIP', err);
    }

    let workbookXml = null;
    let relsXml = null;
    try {
      workbookXml = await readZipEntryText(entries, buffer, 'xl/workbook.xml');
      relsXml = await readZipEntryText(entries, buffer, 'xl/_rels/workbook.xml.rels');
    } catch (err) {
      throw wrapImportError('XLSX 기본 파일', err);
    }
    if (!workbookXml || !relsXml) {
      throw new Error('[XLSX] workbook.xml 또는 rels를 찾을 수 없습니다.');
    }

    let workbookDoc = null;
    let sheetNodes = [];
    try {
      const parser = new DOMParser();
      workbookDoc = parser.parseFromString(workbookXml, 'application/xml');
      sheetNodes = Array.from(workbookDoc.getElementsByTagName('sheet'));
    } catch (err) {
      throw wrapImportError('workbook.xml 파싱', err);
    }
    if (!sheetNodes.length) throw new Error('워크시트를 찾을 수 없습니다.');

    let rels = null;
    try {
      rels = parseWorkbookRels(relsXml);
    } catch (err) {
      throw wrapImportError('워크시트 관계 파일', err);
    }

    let sharedStrings = [];
    try {
      const sharedStringsXml = await readZipEntryText(entries, buffer, 'xl/sharedStrings.xml');
      sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
    } catch (err) {
      throw wrapImportError('sharedStrings.xml', err);
    }

    const tables = [];
    for (const sheet of sheetNodes) {
      const name = sheet.getAttribute('name') || '그룹';
      const relId = sheet.getAttribute('r:id');
      const target = relId ? rels.get(relId) : null;
      if (!target) {
        throw new Error(`[XLSX] 시트 관계를 찾을 수 없습니다: ${name}`);
      }
      const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      let sheetXml = null;
      try {
        sheetXml = await readZipEntryText(entries, buffer, sheetPath);
      } catch (err) {
        throw wrapImportError(`시트 로드 (${name})`, err);
      }
      if (!sheetXml) continue;
      try {
        const rows = parseSheetXmlRows(sheetXml, sharedStrings);
        tables.push(parseRowsToTable(rows, name, 'XLSX'));
      } catch (err) {
        throw wrapImportError(`시트 파싱 (${name})`, err);
      }
    }

    if (!tables.length) throw new Error('데이터가 없습니다.');
    return tables;
  }

  async function parseWithSheetJs(buffer, fallbackName) {
    if (!window.XLSX || typeof window.XLSX.read !== 'function') {
      throw new Error('SheetJS를 불러올 수 없습니다.');
    }
    let workbook = null;
    try {
      workbook = window.XLSX.read(buffer, { type: 'array' });
    } catch (err) {
      throw wrapImportError('SheetJS 읽기', err);
    }
    const tables = [];
    const sheetNames = workbook.SheetNames || [];
    sheetNames.forEach((sheetName, index) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;
      const rows = window.XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: true,
        defval: '',
      });
      if (rows.length && normalizeLabel(rows[0]?.[0]) === 'time') {
        rows.unshift([]);
      }
      const name = sheetName || fallbackName || `그룹 ${index + 1}`;
      tables.push(parseRowsToTable(rows, name, '엑셀'));
    });
    if (!tables.length) throw new Error('데이터가 없습니다.');
    return tables;
  }

  function buildImportPayload(tables) {
    const payload = { version: 1, groups: [], autoSeriesMap: [], lastActiveGroupId: null };
    const labelSet = new Set();
    const nameSet = new Set();
    let groupIndex = 0;
    let seriesIndex = 0;
    const now = Date.now();

    tables.forEach((table) => {
      const baseLabels = table.labels.map((label) => sanitizeText(label)).filter(Boolean);
      const labels = baseLabels.map((label) => {
        let candidate = label;
        let index = 0;
        let normalized = normalizeLabel(candidate);
        while (!normalized || labelSet.has(normalized)) {
          index += 1;
          candidate = `${label}_${index}`;
          normalized = normalizeLabel(candidate);
        }
        labelSet.add(normalized);
        return candidate;
      });

      const groupId = `group-${++groupIndex}`;
      const series = labels.map((label) => {
        const id = `series-${++seriesIndex}`;
        const color = COLOR_PALETTE[(seriesIndex - 1) % COLOR_PALETTE.length];
        return { id, label, color };
      });

      const maxSec = table.rows.reduce((acc, row) => Math.max(acc, row.timeSec), 0);
      const baseTime = now - maxSec * 1000;
      const data = {};
      series.forEach((item) => {
        data[item.id] = [];
      });

      table.rows.forEach((row) => {
        const t = baseTime + row.timeSec * 1000;
        row.values.forEach((value, idx) => {
          if (!Number.isFinite(value)) return;
          data[series[idx].id].push({ t, v: value });
        });
      });

      const baseName = sanitizeText(table.name) || `그룹 ${groupIndex}`;
      const name = makeUniqueGroupName(baseName, nameSet);
      payload.groups.push({
        id: groupId,
        name,
        series,
        data,
        bodyHeight: null,
        isFolded: false,
      });
    });

    payload.lastActiveGroupId = payload.groups[payload.groups.length - 1]?.id || null;
    return payload;
  }

  function applyState(payload) {
    groups.forEach((group) => group.elements.resizeObserver?.disconnect?.());
    groups.splice(0, groups.length);
    labelMap.clear();
    autoSeriesMap.length = 0;
    lastActiveGroupId = null;
    groupCounter = 0;
    seriesCounter = 0;

    if (groupListEl) groupListEl.innerHTML = '';
    if (graphListEl) graphListEl.innerHTML = '';

    if (!payload || !Array.isArray(payload.groups)) return false;

    payload.groups.forEach((groupState) => {
      createGroupFromState(groupState);
    });

    payload.groups.forEach((groupState) => {
      const group = getGroupById(groupState?.id);
      if (!group) return;
      if (Number.isFinite(groupState?.bodyHeight) && group.elements.body) {
        group.elements.body.style.height = `${groupState.bodyHeight}px`;
      }
      if (groupState?.isFolded) {
        foldGroup(group, group.elements.body?.clientHeight || groupState.bodyHeight || 0);
      }
      restoreGroupData(group, groupState);
    });

    if (Array.isArray(payload.autoSeriesMap)) {
      payload.autoSeriesMap.forEach((seriesId, index) => {
        if (typeof seriesId !== 'string') {
          autoSeriesMap[index] = null;
          return;
        }
        const found = findSeriesById(seriesId);
        autoSeriesMap[index] = found ? seriesId : null;
      });
    }

    if (typeof payload.lastActiveGroupId === 'string' && getGroupById(payload.lastActiveGroupId)) {
      lastActiveGroupId = payload.lastActiveGroupId;
    } else {
      lastActiveGroupId = groups[groups.length - 1]?.id || groups[0]?.id || null;
    }

    alignGroupsToGlobalTimeline();
    refreshDeleteStates();
    return groups.length > 0;
  }

  function importFromText(text, fileName) {
    const safeName = sanitizeText(fileName?.replace(/\.[^/.]+$/, '')) || '가져오기';
    const normalizedText = text.replace(/^\uFEFF/, '');
    let tables = null;
    if (normalizedText.trim().startsWith('<')) {
      tables = parseSpreadsheetXml(normalizedText);
    } else {
      tables = [parseCsvTable(normalizedText, safeName)];
    }
    const payload = buildImportPayload(tables);
    setGroupPanelOpen(false);
    localStorage.removeItem(STORAGE_KEY);
    applyState(payload);
    saveState();
  }

  async function importFromFiles(files) {
    const tables = [];
    for (const file of files) {
      const safeName = sanitizeText(file.name?.replace(/\.[^/.]+$/, '')) || '가져오기';
      const ext = (file.name || '').split('.').pop().toLowerCase();
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
      const canUseSheetJs = !!(window.XLSX && typeof window.XLSX.read === 'function');

      if (ext === 'xlsx' || ext === 'xls' || isZip) {
        try {
          if (canUseSheetJs) {
            const parsed = await parseWithSheetJs(buffer, safeName);
            parsed.forEach((table) => {
              if (!table.name) table.name = safeName;
              tables.push(table);
            });
            continue;
          }
          if (ext === 'xlsx' || isZip) {
            const parsed = await parseXlsx(buffer);
            parsed.forEach((table) => {
              if (!table.name) table.name = safeName;
              tables.push(table);
            });
            continue;
          }
        } catch (err) {
          if (ext === 'xls') {
            const textFallback = decodeUtf8(bytes).replace(/^\uFEFF/, '');
            if (textFallback.trim().startsWith('<')) {
              const parsed = parseSpreadsheetXml(textFallback);
              parsed.forEach((table) => {
                if (!table.name) table.name = safeName;
                tables.push(table);
              });
              continue;
            }
          }
          throw err;
        }
      }

      const text = decodeUtf8(bytes);
      const normalizedText = text.replace(/^\uFEFF/, '');
      if (normalizedText.trim().startsWith('<')) {
        const parsed = parseSpreadsheetXml(normalizedText);
        parsed.forEach((table) => {
          if (!table.name) table.name = safeName;
          tables.push(table);
        });
        continue;
      }

      if (ext === 'xls') {
        throw new Error('XLS 파일은 SheetJS가 필요합니다.');
      }

      tables.push(parseCsvTable(normalizedText, safeName));
    }
    if (!tables.length) {
      throw new Error('가져올 데이터가 없습니다.');
    }
    const payload = buildImportPayload(tables);
    setGroupPanelOpen(false);
    localStorage.removeItem(STORAGE_KEY);
    applyState(payload);
    saveState();
  }

  function resetProject() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear logger state', err);
    }
    setGroupPanelOpen(false);
    applyState({ version: 1, groups: [], autoSeriesMap: [], lastActiveGroupId: null });
    createGroup();
  }

  function fillStorageForTest() {
    if (!window.localStorage) return;
    storageWarned = false;
    const key = `${DUMMY_PREFIX}blob`;
    const targetBytes = Math.floor(LOCAL_STORAGE_QUOTA_BYTES * 0.82);
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
    }
    const baseUsage = getLocalStorageUsageBytes();
    const neededBytes = Math.max(0, targetBytes - baseUsage);
    const targetChars = Math.max(1, Math.ceil(neededBytes / 2));
    const value = '0'.repeat(targetChars);
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      if (err && err.name === 'QuotaExceededError') {
        showNotification('로컬 스토리지 용량이 부족합니다.', 'error');
      } else {
        showNotification('용량 테스트 데이터 저장 중 오류가 발생했습니다.', 'error');
      }
      console.warn('Failed to fill localStorage', err);
      return;
    }

    const finalUsage = getLocalStorageUsageBytes();
    const percent = Math.round((finalUsage / LOCAL_STORAGE_QUOTA_BYTES) * 100);
    if (finalUsage >= targetBytes) {
      showNotification(`로컬 스토리지 사용량이 ${percent}% 입니다.`, 'error');
    } else {
      showNotification('용량 테스트를 진행했지만 80%에 도달하지 못했습니다.', 'error');
    }

    checkStorageUsage({ forceToast: true });
    scheduleStorageWarningCheck();
  }

  async function clearStorageTestData() {
    if (window.localStorage) {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(DUMMY_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    }
    if (window.indexedDB) {
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

  function setConnectBtnText(text) {
    if (connectBtnTextEl) connectBtnTextEl.textContent = text;
    else if (connectButton) connectButton.textContent = text;
  }

  function updateStatusIndicator(status) {
    if (!statusIndicatorEl) return;
    statusIndicatorEl.classList.remove('status-connected', 'status-connecting', 'status-disconnected');
    if (status === 'connected') statusIndicatorEl.classList.add('status-connected');
    else if (status === 'connecting') statusIndicatorEl.classList.add('status-connecting');
    else statusIndicatorEl.classList.add('status-disconnected');
  }

  function renderStatus(statusText, status) {
    const isConnected = status === 'connected';
    const isConnecting = status === 'connecting';
    const fallback = isConnected ? '연결됨' : isConnecting ? '연결 중...' : '연결 안 됨';
    if (serialStatusEl) {
      serialStatusEl.textContent = statusText || fallback;
      serialStatusEl.className = `status-value ${isConnected ? 'status-ready' : isConnecting ? 'status-waiting' : 'status-disconnected'}`;
    }
    updateStatusIndicator(status);
  }

  function updateConnTypeLabel() {
    if (connectionTypeValueEl) {
      connectionTypeValueEl.textContent = window.isBluetoothMode ? '블루투스' : '시리얼';
    }
  }

  function applyThemeByDevice(ui) {
    const body = document.body;
    body.classList.remove('theme-esp32', 'theme-orange', 'theme-microbit');
    if (ui === 'esp32') body.classList.add('theme-esp32');
    else if (ui === 'orange') body.classList.add('theme-orange');
    else body.classList.add('theme-microbit');
  }

  function updateLayoutPadding() {
    if (!headerEl || !containerEl) return;
    const rect = headerEl.getBoundingClientRect();
    const topPadding = Math.max(0, rect.height + 30);
    containerEl.style.paddingTop = `${topPadding}px`;
  }

  function setToggleState(isBluetooth) {
    if (!connectionToggle) return;
    connectionToggle.classList.toggle('active', isBluetooth);
    connectionToggle.setAttribute('aria-checked', isBluetooth ? 'true' : 'false');
  }

  function enforceMobileBleMode() {
    window.isBluetoothMode = true;
    window.AppState.setTransport('ble');
    window.connectionManager.setTransport('ble');

    setToggleState(true);
    connectionToggle?.classList.add('locked');
    if (connectionToggle) {
      connectionToggle.style.pointerEvents = 'none';
      connectionToggle.setAttribute('aria-disabled', 'true');
    }

    setConnectBtnText('블루투스 연결');
    try { window.closeSerialPort && window.closeSerialPort(); } catch (_) {}
    updateConnTypeLabel();
  }

  function releaseDesktopMode() {
    connectionToggle?.classList.remove('locked');
    if (connectionToggle) {
      connectionToggle.removeAttribute('aria-disabled');
      connectionToggle.style.pointerEvents = '';
    }
    setToggleState(!!window.isBluetoothMode);
    setConnectBtnText(window.isBluetoothMode ? '블루투스 연결' : '시리얼 연결');
    updateConnTypeLabel();
  }

  function handleMobileModeMaybeChanged() {
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle/i.test(navigator.userAgent);
    window.isMobileDevice = mobile;
    if (mobile) enforceMobileBleMode();
    else releaseDesktopMode();
  }

  let previousDesktopCollapsed = false;
  let headerPlaceholder = null;

  function moveToOverlay() {
    if (!headerSettingsBar || !overlayMount) return;
    if (headerSettingsBar.parentNode === overlayMount) {
      if (mobileHint) mobileHint.style.display = 'block';
      if (headerToggleBtn) headerToggleBtn.style.display = 'none';
      return;
    }
    previousDesktopCollapsed = headerSettingsBar.classList.contains('closed');
    headerSettingsBar.classList.remove('closed');
    if (!headerPlaceholder) {
      headerPlaceholder = document.createElement('div');
      headerPlaceholder.id = 'headerSettingsPlaceholder';
      headerSettingsBar.parentNode?.insertBefore(headerPlaceholder, headerSettingsBar);
    }
    overlayMount.appendChild(headerSettingsBar);
    if (mobileHint) mobileHint.style.display = 'block';
    if (headerToggleBtn) headerToggleBtn.style.display = 'none';
  }

  function moveToDesktop() {
    if (!headerSettingsBar || !headerPlaceholder || !headerPlaceholder.parentNode) return;
    if (headerSettingsBar.previousSibling !== headerPlaceholder) {
      headerPlaceholder.parentNode.insertBefore(headerSettingsBar, headerPlaceholder);
    }
    headerPlaceholder.remove();
    headerPlaceholder = null;
    if (mobileHint) mobileHint.style.display = 'none';
    if (headerToggleBtn) headerToggleBtn.style.display = '';
    if (previousDesktopCollapsed) {
      headerSettingsBar.classList.add('closed');
      headerToggleBtn?.classList.add('closed');
    } else {
      headerSettingsBar.classList.remove('closed');
      headerToggleBtn?.classList.remove('closed');
    }
  }

  function applyLayout() {
    if (isMobileWidth()) {
      moveToOverlay();
    } else {
      moveToDesktop();
      if (navOverlay?.classList.contains('open')) {
        navOverlay.classList.remove('open');
        hamburgerBtn?.classList.remove('open');
        document.body.style.overflow = '';
      }
    }
    updateLayoutPadding();
  }

  function sanitizeText(value) {
    return (value ?? '')
      .toString()
      .replace(/[<>&"'`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function createSeries(groupId, label) {
    const seriesId = `series-${++seriesCounter}`;
    const color = COLOR_PALETTE[(seriesCounter - 1) % COLOR_PALETTE.length];
    const safeLabel = sanitizeText(label) || 'sensor';
    const uniqueLabel = makeUniqueLabel(safeLabel);
    const normalizedLabel = normalizeLabel(uniqueLabel);
    const series = { id: seriesId, groupId, label: uniqueLabel, color, normalizedLabel };
    if (normalizedLabel) labelMap.set(normalizedLabel, { groupId, seriesId });
    return series;
  }

  function updateLabelMap(series, group) {
    if (series.normalizedLabel) {
      labelMap.delete(series.normalizedLabel);
    }
    series.normalizedLabel = normalizeLabel(series.label);
    if (series.normalizedLabel) {
      labelMap.set(series.normalizedLabel, { groupId: group.id, seriesId: series.id });
    }
  }

  function createGroup(name) {
    const groupId = `group-${++groupCounter}`;
    const groupName = sanitizeText(name) || `그룹 ${groupCounter}`;
    const series = [createSeries(groupId, `sensor_${groupCounter}`)];
    const group = {
      id: groupId,
      name: groupName,
      series,
      graph: null,
      startTime: null,
      lastTime: null,
      displayStartTime: null,
      lastBodyHeight: null,
      isFollowing: true,
      isFolded: false,
      elements: {},
    };
    groups.push(group);
    setActiveGroup(group);
    renderGroupListItem(group);
    renderGraphCard(group);
    refreshDeleteStates();
    scheduleSave();
    return group;
  }

  function syncCounterFromId(id, prefix, current) {
    if (typeof id !== 'string') return current;
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
    if (!match) return current;
    const value = Number.parseInt(match[1], 10);
    if (!Number.isFinite(value)) return current;
    return Math.max(current, value);
  }

  function createSeriesFromState(groupId, stateSeries, fallbackIndex) {
    let seriesId = typeof stateSeries?.id === 'string' ? stateSeries.id : null;
    if (!seriesId || findSeriesById(seriesId)) {
      seriesId = `series-${++seriesCounter}`;
    } else {
      seriesCounter = syncCounterFromId(seriesId, 'series', seriesCounter);
    }
    const rawLabel = sanitizeText(stateSeries?.label) || `sensor_${fallbackIndex + 1}`;
    const safeLabel = isLabelAvailable(rawLabel, null) ? rawLabel : makeUniqueLabel(rawLabel);
    const color = stateSeries?.color || COLOR_PALETTE[(seriesCounter - 1) % COLOR_PALETTE.length];
    const normalizedLabel = normalizeLabel(safeLabel);
    const series = { id: seriesId, groupId, label: safeLabel, color, normalizedLabel };
    if (normalizedLabel) labelMap.set(normalizedLabel, { groupId, seriesId });
    return series;
  }

  function createGroupFromState(state) {
    let groupId = typeof state?.id === 'string' ? state.id : null;
    if (!groupId || getGroupById(groupId)) {
      groupId = `group-${++groupCounter}`;
    } else {
      groupCounter = syncCounterFromId(groupId, 'group', groupCounter);
    }
    const groupName = sanitizeText(state?.name) || `그룹 ${groupCounter}`;
    const stateSeries = Array.isArray(state?.series) ? state.series : [];
    const series = stateSeries.length
      ? stateSeries.map((seriesState, index) => createSeriesFromState(groupId, seriesState, index))
      : [createSeries(groupId, `sensor_${groupCounter}`)];
    const group = {
      id: groupId,
      name: groupName,
      series,
      graph: null,
      startTime: null,
      lastTime: null,
      displayStartTime: null,
      lastBodyHeight: Number.isFinite(state?.bodyHeight) ? state.bodyHeight : null,
      isFollowing: true,
      isFolded: false,
      elements: {},
    };
    groups.push(group);
    setActiveGroup(group);
    renderGroupListItem(group);
    renderGraphCard(group);
    refreshDeleteStates();
    return group;
  }

  function restoreGroupData(group, state) {
    if (!group || !group.graph) return;
    const rawData = state?.data || {};
    let minTime = Infinity;
    let maxTime = -Infinity;
    let hasData = false;
    group.series.forEach((series) => {
      const points = Array.isArray(rawData[series.id]) ? rawData[series.id] : [];
      const sanitized = [];
      points.forEach((pt) => {
        const t = Number(pt?.t);
        const v = Number(pt?.v);
        if (!Number.isFinite(t) || !Number.isFinite(v)) return;
        hasData = true;
        minTime = Math.min(minTime, t);
        maxTime = Math.max(maxTime, t);
        sanitized.push({ t, v });
      });
      group.graph.data.set(series.id, sanitized);
    });

    if (hasData) {
      group.startTime = minTime;
      group.lastTime = maxTime;
      group.displayStartTime = minTime;
      group.graph.setStartTime(minTime);
      if (!group.isFolded) {
        syncGraphSize(group, maxTime);
        group.graph.render();
        const scroll = group.elements.scroll;
        if (scroll) {
          scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
        }
      }
    }
  }

  function getGroupRangeFromData(group) {
    if (!group || !group.graph?.data) return null;
    let minTime = Infinity;
    let maxTime = -Infinity;
    let hasData = false;
    group.series.forEach((series) => {
      const points = group.graph.data.get(series.id) || [];
      points.forEach((pt) => {
        const t = Number(pt?.t);
        const v = Number(pt?.v);
        if (!Number.isFinite(t) || !Number.isFinite(v)) return;
        hasData = true;
        minTime = Math.min(minTime, t);
        maxTime = Math.max(maxTime, t);
      });
    });
    if (!hasData) return null;
    return { minTime, maxTime, duration: Math.max(0, maxTime - minTime) };
  }

  function updateGroupRangeFromData(group) {
    const range = getGroupRangeFromData(group);
    if (range) {
      group.startTime = range.minTime;
      group.lastTime = range.maxTime;
    } else {
      group.startTime = null;
      group.lastTime = null;
    }
    return range;
  }

  function getGroupRange(group) {
    if (Number.isFinite(group.startTime) && Number.isFinite(group.lastTime)) {
      return {
        minTime: group.startTime,
        maxTime: group.lastTime,
        duration: Math.max(0, group.lastTime - group.startTime),
      };
    }
    return updateGroupRangeFromData(group);
  }

  function alignGroupsToGlobalTimeline(options = {}) {
    if (!groups.length) return;
    const recalc = options.recalc === true;
    const ranges = new Map();
    let globalMax = -Infinity;
    let maxDuration = 0;

    groups.forEach((group) => {
      const range = recalc ? updateGroupRangeFromData(group) : getGroupRange(group);
      ranges.set(group.id, range);
      if (range) {
        globalMax = Math.max(globalMax, range.maxTime);
        maxDuration = Math.max(maxDuration, range.duration);
      }
    });

    if (!Number.isFinite(globalMax)) {
      groups.forEach((group) => {
        group.displayStartTime = null;
        syncGraphSize(group);
        if (!group.isFolded) group.graph?.render();
      });
      return;
    }

    const globalStart = globalMax - maxDuration;

    groups.forEach((group) => {
      const range = ranges.get(group.id);
      const scroll = group.elements.scroll;
      if (!range) {
        group.startTime = null;
        group.lastTime = null;
        group.displayStartTime = null;
        if (Number.isFinite(group.startTime)) {
          group.graph?.setStartTime(group.startTime);
        }
        syncGraphSize(group);
        if (!group.isFolded) group.graph?.render();
        if (scroll) scroll.scrollLeft = 0;
        return;
      }

      group.displayStartTime = globalStart;
      group.graph?.setStartTime(globalStart);
      const wasFollowing = group.isFollowing;
      const prevScrollLeft = scroll ? scroll.scrollLeft : 0;
      syncGraphSize(group, globalMax);
      if (!group.isFolded) group.graph?.render();
      if (scroll) {
        if (wasFollowing) {
          scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
        } else {
          scroll.scrollLeft = Math.min(prevScrollLeft, Math.max(0, scroll.scrollWidth - scroll.clientWidth));
        }
      }
    });
  }

  function loadState() {
    if (!window.localStorage) return false;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      console.warn('Failed to parse state', err);
      return false;
    }
    if (!payload || !Array.isArray(payload.groups)) return false;
    return applyState(payload);
  }

  function buildSeriesRow(group, series) {
    const row = document.createElement('div');
    row.className = 'series-item';
    row.dataset.seriesId = series.id;
    row.dataset.groupId = group.id;
    row.addEventListener('mousedown', () => setActiveGroup(group));

    const dot = document.createElement('span');
    dot.className = 'series-color';
    dot.style.background = series.color;

    const input = document.createElement('input');
    input.className = 'series-label-input';
    input.type = 'text';
    input.value = series.label;
    input.placeholder = '라벨 입력';
    input.readOnly = !isEditMode;
    input.tabIndex = isEditMode ? 0 : -1;
    input.addEventListener('focus', () => setActiveGroup(group));
    input.addEventListener('input', () => {
      if (!isEditMode) return;
      const safeLabel = sanitizeText(input.value);
      if (!safeLabel) {
        input.value = series.label;
        return;
      }
      if (safeLabel !== input.value) {
        input.value = safeLabel;
      }
      const nextLabel = safeLabel;
      if (!isLabelAvailable(nextLabel, series.id)) {
        showNotification('중복된 라벨은 사용할 수 없습니다.', 'error');
        input.value = series.label;
        return;
      }
      series.label = nextLabel;
      updateLabelMap(series, group);
      updateGroupMeta(group);
      updateLegend(group);
      scheduleSave();
    });

    const deleteSeriesBtn = document.createElement('button');
    deleteSeriesBtn.type = 'button';
    deleteSeriesBtn.className = 'series-delete';
    deleteSeriesBtn.setAttribute('aria-label', '항목 삭제');
    deleteSeriesBtn.textContent = '×';
    deleteSeriesBtn.addEventListener('click', () => {
      if (group.series.length <= 1) return;
      removeSeries(group, series.id);
    });

    row.appendChild(dot);
    row.appendChild(input);
    row.appendChild(deleteSeriesBtn);
    setSeriesRowDnD(row, series.id, group.id);
    return row;
  }

  function renderGroupListItem(group) {
    if (!groupListEl) return;
    const card = document.createElement('div');
    card.className = 'group-item';
    card.dataset.groupId = group.id;
    card.addEventListener('mousedown', () => setActiveGroup(group));
    attachSeriesDropTarget(card, group.id);

    const title = document.createElement('div');
    title.className = 'group-title';

    const nameInput = document.createElement('input');
    nameInput.className = 'group-name-input';
    nameInput.type = 'text';
    nameInput.value = group.name;
    nameInput.readOnly = !isEditMode;
    nameInput.tabIndex = isEditMode ? 0 : -1;
    nameInput.addEventListener('focus', () => setActiveGroup(group));
    nameInput.addEventListener('input', () => {
      if (!isEditMode) return;
      const safeName = sanitizeText(nameInput.value);
      if (safeName !== nameInput.value) {
        nameInput.value = safeName;
      }
      const nextName = safeName;
      if (!nextName) {
        nameInput.value = group.name;
        return;
      }
      group.name = nextName;
      updateGroupName(group);
      scheduleSave();
    });

    const meta = document.createElement('span');
    meta.className = 'group-meta';
    meta.textContent = `채널 ${group.series.length}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'group-delete';
    deleteBtn.setAttribute('aria-label', '그룹 삭제');
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => {
      if (groups.length <= 1) return;
      removeGroup(group.id);
    });

    title.appendChild(nameInput);
    title.appendChild(meta);
    title.appendChild(deleteBtn);
    card.appendChild(title);

    const seriesWrap = document.createElement('div');
    seriesWrap.className = 'group-series';
    attachSeriesDropTarget(seriesWrap, group.id);

    group.series.forEach((series) => {
      const row = buildSeriesRow(group, series);
      seriesWrap.appendChild(row);
    });

    const addSeriesBtn = document.createElement('button');
    addSeriesBtn.className = 'btn btn-secondary btn-small series-add-btn';
    addSeriesBtn.type = 'button';
    addSeriesBtn.textContent = '항목 추가';
    addSeriesBtn.addEventListener('click', () => {
      setActiveGroup(group);
      addSeriesToGroup(group);
    });
    seriesWrap.appendChild(addSeriesBtn);

    card.appendChild(seriesWrap);
    groupListEl.appendChild(card);
    group.elements.listCard = card;
    group.elements.nameInput = nameInput;
    group.elements.groupDeleteBtn = deleteBtn;
    group.elements.groupMetaEl = meta;
  }

  function addSeriesToGroup(group) {
    const newSeries = appendSeriesToGroup(group, `sensor_${group.series.length + 1}`);
    return newSeries;
  }

  function appendSeriesToGroup(group, label) {
    const newSeries = createSeries(group.id, label);
    group.series.push(newSeries);
    const seriesWrap = group.elements.listCard?.querySelector('.group-series');
    if (seriesWrap) {
      const row = buildSeriesRow(group, newSeries);
      seriesWrap.insertBefore(row, seriesWrap.lastElementChild);
    }

    group.graph?.setSeries(group.series);
    updateGroupMeta(group);
    updateLegend(group);
    refreshDeleteStates();
    scheduleSave();
    return newSeries;
  }

  function renderGraphCard(group) {
    if (!graphListEl) return;
    const card = document.createElement('div');
    card.className = 'graph-card';
    card.dataset.groupId = group.id;

    const header = document.createElement('div');
    header.className = 'graph-card-header';
    const headerInfo = document.createElement('div');
    const headerTitle = document.createElement('h3');
    headerTitle.textContent = group.name;
    const headerMeta = document.createElement('div');
    headerMeta.className = 'graph-meta';
    headerMeta.textContent = `채널 ${group.series.length}`;
    headerInfo.appendChild(headerTitle);
    headerInfo.appendChild(headerMeta);

    const headerLegend = document.createElement('div');
    headerLegend.className = 'graph-legend';

    header.appendChild(headerInfo);
    header.appendChild(headerLegend);

    const body = document.createElement('div');
    body.className = 'graph-body';
    body.style.setProperty('--graph-axis-width', `${GRAPH_CONFIG.axisWidth}px`);

    const scroll = document.createElement('div');
    scroll.className = 'graph-scroll';

    const canvas = document.createElement('canvas');
    scroll.appendChild(canvas);

    const axis = document.createElement('div');
    axis.className = 'graph-axis';
    const axisCanvas = document.createElement('canvas');
    axis.appendChild(axisCanvas);

    const tooltip = document.createElement('div');
    tooltip.className = 'graph-tooltip';

    const folded = document.createElement('div');
    folded.className = 'graph-folded';
    folded.textContent = '그래프가 접혀 있습니다.';

    body.appendChild(scroll);
    body.appendChild(axis);
    body.appendChild(tooltip);
    body.appendChild(folded);

    card.appendChild(header);
    card.appendChild(body);
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'graph-resize-handle';
    card.appendChild(resizeHandle);
    graphListEl.appendChild(card);

    const graph = new window.Graph(canvas, {
      padding: GRAPH_CONFIG.padding,
      axisWidth: GRAPH_CONFIG.axisWidth,
      pxPerSec: GRAPH_CONFIG.pxPerSec,
      timeMode: 'relative',
      series: group.series,
      axisCanvas,
    });

    group.graph = graph;
    group.elements = {
      ...group.elements,
      card,
      header,
      body,
      scroll,
      canvas,
      axis,
      axisCanvas,
      tooltip,
      resizeHandle,
      titleEl: headerTitle,
      legend: headerLegend,
      meta: headerMeta,
    };

    updateLegend(group);
    updateGroupMeta(group);
    setupScrollBehavior(group);
    setupResizeObserver(group);
    setupResizeHandle(group);
    setupGraphHover(group);
    setupGroupCardDrag(group);
    syncGraphSize(group);
    graph.render();

    header.addEventListener('mousedown', () => setActiveGroup(group));
    header.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      if (group.isFolded) {
        unfoldGroup(group);
      }
    });

    card.addEventListener('mousedown', () => setActiveGroup(group));
    card.addEventListener('click', (event) => {
      if (!group.isFolded) return;
      if (event.target.closest('button')) return;
      if (event.target.closest('input')) return;
      unfoldGroup(group);
    });

    resizeHandle.addEventListener('click', () => {
      if (group.isFolded) unfoldGroup(group);
    });
  }

  function updateGroupMeta(group) {
    if (group.elements.meta) {
      group.elements.meta.textContent = `채널 ${group.series.length}`;
    }
    if (group.elements.groupMetaEl) {
      group.elements.groupMetaEl.textContent = `채널 ${group.series.length}`;
    }
  }

  function updateGroupName(group) {
    if (group.elements.titleEl) {
      group.elements.titleEl.textContent = group.name;
    }
  }

  function refreshDeleteStates() {
    groups.forEach((group) => {
      const disableGroupDelete = groups.length <= 1;
      if (group.elements.groupDeleteBtn) {
        group.elements.groupDeleteBtn.disabled = disableGroupDelete;
      }
      const disableSeriesDelete = group.series.length <= 1;
      const seriesButtons = group.elements.listCard?.querySelectorAll('.series-delete') || [];
      seriesButtons.forEach((btn) => {
        btn.disabled = disableSeriesDelete;
      });
      const seriesRows = group.elements.listCard?.querySelectorAll('.series-item') || [];
      seriesRows.forEach((row) => {
        row.draggable = isEditMode;
      });
      const seriesInputs = group.elements.listCard?.querySelectorAll('.series-label-input') || [];
      seriesInputs.forEach((input) => {
        input.readOnly = !isEditMode;
        input.tabIndex = isEditMode ? 0 : -1;
      });
      if (group.elements.nameInput) {
        group.elements.nameInput.readOnly = !isEditMode;
        group.elements.nameInput.tabIndex = isEditMode ? 0 : -1;
      }
    });
  }

  function attachSeriesDropTarget(element, groupId) {
    element.addEventListener('dragover', (event) => {
      if (!isEditMode) return;
      const data = getDragData(event);
      if (data?.type !== 'series') return;
      event.preventDefault();
      const targetRow = event.target instanceof Element ? event.target.closest('.series-item') : null;
      if (targetRow) return;
      clearDropIndicator();
    });

    element.addEventListener('drop', (event) => {
      if (!isEditMode) return;
      const data = getDragData(event);
      if (data?.type !== 'series') return;
      event.preventDefault();
      const group = getGroupById(groupId);
      if (!group) return;
      const insertIndex = group.series.length;
      moveSeriesBetweenGroups(data.seriesId, data.fromGroupId, groupId, insertIndex);
      activeDragData = null;
      clearDropIndicator();
    });
  }

  function getDragData(event) {
    try {
      const text = event.dataTransfer?.getData('text/plain');
      if (!text) return activeDragData;
      return JSON.parse(text);
    } catch (_) {
      return activeDragData;
    }
  }

  function clearDropIndicator() {
    if (!activeDropRow) return;
    activeDropRow.classList.remove('drop-before', 'drop-after');
    delete activeDropRow.dataset.dropPosition;
    activeDropRow = null;
  }

  function setDropIndicator(row, position) {
    if (activeDropRow && activeDropRow !== row) {
      activeDropRow.classList.remove('drop-before', 'drop-after');
    }
    activeDropRow = row;
    row.classList.toggle('drop-before', position === 'before');
    row.classList.toggle('drop-after', position === 'after');
    row.dataset.dropPosition = position;
  }

  function createTouchGhost(text) {
    const ghost = document.createElement('div');
    ghost.className = 'touch-drag-ghost';
    ghost.textContent = text || 'Move';
    document.body.appendChild(ghost);
    return ghost;
  }

  function updateTouchGhostPosition(x, y) {
    if (!touchGhost) return;
    touchGhost.style.left = `${x}px`;
    touchGhost.style.top = `${y}px`;
  }

  function startTouchDrag(payload, event) {
    if (isTouchDragging) return;
    isTouchDragging = true;
    touchDrag = {
      ...payload,
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    touchDrop = null;
    document.body.classList.add('is-touch-dragging');
    if (payload.dragEl) payload.dragEl.classList.add('dragging');
    touchGhost = createTouchGhost(payload.label);
    updateTouchGhostPosition(event.clientX, event.clientY);
    if (payload.type === 'group') {
      isGroupDragging = true;
    }
  }

  function finishTouchDrag(applyDrop) {
    if (!isTouchDragging) return;
    if (applyDrop && touchDrag) {
      if (touchDrag.type === 'series' && touchDrop?.type === 'series') {
        moveSeriesBetweenGroups(
          touchDrag.seriesId,
          touchDrag.fromGroupId,
          touchDrop.groupId,
          touchDrop.insertIndex
        );
      } else if (touchDrag.type === 'group' && touchDrop?.type === 'group') {
        moveGroupCard(touchDrag.groupId, touchDrop.targetCard, touchDrop.position, touchDrag.lastY);
      }
    }
    if (touchDrag?.dragEl) touchDrag.dragEl.classList.remove('dragging');
    if (touchGhost) {
      touchGhost.remove();
      touchGhost = null;
    }
    clearDropIndicator();
    clearGroupDropIndicator();
    document.body.classList.remove('is-touch-dragging');
    isTouchDragging = false;
    isGroupDragging = false;
    touchDrag = null;
    touchDrop = null;
  }

  function autoScrollGroupPanel(pointerY) {
    if (!isGroupPanelOpen || !groupPanelDrawer) return;
    const rect = groupPanelDrawer.getBoundingClientRect();
    if (pointerY < rect.top + TOUCH_SCROLL_EDGE) {
      groupPanelDrawer.scrollBy({ top: -TOUCH_SCROLL_SPEED, left: 0, behavior: 'auto' });
    } else if (pointerY > rect.bottom - TOUCH_SCROLL_EDGE) {
      groupPanelDrawer.scrollBy({ top: TOUCH_SCROLL_SPEED, left: 0, behavior: 'auto' });
    }
  }

  function updateTouchSeriesDropTarget(x, y) {
    const target = document.elementFromPoint(x, y);
    const row = target?.closest?.('.series-item');
    if (row) {
      if (row.dataset.seriesId === touchDrag.seriesId) {
        clearDropIndicator();
        touchDrop = null;
        return;
      }
      const groupId = row.dataset.groupId;
      const group = getGroupById(groupId);
      if (!group) return;
      const rect = row.getBoundingClientRect();
      const position = y < rect.top + rect.height / 2 ? 'before' : 'after';
      setDropIndicator(row, position);
      const targetIndex = group.series.findIndex((item) => item.id === row.dataset.seriesId);
      if (targetIndex === -1) return;
      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
      touchDrop = { type: 'series', groupId, insertIndex };
      return;
    }

    const container = target?.closest?.('.group-series, .group-item');
    if (container) {
      clearDropIndicator();
      const groupCard = container.closest('.group-item');
      const groupId = groupCard?.dataset.groupId;
      const group = getGroupById(groupId);
      if (group) {
        touchDrop = { type: 'series', groupId, insertIndex: group.series.length };
        return;
      }
    }

    clearDropIndicator();
    touchDrop = null;
  }

  function updateTouchGroupDropTarget(x, y) {
    const target = document.elementFromPoint(x, y);
    const card = target?.closest?.('.graph-card');
    if (!card || card.dataset.groupId === touchDrag.groupId) {
      clearGroupDropIndicator();
      touchDrop = null;
      return;
    }
    const rect = card.getBoundingClientRect();
    const position = y < rect.top + rect.height / 2 ? 'before' : 'after';
    setGroupDropIndicator(card, position);
    touchDrop = { type: 'group', targetCard: card, position };
  }

  function setSeriesRowTouchDnD(row, seriesId, groupId) {
    row.addEventListener('pointerdown', (event) => {
      if (!isEditMode) return;
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      if (event.target.closest('input, button')) return;
      if (!event.isPrimary) return;
      const startX = event.clientX;
      const startY = event.clientY;
      let lastX = startX;
      let lastY = startY;
      let dragStarted = false;
      let canceled = false;
      let timer = null;

      const startDrag = () => {
        if (canceled || dragStarted) return;
        const group = getGroupById(groupId);
        if (!group || group.series.length <= 1) {
          showNotification('Series move needs 2+ items in the group.', 'error');
          canceled = true;
          return;
        }
        dragStarted = true;
        const entry = findSeriesById(seriesId);
        setActiveGroup(group);
        startTouchDrag(
          {
            type: 'series',
            seriesId,
            fromGroupId: groupId,
            dragEl: row,
            label: entry?.series?.label || 'Series',
          },
          { clientX: lastX, clientY: lastY, pointerId: event.pointerId }
        );
      };

      const cancelDrag = () => {
        canceled = true;
        if (timer) clearTimeout(timer);
      };

      const onMove = (moveEvent) => {
        if (!dragStarted) {
          lastX = moveEvent.clientX;
          lastY = moveEvent.clientY;
          const dx = Math.abs(lastX - startX);
          const dy = Math.abs(lastY - startY);
          if (dx > TOUCH_MOVE_TOLERANCE || dy > TOUCH_MOVE_TOLERANCE) {
            cancelDrag();
          }
          return;
        }
        moveEvent.preventDefault();
        touchDrag.lastX = moveEvent.clientX;
        touchDrag.lastY = moveEvent.clientY;
        updateTouchGhostPosition(moveEvent.clientX, moveEvent.clientY);
        updateTouchSeriesDropTarget(moveEvent.clientX, moveEvent.clientY);
        autoScrollGroupPanel(moveEvent.clientY);
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        if (timer) clearTimeout(timer);
        if (dragStarted) {
          finishTouchDrag(true);
        }
      };

      timer = setTimeout(startDrag, TOUCH_LONG_PRESS_MS);
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  function setSeriesRowDnD(row, seriesId, groupId) {
    row.draggable = isEditMode;
    row.addEventListener('dragstart', (event) => {
      if (!isEditMode) return;
      const group = getGroupById(groupId);
      if (!group || group.series.length <= 1) {
        showNotification('항목이 1개인 그룹은 이동할 수 없습니다.', 'error');
        event.preventDefault();
        return;
      }
      row.classList.add('dragging');
      activeDragData = { type: 'series', seriesId, fromGroupId: groupId };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'series', seriesId, fromGroupId: groupId }));
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      activeDragData = null;
      clearDropIndicator();
    });

    row.addEventListener('dragover', (event) => {
      if (!isEditMode) return;
      const data = getDragData(event);
      if (data?.type !== 'series') return;
      event.preventDefault();
      event.stopPropagation();
      const rect = row.getBoundingClientRect();
      const offset = event.clientY - rect.top;
      const position = offset < rect.height / 2 ? 'before' : 'after';
      setDropIndicator(row, position);
    });

    row.addEventListener('dragleave', (event) => {
      if (!row.contains(event.relatedTarget)) {
        clearDropIndicator();
      }
    });

    row.addEventListener('drop', (event) => {
      if (!isEditMode) return;
      const data = getDragData(event);
      if (data?.type !== 'series') return;
      event.preventDefault();
      event.stopPropagation();
      const position = row.dataset.dropPosition || 'after';
      const group = getGroupById(groupId);
      if (!group) return;
      const targetIndex = group.series.findIndex((item) => item.id === seriesId);
      if (targetIndex === -1) return;
      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
      moveSeriesBetweenGroups(data.seriesId, data.fromGroupId, groupId, insertIndex);
      activeDragData = null;
      clearDropIndicator();
    });

    setSeriesRowTouchDnD(row, seriesId, groupId);
  }

  function moveSeriesBetweenGroups(seriesId, fromGroupId, toGroupId, insertIndex) {
    const sourceGroup = getGroupById(fromGroupId);
    const targetGroup = getGroupById(toGroupId);
    if (!sourceGroup || !targetGroup) return;
    const seriesIndex = sourceGroup.series.findIndex((s) => s.id === seriesId);
    if (seriesIndex < 0) return;
    const series = sourceGroup.series[seriesIndex];
    if (!series) return;

    if (fromGroupId !== toGroupId && sourceGroup.series.length <= 1) {
      showNotification('항목이 1개인 그룹은 이동할 수 없습니다.', 'error');
      return;
    }

    if (fromGroupId === toGroupId) {
      let targetIndex = Math.max(0, Math.min(insertIndex, sourceGroup.series.length));
      if (seriesIndex < targetIndex) targetIndex -= 1;
      if (seriesIndex === targetIndex) return;
      sourceGroup.series.splice(seriesIndex, 1);
      sourceGroup.series.splice(targetIndex, 0, series);
      syncSeriesDom(sourceGroup);
      sourceGroup.graph?.setSeries(sourceGroup.series);
      updateLegend(sourceGroup);
      refreshDeleteStates();
      sourceGroup.graph?.render();
      scheduleSave();
      return;
    }

    sourceGroup.series.splice(seriesIndex, 1);

    if (series.normalizedLabel && labelMap.has(series.normalizedLabel)) {
      const mapping = labelMap.get(series.normalizedLabel);
      if (mapping.seriesId !== series.id) {
        showNotification('중복된 라벨은 이동할 수 없습니다.', 'error');
        sourceGroup.series.splice(seriesIndex, 0, series);
        return;
      }
    }

    series.groupId = targetGroup.id;
    if (series.normalizedLabel) {
      labelMap.set(series.normalizedLabel, { groupId: targetGroup.id, seriesId: series.id });
    }

    const safeIndex = Math.max(0, Math.min(insertIndex, targetGroup.series.length));
    targetGroup.series.splice(safeIndex, 0, series);

    const sourceRow = sourceGroup.elements.listCard?.querySelector(`[data-series-id="${series.id}"]`);
    sourceRow?.remove();
    const targetWrap = targetGroup.elements.listCard?.querySelector('.group-series');
    if (targetWrap) {
      if (!targetWrap.querySelector(`[data-series-id="${series.id}"]`)) {
        const row = buildSeriesRow(targetGroup, series);
        targetWrap.insertBefore(row, targetWrap.lastElementChild);
      }
    }

    const sourceData = sourceGroup.graph?.data?.get(series.id) || [];
    if (sourceGroup.graph?.data) sourceGroup.graph.data.delete(series.id);
    if (targetGroup.graph?.data) targetGroup.graph.data.set(series.id, sourceData);

    sourceGroup.graph?.setSeries(sourceGroup.series);
    targetGroup.graph?.setSeries(targetGroup.series);
    syncSeriesDom(sourceGroup);
    syncSeriesDom(targetGroup);
    updateGroupMeta(sourceGroup);
    updateGroupMeta(targetGroup);
    updateLegend(sourceGroup);
    updateLegend(targetGroup);
    refreshDeleteStates();
    alignGroupsToGlobalTimeline({ recalc: true });
    scheduleSave();
  }

  function findSeriesById(seriesId) {
    for (const group of groups) {
      const series = group.series.find((item) => item.id === seriesId);
      if (series) return { group, series };
    }
    return null;
  }

  function syncSeriesDom(group) {
    const seriesWrap = group.elements.listCard?.querySelector('.group-series');
    if (!seriesWrap) return;
    const addBtn = seriesWrap.querySelector('.series-add-btn');
    group.series.forEach((series) => {
      const row = seriesWrap.querySelector(`[data-series-id="${series.id}"]`);
      if (row && addBtn) {
        seriesWrap.insertBefore(row, addBtn);
      } else if (row) {
        seriesWrap.appendChild(row);
      }
    });
  }

  function setupGroupCardDrag(group) {
    const header = group.elements.header;
    if (!header) return;
    header.draggable = true;
    header.addEventListener('dragstart', (event) => {
      group.elements.card?.classList.add('dragging');
      activeDragData = { type: 'group', groupId: group.id };
      isGroupDragging = true;
      event.dataTransfer.effectAllowed = 'move';
      if (group.elements.card && event.dataTransfer.setDragImage) {
        const rect = group.elements.card.getBoundingClientRect();
        event.dataTransfer.setDragImage(group.elements.card, Math.min(40, rect.width / 2), 20);
      }
      event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'group', groupId: group.id }));
    });
    header.addEventListener('dragend', () => {
      group.elements.card?.classList.remove('dragging');
      activeDragData = null;
      isGroupDragging = false;
      clearGroupDropIndicator();
    });

    setGroupCardTouchDnD(header, group);
  }

  function setGroupCardTouchDnD(header, group) {
    header.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      if (!event.isPrimary) return;
      if (event.target.closest('button')) return;

      const startX = event.clientX;
      const startY = event.clientY;
      let lastX = startX;
      let lastY = startY;
      let dragStarted = false;
      let canceled = false;
      let timer = null;

      const startDrag = () => {
        if (canceled || dragStarted) return;
        dragStarted = true;
        setActiveGroup(group);
        startTouchDrag(
          {
            type: 'group',
            groupId: group.id,
            dragEl: group.elements.card,
            label: group.name || 'Group',
          },
          { clientX: lastX, clientY: lastY, pointerId: event.pointerId }
        );
      };

      const cancelDrag = () => {
        canceled = true;
        if (timer) clearTimeout(timer);
      };

      const onMove = (moveEvent) => {
        if (!dragStarted) {
          lastX = moveEvent.clientX;
          lastY = moveEvent.clientY;
          const dx = Math.abs(lastX - startX);
          const dy = Math.abs(lastY - startY);
          if (dx > TOUCH_MOVE_TOLERANCE || dy > TOUCH_MOVE_TOLERANCE) {
            cancelDrag();
          }
          return;
        }
        moveEvent.preventDefault();
        touchDrag.lastX = moveEvent.clientX;
        touchDrag.lastY = moveEvent.clientY;
        updateTouchGhostPosition(moveEvent.clientX, moveEvent.clientY);
        updateTouchGroupDropTarget(moveEvent.clientX, moveEvent.clientY);
        autoScrollDuringGroupDrag(moveEvent.clientY);
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        if (timer) clearTimeout(timer);
        if (dragStarted) {
          finishTouchDrag(true);
        }
      };

      timer = setTimeout(startDrag, TOUCH_LONG_PRESS_MS);
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  function clearGroupDropIndicator() {
    if (!activeGroupDropCard) return;
    activeGroupDropCard.classList.remove('drop-before', 'drop-after');
    delete activeGroupDropCard.dataset.dropPosition;
    activeGroupDropCard = null;
  }

  function setGroupDropIndicator(card, position) {
    if (activeGroupDropCard && activeGroupDropCard !== card) {
      activeGroupDropCard.classList.remove('drop-before', 'drop-after');
    }
    activeGroupDropCard = card;
    card.classList.toggle('drop-before', position === 'before');
    card.classList.toggle('drop-after', position === 'after');
    card.dataset.dropPosition = position;
  }

  function attachGroupOrderDropTargets() {
    if (!graphListEl) return;
    graphListEl.addEventListener('dragover', (event) => {
      const data = getDragData(event);
      if (data?.type !== 'group') return;
      event.preventDefault();
      const targetCard = event.target instanceof Element ? event.target.closest('.graph-card') : null;
      if (!targetCard) {
        clearGroupDropIndicator();
        return;
      }
      if (targetCard.classList.contains('dragging')) return;
      const rect = targetCard.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      setGroupDropIndicator(targetCard, position);
      autoScrollDuringGroupDrag(event.clientY);
    });

    graphListEl.addEventListener('drop', (event) => {
      const data = getDragData(event);
      if (data?.type !== 'group') return;
      event.preventDefault();
      const targetCard = event.target.closest('.graph-card');
      const position = targetCard?.dataset.dropPosition;
      moveGroupCard(data.groupId, targetCard, position, event.clientY);
      activeDragData = null;
      isGroupDragging = false;
      clearGroupDropIndicator();
    });

    graphListEl.addEventListener('dragleave', (event) => {
      if (event.target === graphListEl) {
        clearGroupDropIndicator();
      }
    });
  }

  function setupGroupDragWheelScroll() {
    document.addEventListener(
      'wheel',
      (event) => {
        if (!isGroupDragging) return;
        event.preventDefault();
        window.scrollBy({ top: event.deltaY, left: 0, behavior: 'auto' });
      },
      { passive: false }
    );
    document.addEventListener('dragover', (event) => {
      if (!isGroupDragging) return;
      autoScrollDuringGroupDrag(event.clientY);
    });
  }

  function autoScrollDuringGroupDrag(pointerY) {
    if (!isGroupDragging) return;
    const topZone = Math.round(window.innerHeight * 0.4);
    const bottomZone = Math.round(window.innerHeight * 0.2);
    const speed = 18;
    if (pointerY < topZone) {
      window.scrollBy({ top: -speed, left: 0, behavior: 'auto' });
    } else if (pointerY > window.innerHeight - bottomZone) {
      window.scrollBy({ top: speed, left: 0, behavior: 'auto' });
    }
  }

  function moveGroupCard(sourceGroupId, targetCard, position, pointerY) {
    if (!graphListEl || !groupListEl) return;
    const sourceCard = graphListEl.querySelector(`[data-group-id="${sourceGroupId}"]`);
    if (!sourceCard) return;
    if (!targetCard || targetCard === sourceCard) {
      return;
    }
    const rect = targetCard.getBoundingClientRect();
    const insertBefore = position ? position === 'before' : pointerY < rect.top + rect.height / 2;
    if (insertBefore) graphListEl.insertBefore(sourceCard, targetCard);
    else graphListEl.insertBefore(sourceCard, targetCard.nextSibling);
    syncGroupOrder();
  }

  function syncGroupOrder() {
    if (!graphListEl || !groupListEl) return;
    const orderedIds = Array.from(graphListEl.querySelectorAll('.graph-card')).map((card) => card.dataset.groupId);
    const orderedGroups = [];
    orderedIds.forEach((id) => {
      const group = groups.find((g) => g.id === id);
      if (group) orderedGroups.push(group);
    });
    groups.splice(0, groups.length, ...orderedGroups);
    orderedIds.forEach((id) => {
      const card = groupListEl.querySelector(`[data-group-id="${id}"]`);
      if (card) groupListEl.appendChild(card);
    });
    scheduleSave();
  }

  function removeSeries(group, seriesId) {
    if (group.series.length <= 1) return;
    const idx = group.series.findIndex((s) => s.id === seriesId);
    if (idx === -1) return;
    const [removed] = group.series.splice(idx, 1);
    if (removed?.normalizedLabel) {
      labelMap.delete(removed.normalizedLabel);
    }
    const row = group.elements.listCard?.querySelector(`[data-series-id="${seriesId}"]`);
    row?.remove();
    if (group.graph?.data) {
      group.graph.data.delete(seriesId);
    }
    autoSeriesMap.forEach((entry, index) => {
      if (entry === seriesId) autoSeriesMap[index] = null;
    });
    group.graph?.setSeries(group.series);
    updateGroupMeta(group);
    updateLegend(group);
    refreshDeleteStates();
    alignGroupsToGlobalTimeline({ recalc: true });
    scheduleSave();
  }

  function removeGroup(groupId) {
    if (groups.length <= 1) return;
    const idx = groups.findIndex((g) => g.id === groupId);
    if (idx === -1) return;
    const [removed] = groups.splice(idx, 1);
    if (removed?.id === lastActiveGroupId) {
      lastActiveGroupId = groups[groups.length - 1]?.id || groups[0]?.id || null;
    }
    removed.series.forEach((series) => {
      if (series.normalizedLabel) labelMap.delete(series.normalizedLabel);
      autoSeriesMap.forEach((entry, index) => {
        if (entry === series.id) autoSeriesMap[index] = null;
      });
    });
    removed.elements.listCard?.remove();
    removed.elements.card?.remove();
    refreshDeleteStates();
    alignGroupsToGlobalTimeline({ recalc: true });
    scheduleSave();
  }

  function updateLegend(group) {
    const legend = group.elements.legend;
    if (!legend) return;
    legend.innerHTML = '';
    group.series.forEach((series) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const dot = document.createElement('span');
      dot.className = 'series-color';
      dot.style.background = series.color;
      const text = document.createElement('span');
      text.textContent = series.label || '미지정';
      item.appendChild(dot);
      item.appendChild(text);
      legend.appendChild(item);
    });
  }

  function formatValue(value) {
    if (!Number.isFinite(value)) return '-';
    const fixed = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
    return fixed.replace(/\.?0+$/, '');
  }

  function renderGraphTooltip(tooltip, info, startTime) {
    tooltip.innerHTML = '';
    const timeEl = document.createElement('div');
    timeEl.className = 'graph-tooltip-time';
    const timeSec = Math.max(0, (info.time - startTime) / 1000);
    timeEl.textContent = `t=${formatSeconds(timeSec)}`;
    tooltip.appendChild(timeEl);

    const list = document.createElement('div');
    list.className = 'graph-tooltip-list';
    info.series.forEach((series) => {
      const row = document.createElement('div');
      row.className = 'graph-tooltip-item';
      const dot = document.createElement('span');
      dot.className = 'graph-tooltip-dot';
      dot.style.background = series.color || '#667eea';
      const label = document.createElement('span');
      label.className = 'graph-tooltip-label';
      label.textContent = series.label || '미지정';
      const value = document.createElement('span');
      value.className = 'graph-tooltip-value';
      value.textContent = formatValue(series.point?.v);
      row.appendChild(dot);
      row.appendChild(label);
      row.appendChild(value);
      list.appendChild(row);
    });
    tooltip.appendChild(list);
    tooltip.classList.add('visible');
  }

  function positionGraphTooltip(tooltip, body, clientX, clientY) {
    const rect = body.getBoundingClientRect();
    const padding = 10;
    let left = clientX - rect.left + 12;
    let top = clientY - rect.top + 12;
    const maxLeft = rect.width - tooltip.offsetWidth - padding;
    const maxTop = rect.height - tooltip.offsetHeight - padding;
    left = Math.max(padding, Math.min(left, maxLeft));
    top = Math.max(padding, Math.min(top, maxTop));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function setupGraphHover(group) {
    const scroll = group.elements.scroll;
    const tooltip = group.elements.tooltip;
    const body = group.elements.body;
    const graph = group.graph;
    if (!scroll || !tooltip || !body || !graph || typeof graph.getHoverInfo !== 'function') return;

    const hide = () => {
      tooltip.classList.remove('visible');
    };

    const showAt = (event) => {
      const rect = scroll.getBoundingClientRect();
      const x = event.clientX - rect.left + scroll.scrollLeft;
      const info = graph.getHoverInfo(x, HOVER_TOLERANCE_PX);
      if (!info) {
        hide();
        return;
      }
      const startTime = Number.isFinite(graph.startTime) ? graph.startTime : info.time;
      renderGraphTooltip(tooltip, info, startTime);
      positionGraphTooltip(tooltip, body, event.clientX, event.clientY);
    };

    scroll.addEventListener('mousemove', showAt);
    scroll.addEventListener('click', showAt);
    scroll.addEventListener('mouseleave', hide);
    scroll.addEventListener('scroll', hide);
  }

  function setupScrollBehavior(group) {
    const scroll = group.elements.scroll;
    if (!scroll) return;
    scroll.addEventListener('scroll', () => {
      const maxScroll = scroll.scrollWidth - scroll.clientWidth;
      group.isFollowing = scroll.scrollLeft >= maxScroll - 16;
    });
  }

  function setupResizeObserver(group) {
    if (!group.elements.body || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const height = group.elements.body.clientHeight;
      const canvasHeight = getCanvasHeight(height);
      if (!isResizingGraph && !group.isFolded && canvasHeight < FOLD_THRESHOLD) {
        foldGroup(group, height);
        return;
      }
      if (group.isFolded) return;
      syncGraphSize(group);
      group.graph?.render();
    });
    observer.observe(group.elements.body);
    group.elements.resizeObserver = observer;
  }

  function setupResizeHandle(group) {
    const handle = group.elements.resizeHandle;
    const body = group.elements.body;
    if (!handle || !body) return;
    let startY = 0;
    let startHeight = 0;
    let rafId = null;
    let pendingHeight = 0;

    const applyHeight = () => {
      rafId = null;
      body.style.height = `${pendingHeight}px`;
      if (!group.isFolded) {
        syncGraphSize(group);
        group.graph?.render();
      }
    };

    const finishResize = (forceFold = false) => {
      if (!isResizingGraph) return;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-resizing');
      isResizingGraph = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
        if (pendingHeight > 0) {
          body.style.height = `${pendingHeight}px`;
        }
      }
      if (pendingHeight > 0 && body.style.height !== `${pendingHeight}px`) {
        body.style.height = `${pendingHeight}px`;
      }
      const finalHeight = body.clientHeight;
      const canvasHeight = getCanvasHeight(finalHeight);
      if (forceFold || canvasHeight < FOLD_THRESHOLD) {
        foldGroup(group, finalHeight);
      } else {
        group.isFolded = false;
        group.elements.card?.classList.remove('folded');
        syncGraphSize(group);
        group.graph?.render();
      }
    };

    const onMove = (event) => {
      if (!isResizingGraph) return;
      const nextHeight = Math.max(40, startHeight + (event.clientY - startY));
      pendingHeight = nextHeight;
      if (!rafId) {
        rafId = requestAnimationFrame(applyHeight);
      }
      if (getCanvasHeight(nextHeight) < FOLD_THRESHOLD) {
        finishResize(true);
      }
    };

    const onUp = () => {
      finishResize(false);
    };

    handle.addEventListener('mousedown', (event) => {
      event.preventDefault();
      if (group.isFolded) {
        unfoldGroup(group);
      }
      isResizingGraph = true;
      document.body.classList.add('is-resizing');
      startY = event.clientY;
      startHeight = body.getBoundingClientRect().height;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  function foldGroup(group, height) {
    group.isFolded = true;
    group.lastBodyHeight = height;
    group.elements.card?.classList.add('folded');
  }

  function unfoldGroup(group) {
    group.isFolded = false;
    group.elements.card?.classList.remove('folded');
    const base = group.lastBodyHeight || 220;
    const nextHeight = Math.max(base, FOLD_THRESHOLD + SCROLLBAR_PADDING + 20);
    if (group.elements.body) {
      group.elements.body.style.height = `${nextHeight}px`;
    }
    syncGraphSize(group);
    group.graph?.render();
  }

  function syncGraphSize(group, endTime) {
    if (!group.elements.body || !group.graph) return;
    const height = Math.max(1, group.elements.body.clientHeight - SCROLLBAR_PADDING);
    const containerWidth = group.elements.scroll?.clientWidth || group.elements.body.clientWidth || 0;
    const referenceTime = endTime || group.lastTime || Date.now();
    const start = Number.isFinite(group.displayStartTime)
      ? group.displayStartTime
      : (Number.isFinite(group.startTime) ? group.startTime : referenceTime);
    const elapsed = Math.max(0, referenceTime - start);
    const width = Math.max(
      containerWidth,
      GRAPH_CONFIG.padding.left + GRAPH_CONFIG.padding.right + (elapsed / 1000) * GRAPH_CONFIG.pxPerSec
    );
    group.graph.setSize(width, height);
  }

  function appendPoint(group, series, value, timestamp) {
    if (!Number.isFinite(group.startTime)) {
      group.startTime = timestamp;
    }
    group.lastTime = timestamp;
    if (!Number.isFinite(group.displayStartTime)) {
      group.displayStartTime = group.startTime;
      group.graph?.setStartTime(group.displayStartTime);
    }
    group.graph?.addPoint(series.id, { t: timestamp, v: value });

    const scroll = group.elements.scroll;
    if (!scroll) return;
    const wasFollowing = group.isFollowing;
    const prevScrollLeft = scroll.scrollLeft;
    syncGraphSize(group, timestamp);
    if (!group.isFolded) group.graph?.render();

    if (wasFollowing) {
      scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
    } else {
      scroll.scrollLeft = prevScrollLeft;
    }
  }

  function parseIncoming(text) {
    const raw = (text || '').toString().trim();
    if (!raw) return [];

    if (raw.startsWith('{') && raw.endsWith('}')) {
      try {
        const obj = JSON.parse(raw);
        return parseJsonPayload(obj);
      } catch (_) {
        return [];
      }
    }

    const parts = raw.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
    const results = [];
    let unlabeledIndex = 0;

    parts.forEach((part) => {
      let label = null;
      let valueText = part;
      const delimiterIndex = part.indexOf('/');
      if (delimiterIndex >= 0) {
        label = part.slice(0, delimiterIndex).trim() || null;
        valueText = part.slice(delimiterIndex + 1).trim();
      }

      const value = parseFloat(valueText);
      if (Number.isFinite(value)) {
        const sample = { label, value };
        if (!label) {
          sample.unlabeledIndex = unlabeledIndex;
          unlabeledIndex += 1;
        }
        results.push(sample);
      }
    });

    if (!results.length) {
      const value = parseFloat(raw);
      if (Number.isFinite(value)) {
        results.push({ label: null, value, unlabeledIndex: 0 });
      }
    }

    return results;
  }

  function parseJsonPayload(obj) {
    const results = [];
    if (Number.isFinite(obj)) {
      results.push({ label: null, value: obj });
      return results;
    }
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        if (Number.isFinite(item)) {
          results.push({ label: `value_${index + 1}`, value: item });
        }
      });
      return results;
    }
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach((key) => {
        const value = obj[key];
        if (Number.isFinite(value)) {
          results.push({ label: key, value });
        }
      });
    }
    return results;
  }

  function handleIncomingLine(text) {
    const samples = parseIncoming(text);
    if (!samples.length) return;
    const timestamp = Date.now();
    let appended = false;

    samples.forEach((sample) => {
      const labelKey = normalizeLabel(sample.label);
      let targetGroup = null;
      let targetSeries = null;

      if (labelKey && labelMap.has(labelKey)) {
        const mapping = labelMap.get(labelKey);
        targetGroup = groups.find((g) => g.id === mapping.groupId) || null;
        targetSeries = targetGroup?.series.find((s) => s.id === mapping.seriesId) || null;
      } else if (labelKey) {
        targetGroup = getActiveGroup();
        if (targetGroup) {
          setActiveGroup(targetGroup);
          targetSeries = appendSeriesToGroup(targetGroup, sample.label);
        }
      } else if (!labelKey && groups[0]) {
        const index = Number.isFinite(sample.unlabeledIndex) ? sample.unlabeledIndex : 0;
        const mappedSeriesId = autoSeriesMap[index];
        if (mappedSeriesId) {
          const found = findSeriesById(mappedSeriesId);
          targetGroup = found?.group || null;
          targetSeries = found?.series || null;
        }
        if (!targetSeries) {
          targetGroup = groups[0];
          targetSeries = appendSeriesToGroup(targetGroup, `auto_${index + 1}`);
          autoSeriesMap[index] = targetSeries?.id || null;
        }
      } else {
        return;
      }

      if (!targetGroup || !targetSeries) {
        return;
      }
      appendPoint(targetGroup, targetSeries, sample.value, timestamp);
      appended = true;
    });

    if (appended) {
      alignGroupsToGlobalTimeline();
      scheduleSave();
    }
  }

  window.isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle/i.test(navigator.userAgent);
  window.isBluetoothMode = window.isMobileDevice ? true : false;

  const initialUiDev = (deviceSelect && deviceSelect.value) || 'esp32';
  window.currentDeviceMode = initialUiDev;
  applyThemeByDevice(initialUiDev);
  if (deviceLabelEl) deviceLabelEl.textContent = UI_LABEL[initialUiDev] || 'ESP32';

  function onStatusChange({ statusText, status }) {
    if (status === 'connecting') setConnectBtnText('연결 중...');
    else if (status === 'connected') setConnectBtnText('연결 해제');
    else setConnectBtnText(window.isBluetoothMode ? '블루투스 연결' : '시리얼 연결');
    renderStatus(statusText, status);
  }

  window.updateSerialStatus = function (text, className) {
    const cls = className || '';
    let status = 'disconnected';
    if (/connecting/.test(cls) || /connecting/i.test(text || '') || /연결 중/.test(text || '')) status = 'connecting';
    else if (/connected/.test(cls) || /connected/i.test(text || '') || /연결/.test(text || '')) status = 'connected';
    renderStatus(text, status);
    if (window.connectionManager?.notifySerialStatusFromUI) {
      window.connectionManager.notifySerialStatusFromUI(text, className);
    }
  };

  window.AppState.setDevice(initialUiDev);
  window.AppState.setTransport(window.isBluetoothMode ? 'ble' : 'serial');
  window.connectionManager = new window.ConnectionManager(window.AppState, {
    onStatusChange,
    onReceive: ({ text }) => handleIncomingLine(text),
  });
  window.connectionManager.onReceive(({ text }) => handleIncomingLine(text));

  updateConnTypeLabel();
  setConnectBtnText(window.isBluetoothMode ? '블루투스 연결' : '시리얼 연결');
  renderStatus('연결 상태', 'disconnected');

  handleMobileModeMaybeChanged();

  connectionToggle?.addEventListener('click', () => {
    handleMobileModeMaybeChanged();
    if (window.isMobileDevice) {
      alert('모바일에서는 블루투스 연결만 가능합니다.');
      enforceMobileBleMode();
      return;
    }
    window.isBluetoothMode = !window.isBluetoothMode;
    setToggleState(window.isBluetoothMode);
    const transport = window.isBluetoothMode ? 'ble' : 'serial';
    window.AppState.setTransport(transport);
    window.connectionManager.setTransport(transport);
    if (window.isBluetoothMode && typeof window.closeSerialPort === 'function') {
      try { window.closeSerialPort(); } catch (_) {}
    }
    updateConnTypeLabel();
    setConnectBtnText(window.isBluetoothMode ? '블루투스 연결' : '시리얼 연결');
  });

  const EDITOR_LINKS = {
    microbit: { label: '마이크로비트 IDE 사용', url: 'https://makecode.microbit.org/#editor' },
    esp32: { label: 'Thonny IDE 다운로드', url: 'https://thonny.org/' },
    orange: { label: 'Arduino IDE 다운로드', url: 'https://www.arduino.cc/en/software' },
  };

  function updateEditorButton(ui) {
    const cfg = EDITOR_LINKS[ui] || EDITOR_LINKS.esp32;
    if (!editorButton) return;
    editorButton.textContent = cfg.label;
    editorButton.dataset.url = cfg.url;
  }

  editorButton?.addEventListener('click', () => {
    const url = editorButton?.dataset.url || EDITOR_LINKS.esp32.url;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  updateEditorButton(initialUiDev);

  deviceSelect?.addEventListener('change', () => {
    const ui = deviceSelect.value;
    window.currentDeviceMode = ui;
    window.AppState.setDevice(ui);
    window.connectionManager.setDevice(ui);
    applyThemeByDevice(ui);
    if (deviceLabelEl) deviceLabelEl.textContent = UI_LABEL[ui] || 'ESP32';
    updateEditorButton(ui);
  });

  connectButton?.addEventListener('click', async () => {
    try {
      if (window.connectionManager.isConnected()) {
        setConnectBtnText('연결 해제 중...');
        await window.connectionManager.disconnect();
      } else {
        setConnectBtnText('연결 중...');
        await window.connectionManager.connect();
      }
    } catch (e) {
      if (e?.name === 'NotFoundError' || e?.name === 'NotAllowedError') {
        console.warn('연결 취소/거절', e);
      } else {
        console.error(e);
        showNotification('연결 처리 오류가 발생했습니다.', 'error');
      }
    } finally {
      if (window.connectionManager.isConnected()) setConnectBtnText('연결 해제');
      else setConnectBtnText(window.isBluetoothMode ? '블루투스 연결' : '시리얼 연결');
    }
  });

  headerToggleBtn?.addEventListener('click', () => {
    headerSettingsBar?.classList.toggle('closed');
    headerToggleBtn.classList.toggle('closed');
    applyLayout();
  });

  hamburgerBtn?.addEventListener('click', () => {
    navOverlay?.classList.toggle('open');
    hamburgerBtn.classList.toggle('open');
    document.body.style.overflow = navOverlay?.classList.contains('open') ? 'hidden' : '';
  });

  navOverlay?.addEventListener('click', (e) => {
    if (e.target === navOverlay) {
      navOverlay.classList.remove('open');
      hamburgerBtn?.classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  exportCsvBtn?.removeAttribute('disabled');
  importCsvBtn?.removeAttribute('disabled');
  newProjectBtn?.removeAttribute('disabled');
  storageTestBtn?.removeAttribute('disabled');
  storageClearBtn?.removeAttribute('disabled');
  storageUsageBtn?.removeAttribute('disabled');

  exportCsvBtn?.addEventListener('click', openExportModal);
  exportCancelBtn?.addEventListener('click', () => {
    pendingImportAfterExport = false;
    closeExportModal();
  });
  exportConfirmBtn?.addEventListener('click', () => {
    const ids = getSelectedGroupIds();
    const selectedGroups = ids.map((id) => getGroupById(id)).filter(Boolean);
    const separate = exportSeparate ? exportSeparate.checked : true;
    const ok = exportSelectedGroups(selectedGroups, { separate });
    if (ok) {
      closeExportModal();
      if (pendingImportAfterExport) {
        pendingImportAfterExport = false;
        setTimeout(() => importFileInput?.click(), 200);
      }
    }
  });
  exportSelectAll?.addEventListener('change', () => {
    if (!exportGroupList) return;
    const inputs = exportGroupList.querySelectorAll('input[type="checkbox"]');
    inputs.forEach((input) => {
      input.checked = exportSelectAll.checked;
    });
  });
  exportGroupList?.addEventListener('change', () => {
    if (!exportSelectAll || !exportGroupList) return;
    const inputs = Array.from(exportGroupList.querySelectorAll('input[type="checkbox"]'));
    if (!inputs.length) return;
    const allChecked = inputs.every((input) => input.checked);
    const someChecked = inputs.some((input) => input.checked);
    exportSelectAll.checked = allChecked;
    exportSelectAll.indeterminate = !allChecked && someChecked;
  });
  exportModal?.addEventListener('click', (event) => {
    if (event.target === exportModal) closeExportModal();
  });

  importCsvBtn?.addEventListener('click', openImportModal);
  newProjectBtn?.addEventListener('click', showNewProjectModal);
  storageTestBtn?.addEventListener('click', fillStorageForTest);
  storageClearBtn?.addEventListener('click', clearStorageTestData);
  storageUsageBtn?.addEventListener('click', logLocalStorageUsage);
  importCancelBtn?.addEventListener('click', closeImportModal);
  importSaveBtn?.addEventListener('click', () => {
    pendingImportAfterExport = true;
    closeImportModal();
    openExportModal();
  });
  importConfirmBtn?.addEventListener('click', () => {
    pendingImportAfterExport = false;
    closeImportModal();
    importFileInput?.click();
  });
  importModal?.addEventListener('click', (event) => {
    if (event.target === importModal) closeImportModal();
  });

  newProjectCancelBtn?.addEventListener('click', hideNewProjectModal);
  newProjectConfirmBtn?.addEventListener('click', () => {
    hideNewProjectModal();
    resetProject();
  });
  newProjectModal?.addEventListener('click', (event) => {
    if (event.target === newProjectModal) hideNewProjectModal();
  });
  importFileInput?.addEventListener('change', async () => {
    const files = Array.from(importFileInput.files || []);
    if (!files.length) return;
    try {
      await importFromFiles(files);
      showNotification('데이터를 성공적으로 가져왔습니다.');
    } catch (err) {
      const message = err && err.message ? err.message : '데이터 가져오기 중 오류가 발생했습니다.';
      console.error('Import failed:', err);
      showNotification(`가져오기 실패: ${message}`, 'error');
    } finally {
      importFileInput.value = '';
    }
  });

  groupPanelToggleBtn?.addEventListener('click', () => setGroupPanelOpen(!isGroupPanelOpen));
  closeGroupPanelBtn?.addEventListener('click', () => setGroupPanelOpen(false));
  groupPanelOverlay?.addEventListener('click', () => setGroupPanelOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (refreshModal?.classList.contains('open')) {
        hideRefreshModal();
        return;
      }
      if (newProjectModal?.classList.contains('open')) {
        hideNewProjectModal();
        return;
      }
      if (exportModal?.classList.contains('open')) {
        closeExportModal();
        pendingImportAfterExport = false;
        return;
      }
      if (importModal?.classList.contains('open')) {
        closeImportModal();
        return;
      }
      if (isGroupPanelOpen) {
        setGroupPanelOpen(false);
      }
    }
  });

  refreshCancelBtn?.addEventListener('click', hideRefreshModal);
  refreshConfirmBtn?.addEventListener('click', () => {
    allowUnload = true;
    hideRefreshModal();
    saveState();
    window.location.reload();
  });
  refreshModal?.addEventListener('click', (event) => {
    if (event.target === refreshModal) hideRefreshModal();
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key?.toLowerCase();
    const isRefresh = event.key === 'F5' || ((event.ctrlKey || event.metaKey) && key === 'r');
    if (!isRefresh) return;
    if (!isDeviceConnected()) return;
    event.preventDefault();
    requestReload();
  });

  function setEditMode(enabled) {
    isEditMode = enabled;
    document.body.classList.toggle('is-editing', isEditMode);
    if (editGroupsBtn) {
      editGroupsBtn.textContent = isEditMode ? '편집 종료' : '편집 시작';
    }
    if (addGroupBtn) {
      addGroupBtn.style.display = isEditMode ? '' : 'none';
    }
    refreshDeleteStates();
  }

  editGroupsBtn?.addEventListener('click', () => setEditMode(!isEditMode));
  addGroupBtn?.addEventListener('click', () => createGroup());

  window.addEventListener('resize', () => {
    if (window._resizeRaf) cancelAnimationFrame(window._resizeRaf);
    window._resizeRaf = requestAnimationFrame(() => {
      applyLayout();
      groups.forEach((group) => syncGraphSize(group));
    });
  });
  window.addEventListener('beforeunload', (event) => {
    saveState();
    if (allowUnload) return;
    if (isDeviceConnected()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  window.addEventListener('orientationchange', applyLayout);
  document.addEventListener('DOMContentLoaded', applyLayout);
  applyLayout();

  if (!loadState()) {
    createGroup();
  }
  checkStorageUsage();
  attachGroupOrderDropTargets();
  setupGroupDragWheelScroll();
  setEditMode(false);
})();









