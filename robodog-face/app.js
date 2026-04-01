(function (root, factory) {
  const storageLib = typeof module === 'object' && module.exports
    ? require('./storage.js')
    : root.RobodogFaceStorage;
  const api = factory(root, storageLib);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.RobodogFaceApp = api;
  if (root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', function () {
        api.init();
      });
    } else {
      api.init();
    }
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, storageLib) {
  'use strict';

  const MATRIX_SIZE = 8;
  const DRAFT_KEY = '__draft__';

  function createEmptyMatrix() {
    return Array.from({ length: MATRIX_SIZE }, function () {
      return Array(MATRIX_SIZE).fill(0);
    });
  }

  function cloneMatrix(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    return Array.from({ length: MATRIX_SIZE }, function (_, rowIndex) {
      const sourceRow = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
      return Array.from({ length: MATRIX_SIZE }, function (_, columnIndex) {
        return sourceRow[columnIndex] ? 1 : 0;
      });
    });
  }

  function matrixRowsToBytes(matrix) {
    return cloneMatrix(matrix).map(function (row) {
      return row.reduce(function (byteValue, cell, columnIndex) {
        return byteValue | ((cell ? 1 : 0) << (7 - columnIndex));
      }, 0);
    });
  }

  function formatHexByte(value) {
    return '0x' + Number(value).toString(16).padStart(2, '0').toUpperCase();
  }

  function formatPythonCode(leftMatrix, rightMatrix) {
    const leftBytes = matrixRowsToBytes(leftMatrix).map(formatHexByte).join(', ');
    const rightBytes = matrixRowsToBytes(rightMatrix).map(formatHexByte).join(', ');
    return [
      'left = bytearray([' + leftBytes + '])',
      'right = bytearray([' + rightBytes + '])',
      'dog.headLEDDraw(left, right)',
    ].join('\n');
  }

  function highlightPythonCode(leftMatrix, rightMatrix) {
    const leftTokens = matrixRowsToBytes(leftMatrix).map(function (value) {
      return '<span class="token-number">' + formatHexByte(value) + '</span>';
    }).join(', ');
    const rightTokens = matrixRowsToBytes(rightMatrix).map(function (value) {
      return '<span class="token-number">' + formatHexByte(value) + '</span>';
    }).join(', ');
    return [
      '<span class="token-variable">left</span> = <span class="token-function">bytearray</span>([' + leftTokens + '])',
      '<span class="token-variable">right</span> = <span class="token-function">bytearray</span>([' + rightTokens + '])',
      '<span class="token-function">dog.headLEDDraw</span>(<span class="token-variable">left</span>, <span class="token-variable">right</span>)',
    ].join('\n');
  }

  function matrixFromBytes(bytes) {
    const rows = Array.isArray(bytes) ? bytes : [];
    return Array.from({ length: MATRIX_SIZE }, function (_, rowIndex) {
      const byteValue = Number(rows[rowIndex] || 0);
      return Array.from({ length: MATRIX_SIZE }, function (_, columnIndex) {
        return (byteValue >> (7 - columnIndex)) & 1;
      });
    });
  }

  function normalizeName(name) {
    return String(name == null ? '' : name).trim();
  }

  function cloneExample(example) {
    if (!example) {
      return null;
    }
    return Object.assign({}, example, {
      left: cloneMatrix(example.left),
      right: cloneMatrix(example.right),
    });
  }

  function createEditSnapshot(sourceState) {
    return {
      selectedKey: sourceState.selectedKey,
      currentName: sourceState.currentName,
      left: cloneMatrix(sourceState.left),
      right: cloneMatrix(sourceState.right),
      selectedExample: cloneExample(sourceState.selectedExample),
    };
  }

  function applyEditSnapshot(targetState, snapshot) {
    if (!snapshot) {
      return targetState;
    }
    targetState.selectedKey = snapshot.selectedKey;
    targetState.currentName = snapshot.currentName;
    targetState.left = cloneMatrix(snapshot.left);
    targetState.right = cloneMatrix(snapshot.right);
    targetState.selectedExample = cloneExample(snapshot.selectedExample);
    return targetState;
  }

  function createPaintSession(matrix, rowIndex, columnIndex) {
    const nextValue = matrix[rowIndex] && matrix[rowIndex][columnIndex] ? 0 : 1;
    return {
      paintValue: nextValue,
    };
  }

  function applyPaintSession(matrix, session, rowIndex, columnIndex) {
    if (!session || !matrix[rowIndex]) {
      return false;
    }
    const nextValue = session.paintValue ? 1 : 0;
    if (matrix[rowIndex][columnIndex] === nextValue) {
      return false;
    }
    matrix[rowIndex][columnIndex] = nextValue;
    return true;
  }

  function createBuiltInExamples() {
    return [
      {
        id: 'builtin-cry',
        name: '우는 표정',
        left: matrixFromBytes([0x00, 0x00, 0xFF, 0xFF, 0x66, 0x66, 0x66, 0x66]),
        right: matrixFromBytes([0x00, 0x00, 0xFF, 0xFF, 0x66, 0x66, 0x66, 0x66]),
        createdAt: 101,
        updatedAt: 101,
        builtin: true,
      },
      {
        id: 'builtin-happy',
        name: '웃는 표정',
        left: matrixFromBytes([0x00, 0x00, 0x18, 0x3C, 0x7E, 0xE7, 0xC3, 0x00]),
        right: matrixFromBytes([0x00, 0x00, 0x18, 0x3C, 0x7E, 0xE7, 0xC3, 0x00]),
        createdAt: 102,
        updatedAt: 102,
        builtin: true,
      },
      {
        id: 'builtin-wink',
        name: '윙크',
        left: matrixFromBytes([0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00]),
        right: matrixFromBytes([0x06, 0x0C, 0x18, 0x30, 0x30, 0x18, 0x0C, 0x06]),
        createdAt: 103,
        updatedAt: 103,
        builtin: true,
      },
    ];
  }

  function init() {
    if (!root.document || !storageLib || typeof storageLib.createExampleStorage !== 'function') {
      return null;
    }

    const doc = root.document;
    const elements = {
      sideToggle: doc.getElementById('sideToggle'),
      enterEditBtn: doc.getElementById('enterEditBtn'),
      editModeActions: doc.getElementById('editModeActions'),
      editorPanel: doc.getElementById('editorPanel'),
      leftMatrix: doc.getElementById('leftMatrix'),
      rightMatrix: doc.getElementById('rightMatrix'),
      presetStrip: doc.getElementById('presetStrip'),
      presetNameInput: doc.getElementById('presetNameInput'),
      savePresetBtn: doc.getElementById('savePresetBtn'),
      cancelEditBtn: doc.getElementById('cancelEditBtn'),
      deletePresetBtn: doc.getElementById('deletePresetBtn'),
      resetAllBtn: doc.getElementById('resetAllBtn'),
      stateHint: doc.getElementById('stateHint'),
      codeOutput: doc.getElementById('codeOutput'),
      copyCodeBtn: doc.getElementById('copyCodeBtn'),
      toastStack: doc.getElementById('toastStack'),
      confirmModal: doc.getElementById('confirmModal'),
      confirmTitle: doc.getElementById('confirmTitle'),
      confirmMessage: doc.getElementById('confirmMessage'),
      cancelConfirmBtn: doc.getElementById('cancelConfirmBtn'),
      acceptConfirmBtn: doc.getElementById('acceptConfirmBtn'),
    };

    if (!elements.leftMatrix || !elements.rightMatrix || !elements.presetStrip) {
      return null;
    }

    const builtInExamples = createBuiltInExamples();
    const storage = storageLib.createExampleStorage({ builtInExamples: builtInExamples });
    const state = {
      mode: 'read',
      currentName: '',
      left: createEmptyMatrix(),
      right: createEmptyMatrix(),
      selectedKey: DRAFT_KEY,
      selectedExample: null,
      examples: [],
      matrixButtons: { left: [], right: [] },
      confirmAction: null,
      editSnapshot: null,
      dragSession: null,
    };

    function showToast(message, tone) {
      if (!elements.toastStack) {
        return;
      }
      const toast = doc.createElement('div');
      toast.className = 'toast toast--' + (tone || 'info');
      toast.textContent = message;
      elements.toastStack.appendChild(toast);
      root.setTimeout(function () {
        toast.classList.add('is-hiding');
        root.setTimeout(function () {
          toast.remove();
        }, 220);
      }, 2200);
    }

    function openConfirmModal(options) {
      if (!elements.confirmModal) {
        return;
      }
      state.confirmAction = typeof options.onConfirm === 'function' ? options.onConfirm : null;
      elements.confirmTitle.textContent = options.title || '확인';
      elements.confirmMessage.textContent = options.message || '';
      elements.acceptConfirmBtn.textContent = options.confirmLabel || '확인';
      elements.acceptConfirmBtn.dataset.tone = options.confirmTone || 'default';
      elements.confirmModal.classList.remove('hidden');
      elements.confirmModal.setAttribute('aria-hidden', 'false');
    }

    function closeConfirmModal() {
      if (!elements.confirmModal) {
        return;
      }
      state.confirmAction = null;
      elements.confirmModal.classList.add('hidden');
      elements.confirmModal.setAttribute('aria-hidden', 'true');
      delete elements.acceptConfirmBtn.dataset.tone;
    }

    async function handleConfirmAccept() {
      const action = state.confirmAction;
      closeConfirmModal();
      if (typeof action === 'function') {
        await action();
      }
    }

    function buildInteractiveMatrix(side, container) {
      const buttonGrid = [];

      function getTargetMatrix() {
        return side === 'left' ? state.left : state.right;
      }

      function endPaintSession() {
        state.dragSession = null;
      }

      container.innerHTML = '';
      for (let rowIndex = 0; rowIndex < MATRIX_SIZE; rowIndex += 1) {
        const rowButtons = [];
        for (let columnIndex = 0; columnIndex < MATRIX_SIZE; columnIndex += 1) {
          const button = doc.createElement('button');
          button.type = 'button';
          button.className = 'matrix-dot is-off';
          button.dataset.side = side;
          button.dataset.row = String(rowIndex);
          button.dataset.column = String(columnIndex);

          button.addEventListener('mousedown', function (event) {
            if (state.mode !== 'edit') {
              return;
            }
            event.preventDefault();
            const targetMatrix = getTargetMatrix();
            state.dragSession = createPaintSession(targetMatrix, rowIndex, columnIndex);
            if (applyPaintSession(targetMatrix, state.dragSession, rowIndex, columnIndex)) {
              render();
            }
          });

          button.addEventListener('mouseenter', function (event) {
            if (state.mode !== 'edit' || !state.dragSession) {
              return;
            }
            if (typeof event.buttons === 'number' && event.buttons === 0) {
              endPaintSession();
              return;
            }
            if (applyPaintSession(getTargetMatrix(), state.dragSession, rowIndex, columnIndex)) {
              render();
            }
          });

          container.appendChild(button);
          rowButtons.push(button);
        }
        buttonGrid.push(rowButtons);
      }
      state.matrixButtons[side] = buttonGrid;

      doc.addEventListener('mouseup', endPaintSession);
      if (root.addEventListener) {
        root.addEventListener('blur', endPaintSession);
      }
    }

    function renderInteractiveMatrix(side) {
      const matrix = side === 'left' ? state.left : state.right;
      const grid = state.matrixButtons[side];
      for (let rowIndex = 0; rowIndex < MATRIX_SIZE; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < MATRIX_SIZE; columnIndex += 1) {
          const button = grid[rowIndex][columnIndex];
          const isOn = Boolean(matrix[rowIndex][columnIndex]);
          button.classList.toggle('is-on', isOn);
          button.classList.toggle('is-off', !isOn);
          button.setAttribute('aria-pressed', isOn ? 'true' : 'false');
          button.disabled = state.mode !== 'edit';
        }
      }
    }

    function createMiniMatrix(matrix) {
      const matrixEl = doc.createElement('div');
      matrixEl.className = 'mini-matrix';
      cloneMatrix(matrix).forEach(function (row) {
        row.forEach(function (cell) {
          const dot = doc.createElement('span');
          dot.className = 'mini-dot ' + (cell ? 'is-on' : 'is-off');
          matrixEl.appendChild(dot);
        });
      });
      return matrixEl;
    }

    function formatUpdatedAt(example) {
      if (!example || !Number.isFinite(example.updatedAt) || example.updatedAt < 1000) {
        return example && example.builtin && !example.stored ? '기본 예시' : '저장됨';
      }
      return new Date(example.updatedAt).toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
      });
    }

    function renderPresetStrip() {
      const fragment = doc.createDocumentFragment();
      const createCard = doc.createElement('button');
      createCard.type = 'button';
      createCard.className = 'preset-card preset-card--create' + (state.selectedKey === DRAFT_KEY ? ' is-active' : '');
      createCard.innerHTML = '<span class="preset-card__plus">+</span><strong class="preset-card__title">새로 만들기</strong><span class="preset-card__meta">비어 있는 8x8 캔버스</span>';
      createCard.addEventListener('click', function () {
        state.selectedKey = DRAFT_KEY;
        state.selectedExample = null;
        state.currentName = '';
        state.left = createEmptyMatrix();
        state.right = createEmptyMatrix();
        if (state.mode === 'edit') {
          state.editSnapshot = createEditSnapshot(state);
        }
        render();
      });
      fragment.appendChild(createCard);

      state.examples.forEach(function (example) {
        const card = doc.createElement('button');
        card.type = 'button';
        card.className = 'preset-card' + (state.selectedKey === example.id ? ' is-active' : '');
        card.dataset.id = example.id;

        const preview = doc.createElement('div');
        preview.className = 'preset-card__preview';
        preview.appendChild(createMiniMatrix(example.left));
        preview.appendChild(createMiniMatrix(example.right));

        const body = doc.createElement('div');
        body.className = 'preset-card__body';

        const title = doc.createElement('strong');
        title.className = 'preset-card__title';
        title.textContent = example.name;

        const meta = doc.createElement('span');
        meta.className = 'preset-card__meta';
        meta.textContent = (example.overridden ? '수정됨 · ' : (example.builtin ? '기본 예시 · ' : '저장됨 · ')) + formatUpdatedAt(example);

        body.appendChild(title);
        body.appendChild(meta);
        card.appendChild(preview);
        card.appendChild(body);
        card.addEventListener('click', function () {
          loadExample(example);
        });
        fragment.appendChild(card);
      });

      elements.presetStrip.innerHTML = '';
      elements.presetStrip.appendChild(fragment);
    }

    function renderCode() {
      if (!elements.codeOutput) {
        return;
      }
      elements.codeOutput.innerHTML = highlightPythonCode(state.left, state.right);
    }

    function renderTopPanel() {
      if (elements.sideToggle) {
        elements.sideToggle.classList.toggle('is-hidden', state.mode === 'edit');
      }
      if (elements.editModeActions) {
        elements.editModeActions.classList.toggle('is-hidden', state.mode !== 'edit');
      }
    }

    function renderEditorPanel() {
      if (elements.editorPanel) {
        elements.editorPanel.classList.toggle('is-hidden', state.mode !== 'edit');
      }

      if (elements.presetNameInput && doc.activeElement !== elements.presetNameInput) {
        elements.presetNameInput.value = state.currentName;
      }

      if (elements.deletePresetBtn) {
        const deletable = Boolean(state.selectedExample && state.selectedExample.stored);
        elements.deletePresetBtn.disabled = !deletable;
      }

      if (elements.stateHint) {
        if (state.selectedKey === DRAFT_KEY) {
          elements.stateHint.textContent = '새 예시입니다. 이름을 입력하고 저장하면 카드가 추가됩니다.';
        } else if (state.selectedExample && state.selectedExample.builtin && !state.selectedExample.stored) {
          elements.stateHint.textContent = '기본 예시입니다. 같은 이름으로 저장하면 사용자 버전으로 덮어씁니다.';
        } else {
          elements.stateHint.textContent = '같은 이름으로 저장하면 기존 내용을 덮어씁니다.';
        }
      }
    }

    function render() {
      renderInteractiveMatrix('left');
      renderInteractiveMatrix('right');
      renderTopPanel();
      renderEditorPanel();
      renderPresetStrip();
      renderCode();
    }

    function loadExample(example) {
      state.selectedKey = example.id;
      state.selectedExample = example;
      state.currentName = example.name;
      state.left = cloneMatrix(example.left);
      state.right = cloneMatrix(example.right);
      if (state.mode === 'edit') {
        state.editSnapshot = createEditSnapshot(state);
      }
      render();
    }

    async function refreshExamples() {
      state.examples = await storage.listExamples();
    }

    async function refreshAndSelectByName(name) {
      await refreshExamples();
      const normalized = normalizeName(name);
      const match = state.examples.find(function (example) {
        return normalizeName(example.name) === normalized;
      });
      if (match) {
        loadExample(match);
        return;
      }
      state.selectedKey = DRAFT_KEY;
      state.selectedExample = null;
      render();
    }

    function enterEditMode() {
      state.editSnapshot = createEditSnapshot(state);
      state.mode = 'edit';
      render();
      if (elements.presetNameInput) {
        elements.presetNameInput.focus();
        elements.presetNameInput.select();
      }
    }

    async function handleSave(forceOverwrite) {
      const name = normalizeName(elements.presetNameInput ? elements.presetNameInput.value : state.currentName);
      const existing = state.examples.find(function (example) {
        return normalizeName(example.name) === name;
      });

      if (!name) {
        showToast('예시 이름을 입력하세요.', 'warning');
        if (elements.presetNameInput) {
          elements.presetNameInput.focus();
        }
        return;
      }

      if (existing && !forceOverwrite) {
        openConfirmModal({
          title: '같은 이름의 예시가 있습니다.',
          message: '덮어쓰려면 확인을 누르고, 다른 이름으로 저장하려면 취소 후 이름을 변경하세요.',
          confirmLabel: '덮어쓰기',
          confirmTone: 'warning',
          onConfirm: function () {
            return handleSave(true);
          },
        });
        return;
      }

      await storage.saveExample({
        name: name,
        left: state.left,
        right: state.right,
      });
      state.currentName = name;
      state.mode = 'read';
      state.editSnapshot = null;
      await refreshAndSelectByName(name);
      showToast('예시를 저장했습니다.', 'success');
    }

    function handleCancelEdit() {
      applyEditSnapshot(state, state.editSnapshot);
      state.mode = 'read';
      state.editSnapshot = null;
      render();
    }

    async function handleDeleteCurrent() {
      if (!state.selectedExample || !state.selectedExample.stored) {
        return;
      }
      openConfirmModal({
        title: '예시를 삭제할까요?',
        message: '삭제하면 저장된 사용자 버전이 제거됩니다. 기본 예시는 다시 기본 상태로 돌아갑니다.',
        confirmLabel: '삭제',
        confirmTone: 'danger',
        onConfirm: async function () {
          const currentName = state.selectedExample.name;
          await storage.deleteExample(state.selectedExample);
          await refreshExamples();
          const restored = state.examples.find(function (example) {
            return normalizeName(example.name) === normalizeName(currentName);
          });
          if (restored && restored.builtin) {
            loadExample(restored);
          } else {
            state.selectedKey = DRAFT_KEY;
            state.selectedExample = null;
            state.currentName = '';
            state.left = createEmptyMatrix();
            state.right = createEmptyMatrix();
            if (state.mode === 'edit') {
              state.editSnapshot = createEditSnapshot(state);
            }
            render();
          }
          showToast('예시를 삭제했습니다.', 'info');
        },
      });
    }

    async function handleResetAll() {
      openConfirmModal({
        title: '모든 작업을 초기화할까요?',
        message: '사용자 저장 예시와 기본 예시 덮어쓰기 내용이 모두 삭제되고, 기본 예시만 다시 남습니다.',
        confirmLabel: '초기화',
        confirmTone: 'danger',
        onConfirm: async function () {
          await storage.resetAll();
          await refreshExamples();
          state.selectedKey = DRAFT_KEY;
          state.selectedExample = null;
          state.currentName = '';
          state.left = createEmptyMatrix();
          state.right = createEmptyMatrix();
          if (state.mode === 'edit') {
            state.editSnapshot = createEditSnapshot(state);
          }
          render();
          showToast('기본 예시만 남기고 초기화했습니다.', 'info');
        },
      });
    }

    async function copyCodeToClipboard() {
      const text = formatPythonCode(state.left, state.right);
      try {
        if (root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === 'function') {
          await root.navigator.clipboard.writeText(text);
        } else {
          const temp = doc.createElement('textarea');
          temp.value = text;
          temp.setAttribute('readonly', 'readonly');
          temp.style.position = 'fixed';
          temp.style.opacity = '0';
          doc.body.appendChild(temp);
          temp.select();
          doc.execCommand('copy');
          temp.remove();
        }
        showToast('Python 코드를 복사했습니다.', 'success');
      } catch (error) {
        showToast('코드 복사에 실패했습니다.', 'danger');
      }
    }

    buildInteractiveMatrix('left', elements.leftMatrix);
    buildInteractiveMatrix('right', elements.rightMatrix);

    if (elements.enterEditBtn) {
      elements.enterEditBtn.addEventListener('click', function () {
        enterEditMode();
      });
    }

    if (elements.presetNameInput) {
      elements.presetNameInput.addEventListener('input', function (event) {
        state.currentName = event.target.value;
      });
    }

    if (elements.savePresetBtn) {
      elements.savePresetBtn.addEventListener('click', function () {
        handleSave(false);
      });
    }

    if (elements.cancelEditBtn) {
      elements.cancelEditBtn.addEventListener('click', function () {
        handleCancelEdit();
      });
    }

    if (elements.deletePresetBtn) {
      elements.deletePresetBtn.addEventListener('click', function () {
        handleDeleteCurrent();
      });
    }

    if (elements.resetAllBtn) {
      elements.resetAllBtn.addEventListener('click', function () {
        handleResetAll();
      });
    }

    if (elements.copyCodeBtn) {
      elements.copyCodeBtn.addEventListener('click', function () {
        copyCodeToClipboard();
      });
    }

    if (elements.cancelConfirmBtn) {
      elements.cancelConfirmBtn.addEventListener('click', function () {
        closeConfirmModal();
      });
    }

    if (elements.acceptConfirmBtn) {
      elements.acceptConfirmBtn.addEventListener('click', function () {
        handleConfirmAccept();
      });
    }

    if (elements.confirmModal) {
      elements.confirmModal.addEventListener('click', function (event) {
        if (event.target === elements.confirmModal) {
          closeConfirmModal();
        }
      });
    }

    refreshExamples().then(function () {
      render();
    }).catch(function () {
      showToast('예시 저장소를 준비하지 못했습니다.', 'danger');
      render();
    });

    return {
      render: render,
      refreshExamples: refreshExamples,
    };
  }

  return {
    createEmptyMatrix: createEmptyMatrix,
    createEditSnapshot: createEditSnapshot,
    applyEditSnapshot: applyEditSnapshot,
    createPaintSession: createPaintSession,
    applyPaintSession: applyPaintSession,
    matrixRowsToBytes: matrixRowsToBytes,
    formatPythonCode: formatPythonCode,
    highlightPythonCode: highlightPythonCode,
    createBuiltInExamples: createBuiltInExamples,
    init: init,
  };
}));
