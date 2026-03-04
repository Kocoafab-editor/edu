
/* Excel import/export helpers */
(function (global) {
  'use strict';

  const TEXT_ENCODER = new TextEncoder();
  const TEXT_DECODER = new TextDecoder('utf-8');

  const ctx = {
    exportBtn: null,
    importBtn: null,
    exportModal: null,
    exportSelectAll: null,
    exportSeparate: null,
    exportGroupList: null,
    exportCancelBtn: null,
    exportConfirmBtn: null,
    importModal: null,
    importCancelBtn: null,
    importSaveBtn: null,
    importConfirmBtn: null,
    importFileInput: null,
    groups: [],
    colorPalette: [],
    sanitizeText: (value) => String(value ?? ''),
    normalizeLabel: (value) => String(value ?? '').toLowerCase(),
    showNotification: () => {},
    setGroupPanelOpen: () => {},
    applyState: () => false,
    saveState: () => {},
    setModalOpen: () => {},
    getGroupById: () => null,
  };

  let pendingImportAfterExport = false;

  function init(options = {}) {
    Object.keys(ctx).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(options, key)) {
        ctx[key] = options[key];
      }
    });

    ctx.exportBtn?.addEventListener('click', openExportModal);
    ctx.exportCancelBtn?.addEventListener('click', () => {
      pendingImportAfterExport = false;
      closeExportModal();
    });
    ctx.exportConfirmBtn?.addEventListener('click', () => {
      const ids = getSelectedGroupIds();
      const selectedGroups = ids.map((id) => ctx.getGroupById(id)).filter(Boolean);
      const separate = ctx.exportSeparate ? ctx.exportSeparate.checked : true;
      const ok = exportSelectedGroups(selectedGroups, { separate });
      if (ok) {
        closeExportModal();
        if (pendingImportAfterExport) {
          pendingImportAfterExport = false;
          setTimeout(() => ctx.importFileInput?.click(), 200);
        }
      }
    });
    ctx.exportSelectAll?.addEventListener('change', () => {
      if (!ctx.exportGroupList) return;
      const inputs = ctx.exportGroupList.querySelectorAll('input[type="checkbox"]');
      inputs.forEach((input) => {
        input.checked = ctx.exportSelectAll.checked;
      });
    });
    ctx.exportGroupList?.addEventListener('change', () => {
      if (!ctx.exportSelectAll || !ctx.exportGroupList) return;
      const inputs = Array.from(ctx.exportGroupList.querySelectorAll('input[type="checkbox"]'));
      if (!inputs.length) return;
      const allChecked = inputs.every((input) => input.checked);
      const someChecked = inputs.some((input) => input.checked);
      ctx.exportSelectAll.checked = allChecked;
      ctx.exportSelectAll.indeterminate = !allChecked && someChecked;
    });
    ctx.exportModal?.addEventListener('click', (event) => {
      if (event.target === ctx.exportModal) closeExportModal();
    });

    ctx.importBtn?.addEventListener('click', openImportModal);
    ctx.importCancelBtn?.addEventListener('click', closeImportModal);
    ctx.importSaveBtn?.addEventListener('click', () => {
      pendingImportAfterExport = true;
      closeImportModal();
      openExportModal();
    });
    ctx.importConfirmBtn?.addEventListener('click', () => {
      pendingImportAfterExport = false;
      closeImportModal();
      ctx.importFileInput?.click();
    });
    ctx.importModal?.addEventListener('click', (event) => {
      if (event.target === ctx.importModal) closeImportModal();
    });
    ctx.importFileInput?.addEventListener('change', async () => {
      const files = Array.from(ctx.importFileInput?.files || []);
      if (!files.length) return;
      try {
        await importFromFiles(files);
        ctx.showNotification('가져오기가 완료되었습니다.');
      } catch (err) {
        const message = err && err.message ? err.message : '가져오기 중 오류가 발생했습니다.';
        console.error('Import failed:', err);
        ctx.showNotification(`가져오기 실패: ${message}`, 'error');
      } finally {
        if (ctx.importFileInput) ctx.importFileInput.value = '';
      }
    });
  }

  function getDateStamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  function formatDateValue(timestamp) {
    if (!Number.isFinite(timestamp)) return '';
    const date = new Date(timestamp);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function formatTimeValue(timestamp) {
    if (!Number.isFinite(timestamp)) return '';
    const date = new Date(timestamp);
    const pad = (value) => String(value).padStart(2, '0');
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    const ms = date.getMilliseconds();
    if (ms > 0) {
      return `${hours}:${minutes}:${seconds}.${String(ms).padStart(3, '0')}`;
    }
    return `${hours}:${minutes}:${seconds}`;
  }

  function parseDateValue(raw) {
    const value = String(raw || '').trim();
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return { year, month, day };
  }

  function parseTimeValue(raw) {
    const value = String(raw || '').trim();
    const match = value.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const fraction = match[4] || '';
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;
    if (seconds < 0 || seconds > 59) return null;
    let ms = 0;
    if (fraction) {
      const padded = fraction.padEnd(3, '0');
      ms = Number(padded);
      if (!Number.isFinite(ms) || ms < 0 || ms > 999) return null;
    }
    return {
      hours,
      minutes,
      seconds,
      ms,
    };
  }

  function normalizeGroupName(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function makeUniqueGroupName(baseName, nameSet) {
    const safeBase = ctx.sanitizeText(baseName) || '그룹';
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
    const base = ctx.sanitizeText(name || '') || fallback;
    const trimmed = base.replace(/[\[\]\*\/\\\:\?]/g, '_').slice(0, 31);
    return trimmed || fallback;
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

  function buildGroupTable(group) {
    const labels = group.series.map((series) => series.label || '');
    const dataRows = new Map();

    group.series.forEach((series, seriesIndex) => {
      const points = group.graph?.data?.get(series.id) || [];
      points.forEach((pt) => {
        if (!Number.isFinite(pt?.t) || !Number.isFinite(pt?.v)) return;
        if (!dataRows.has(pt.t)) {
          dataRows.set(pt.t, Array(labels.length).fill(''));
        }
        dataRows.get(pt.t)[seriesIndex] = pt.v;
      });
    });

    const rows = Array.from(dataRows.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, values]) => ({
        timestamp: time,
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

    const headerCells = ['date', 'time', ...table.labels]
      .map((label, colIndex) => buildInlineCell(2, colIndex, label))
      .join('');
    rows.push(`<row r="2">${headerCells}</row>`);

    let rowIndex = 3;
    table.rows.forEach((row) => {
      const cells = [];
      cells.push(buildInlineCell(rowIndex, 0, formatDateValue(row.timestamp)));
      cells.push(buildInlineCell(rowIndex, 1, formatTimeValue(row.timestamp)));
      row.values.forEach((value, colIndex) => {
        if (Number.isFinite(value)) {
          cells.push(buildNumberCell(rowIndex, colIndex + 2, value));
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
      ctx.showNotification('선택된 그룹이 없습니다.', 'error');
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
    if (!ctx.exportGroupList) return;
    ctx.exportGroupList.innerHTML = '';
    ctx.groups.forEach((group) => {
      const label = document.createElement('label');
      label.className = 'modal-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = group.id;
      input.checked = true;
      const text = document.createElement('span');
      text.textContent = `${group.name} (${group.series.length} 항목)`;
      label.appendChild(input);
      label.appendChild(text);
      ctx.exportGroupList.appendChild(label);
    });
  }

  function getSelectedGroupIds() {
    if (!ctx.exportGroupList) return [];
    const inputs = Array.from(ctx.exportGroupList.querySelectorAll('input[type="checkbox"]'));
    return inputs.filter((input) => input.checked).map((input) => input.value);
  }

  function openExportModal() {
    if (ctx.groups.length <= 1) {
      const ok = exportSelectedGroups(ctx.groups.slice(0, 1), { separate: true });
      if (ok && pendingImportAfterExport) {
        pendingImportAfterExport = false;
        setTimeout(() => ctx.importFileInput?.click(), 200);
      }
      return;
    }
    renderExportList();
    if (ctx.exportSelectAll) {
      ctx.exportSelectAll.checked = true;
      ctx.exportSelectAll.indeterminate = false;
    }
    if (ctx.exportSeparate) {
      ctx.exportSeparate.checked = true;
    }
    ctx.setModalOpen(ctx.exportModal, true);
  }

  function closeExportModal() {
    ctx.setModalOpen(ctx.exportModal, false);
  }

  function openImportModal() {
    ctx.setModalOpen(ctx.importModal, true);
  }

  function closeImportModal() {
    ctx.setModalOpen(ctx.importModal, false);
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
    if (normalized.length < 2) throw new Error(`${sourceLabel} 데이터가 비어 있습니다.`);

    const header = normalized[1] || [];
    const headerDate = ctx.normalizeLabel(header[0]);
    const headerTime = ctx.normalizeLabel(header[1]);
    if (!header.length || headerDate !== 'date' || headerTime !== 'time') {
      throw new Error(`${sourceLabel} 형식이 올바르지 않습니다. (2번째 행 헤더: date, time)`);
    }
    const labels = header.slice(2).map((label) => ctx.sanitizeText(label)).filter(Boolean);
    if (!labels.length) throw new Error('라벨이 없습니다.');

    const dataRows = [];
    for (let i = 2; i < normalized.length; i += 1) {
      const cells = normalized[i] || [];
      if (!cells.length || cells.every((cell) => cell === '')) continue;
      const dateParts = parseDateValue(cells[0]);
      if (!dateParts) {
        throw new Error('날짜 형식이 맞지 않습니다.(YYYY-MM-DD)');
      }
      const timeParts = parseTimeValue(cells[1]);
      if (!timeParts) {
        throw new Error('시간 형식이 맞지 않습니다.(HH:MM:SS)');
      }
      const timestamp = new Date(
        dateParts.year,
        dateParts.month - 1,
        dateParts.day,
        timeParts.hours,
        timeParts.minutes,
        timeParts.seconds,
        timeParts.ms
      ).getTime();
      const values = labels.map((_, index) => {
        const value = Number.parseFloat(cells[index + 2]);
        return Number.isFinite(value) ? value : null;
      });
      dataRows.push({ timestamp, values });
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
      throw new Error('스프레드시트 XML 형식이 올바르지 않습니다.');
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
      tables.push(parseRowsToTable(parsedRows, name, 'XLS'));
    });
    if (!tables.length) throw new Error('가져올 데이터가 없습니다.');
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
      throw new Error('시트 XML 형식이 올바르지 않습니다.');
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
    if (eocdOffset < 0) throw new Error('ZIP 중앙 디렉터리를 찾을 수 없습니다.');

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
      throw new Error('ZIP 로컬 헤더를 찾을 수 없습니다.');
    }
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataOffset = offset + 30 + nameLength + extraLength;
    return new Uint8Array(buffer, dataOffset, entry.compressedSize);
  }

  async function inflateRaw(data) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('이 브라우저에서는 XLSX 압축 해제를 지원하지 않습니다.');
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
      throw wrapImportError('XLSX 기본 파일 읽기', err);
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
    if (!sheetNodes.length) throw new Error('시트 정보를 찾을 수 없습니다.');

    let rels = null;
    try {
      rels = parseWorkbookRels(relsXml);
    } catch (err) {
      throw wrapImportError('시트 관계 정보 파싱', err);
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
        throw new Error(`[XLSX] 시트 경로를 찾을 수 없습니다: ${name}`);
      }
      const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      let sheetXml = null;
      try {
        sheetXml = await readZipEntryText(entries, buffer, sheetPath);
      } catch (err) {
        throw wrapImportError(`시트 읽기 (${name})`, err);
      }
      if (!sheetXml) continue;
      try {
        const rows = parseSheetXmlRows(sheetXml, sharedStrings);
        tables.push(parseRowsToTable(rows, name, 'XLSX'));
      } catch (err) {
        throw wrapImportError(`시트 파싱 (${name})`, err);
      }
    }

    if (!tables.length) throw new Error('가져올 데이터가 없습니다.');
    return tables;
  }

  async function parseWithSheetJs(buffer, fallbackName) {
    if (!global.XLSX || typeof global.XLSX.read !== 'function') {
      throw new Error('SheetJS를 사용할 수 없습니다.');
    }
    let workbook = null;
    try {
      workbook = global.XLSX.read(buffer, { type: 'array' });
    } catch (err) {
      throw wrapImportError('SheetJS 로딩', err);
    }
    const tables = [];
    const sheetNames = workbook.SheetNames || [];
    sheetNames.forEach((sheetName, index) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;
      const rows = global.XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: true,
        defval: '',
      });
      if (rows.length) {
        const first = rows[0] || [];
        const headerDate = ctx.normalizeLabel(first[0]);
        const headerTime = ctx.normalizeLabel(first[1]);
        if ((headerDate === 'date' && headerTime === 'time') || headerDate === 'time') {
          rows.unshift([]);
        }
      }
      const name = sheetName || fallbackName || `그룹 ${index + 1}`;
      tables.push(parseRowsToTable(rows, name, 'XLSX'));
    });
    if (!tables.length) throw new Error('가져올 데이터가 없습니다.');
    return tables;
  }
  function buildImportPayload(tables) {
    const payload = { version: 1, groups: [], autoSeriesMap: [], lastActiveGroupId: null };
    const labelSet = new Set();
    const nameSet = new Set();
    let groupIndex = 0;
    let seriesIndex = 0;

    tables.forEach((table) => {
      const baseLabels = table.labels.map((label) => ctx.sanitizeText(label)).filter(Boolean);
      const labels = baseLabels.map((label) => {
        let candidate = label;
        let index = 0;
        let normalized = ctx.normalizeLabel(candidate);
        while (!normalized || labelSet.has(normalized)) {
          index += 1;
          candidate = `${label}_${index}`;
          normalized = ctx.normalizeLabel(candidate);
        }
        labelSet.add(normalized);
        return candidate;
      });

      const groupId = `group-${++groupIndex}`;
      const series = labels.map((label) => {
        const id = `series-${++seriesIndex}`;
        const color = ctx.colorPalette[(seriesIndex - 1) % ctx.colorPalette.length];
        return { id, label, color };
      });

      const data = {};
      series.forEach((item) => {
        data[item.id] = [];
      });

      table.rows.forEach((row) => {
        const t = row.timestamp;
        row.values.forEach((value, idx) => {
          if (!Number.isFinite(value)) return;
          data[series[idx].id].push({ t, v: value });
        });
      });

      const baseName = ctx.sanitizeText(table.name) || `그룹 ${groupIndex}`;
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

  function importFromText(text, fileName) {
    const safeName = ctx.sanitizeText(fileName?.replace(/\.[^/.]+$/, '')) || '가져온 데이터';
    const normalizedText = text.replace(/^\uFEFF/, '');
    let tables = null;
    if (normalizedText.trim().startsWith('<')) {
      tables = parseSpreadsheetXml(normalizedText);
    } else {
      tables = [parseCsvTable(normalizedText, safeName)];
    }
    const payload = buildImportPayload(tables);
    ctx.setGroupPanelOpen(false);
    localStorage.removeItem('loggerState.v1');
    ctx.applyState(payload);
    ctx.saveState();
  }

  async function importFromFiles(files) {
    const tables = [];
    for (const file of files) {
      const safeName = ctx.sanitizeText(file.name?.replace(/\.[^/.]+$/, '')) || '가져온 데이터';
      const ext = (file.name || '').split('.').pop().toLowerCase();
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
      const canUseSheetJs = !!(global.XLSX && typeof global.XLSX.read === 'function');

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
    ctx.setGroupPanelOpen(false);
    localStorage.removeItem('loggerState.v1');
    ctx.applyState(payload);
    ctx.saveState();
  }

  global.ExcelIO = {
    init,
    openExportModal,
    closeExportModal,
    openImportModal,
    closeImportModal,
    exportSelectedGroups,
  };
})(window);
