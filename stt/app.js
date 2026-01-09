(function () {
      /* ===== DOM 캐시 ===== */
      const headerSettingsBar = document.querySelector('.header-settings-bar');
      const headerToggleBtn = document.getElementById('headerToggleBtn');
      const hamburgerBtn = document.getElementById('hamburgerBtn');
      const navOverlay = document.getElementById('navOverlay');
      const overlayMount = document.getElementById('overlaySettingsMount');
      const headerEl = document.querySelector('.header');
      const containerEl = document.querySelector('.ble-interface .container');
      const mobileHint = document.querySelector('.mobile-hint');

      const deviceSelect = document.getElementById('deviceSelect');
      const editorButton = document.getElementById('editorButton');
      const connectButton = document.getElementById('connectButton');
      const connectBtnTextEl = document.getElementById('connectBtnText');
      const connectionToggle = document.getElementById('connectionToggle');
      const sttToggleBtn = document.getElementById('sttToggleBtn');
      const sttVisualizer = document.getElementById('sttVisualizer');
      const sttWaveCanvas = document.getElementById('sttWaveCanvas');
      const sttLangSelect = document.getElementById('sttLang');
      const matchValueEl = document.getElementById('matchValue');
      const matchKeyEl = document.getElementById('matchKey');

      const serialStatusEl = document.getElementById('serialStatus');
      const deviceLabelEl = document.getElementById('currentDevice');
      const connTypeLabelEl = document.getElementById('sttConnectionTypeLabel');

      /* ===== 유틸 ===== */
      const UI_LABEL = { microbit: '마이크로비트', esp32: 'ESP32', orange: '오렌지보드' };
      const toStateDevice = (ui) => ui;
      const toUiDevice = (state) => state;
      const isMobileWidth = () => window.matchMedia('(max-width: 900px)').matches;

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

      function setConnectBtnText(t) { connectBtnTextEl ? (connectBtnTextEl.textContent = t) : (connectButton.textContent = t); }
      function updateConnTypeLabel() { if (connTypeLabelEl) connTypeLabelEl.textContent = (window.isBluetoothMode ? '블루투스 연결:' : '시리얼 연결:'); }
      function applyThemeByDevice(ui) {
        const b = document.body;
        b.classList.remove('theme-esp32', 'theme-orange', 'theme-microbit');
        if (ui === 'esp32') b.classList.add('theme-esp32');
        else if (ui === 'orange') b.classList.add('theme-orange');
        else b.classList.add('theme-microbit');
      }

      /* ===== AppState/ConnectionManager ===== */
      window.isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle/i.test(navigator.userAgent);
      window.isBluetoothMode = window.isMobileDevice ? true : false;

      const initialUiDev = (deviceSelect && deviceSelect.value) || 'esp32';
      window.currentDeviceMode = initialUiDev;
      applyThemeByDevice(initialUiDev);
      if (deviceLabelEl) deviceLabelEl.textContent = UI_LABEL[initialUiDev] || 'ESP32';

      function onStatusChange({ transport, statusText, status }) {
        if (status === 'connecting') setConnectBtnText('연결 중…');
        else if (status === 'connected') setConnectBtnText('연결 해제');
        else setConnectBtnText(window.isBluetoothMode ? '블루투스 연결' : '시리얼 연결');

        if (serialStatusEl) {
          serialStatusEl.textContent = statusText || (status === 'connected' ? '연결됨' : status === 'connecting' ? '연결 중…' : '연결 안됨');
          serialStatusEl.className = 'status-value ' + (status === 'connected' ? 'status-ready' : status === 'connecting' ? 'status-waiting' : 'status-disconnected');
        }
      }

      window.updateSerialStatus = function (text, className) {
        const cls = className || '';
        let status = 'disconnected';
        if (/connecting/.test(cls) || /연결 중/.test(text || '')) status = 'connecting';
        else if (/connected/.test(cls) || /연결됨/.test(text || '')) status = 'connected';

        if (serialStatusEl) {
          serialStatusEl.textContent = text || (status === 'connected' ? '연결됨' : status === 'connecting' ? '연결 중…' : '연결 안됨');
          serialStatusEl.className = 'status-value ' + (status === 'connected' ? 'status-ready' : status === 'connecting' ? 'status-waiting' : 'status-disconnected');
        }
        if (window.connectionManager?.notifySerialStatusFromUI) {
          window.connectionManager.notifySerialStatusFromUI(text, className);
        }
        if (status === 'connected') setConnectBtnText('연결 해제');
      };

      window.AppState.setDevice(toStateDevice(initialUiDev));
      window.AppState.setTransport(window.isBluetoothMode ? 'ble' : 'serial');
      window.connectionManager = new window.ConnectionManager(window.AppState, { onStatusChange });

      updateConnTypeLabel();
      setConnectBtnText(window.isBluetoothMode ? '블루투스 연결' : '시리얼 연결');

      /* ===== 모바일: BLE 강제 ===== */
      function enforceMobileBleMode() {
        window.isBluetoothMode = true;
        window.AppState.setTransport('ble');
        window.connectionManager.setTransport('ble');

        connectionToggle?.classList.add('active', 'locked');
        connectionToggle.style.pointerEvents = 'none';
        connectionToggle.setAttribute('aria-disabled', 'true');

        setConnectBtnText('블루투스 연결');
        try { window.closeSerialPort && window.closeSerialPort(); } catch (e) { }
        updateConnTypeLabel();
      }
      function releaseDesktopMode() {
        connectionToggle?.classList.remove('locked');
        connectionToggle?.removeAttribute('aria-disabled');
        connectionToggle.style.pointerEvents = '';
        connectionToggle.classList.toggle('active', !!window.isBluetoothMode);
        setConnectBtnText(window.isBluetoothMode ? '블루투스 연결' : '시리얼 연결');
        updateConnTypeLabel();
      }
      function handleMobileModeMaybeChanged() {
        const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle/i.test(navigator.userAgent);
        window.isMobileDevice = mobile;
        if (mobile) enforceMobileBleMode(); else releaseDesktopMode();
      }
      handleMobileModeMaybeChanged();

      /* ===== 연결 모드 토글 ===== */
      connectionToggle?.addEventListener('click', function () {
        handleMobileModeMaybeChanged();
        if (window.isMobileDevice) { alert('모바일에서는 블루투스만 지원됩니다.'); enforceMobileBleMode(); return; }

        window.isBluetoothMode = !window.isBluetoothMode;
        connectionToggle.classList.toggle('active', window.isBluetoothMode);
        const transport = window.isBluetoothMode ? 'ble' : 'serial';
        window.AppState.setTransport(transport);
        window.connectionManager.setTransport(transport);
        if (window.isBluetoothMode && typeof window.closeSerialPort === 'function') {
          try { window.closeSerialPort(); } catch (e) { }
        }
        updateConnTypeLabel();
        setConnectBtnText(window.isBluetoothMode ? '블루투스 연결' : '시리얼 연결');
      });

      /* ===== 디바이스 드롭다운 & 에디터 버튼 ===== */
      const EDITOR_LINKS = {
        microbit: { label: '마이크로비트 에디터 열기', url: 'https://makecode.microbit.org/#editor' },
        esp32: { label: 'Thonny IDE 다운로드', url: 'https://thonny.org/' },
        orange: { label: 'Arduino IDE 다운로드', url: 'https://www.arduino.cc/en/software' },
      };
      function updateEditorButton(ui) {
        const cfg = EDITOR_LINKS[ui] || EDITOR_LINKS.esp32;
        if (editorButton) { editorButton.textContent = cfg.label; editorButton.dataset.url = cfg.url; }
      }
      editorButton?.addEventListener('click', () => {
        const url = editorButton?.dataset.url || EDITOR_LINKS.esp32.url;
        window.open(url, '_blank', 'noopener,noreferrer');
      });
      updateEditorButton(initialUiDev);

      deviceSelect?.addEventListener('change', () => {
        const ui = deviceSelect.value;
        window.currentDeviceMode = ui;
        window.AppState.setDevice(toStateDevice(ui));
        window.connectionManager.setDevice(toStateDevice(ui));
        applyThemeByDevice(ui);
        if (deviceLabelEl) deviceLabelEl.textContent = UI_LABEL[ui] || 'ESP32';
        updateEditorButton(ui);
      });

      /* ===== 연결 버튼 ===== */
      connectButton?.addEventListener('click', async () => {
        try {
          if (window.connectionManager.isConnected()) {
            setConnectBtnText('연결 해제 중…');
            await window.connectionManager.disconnect();
          } else {
            setConnectBtnText('연결 중…');
            await window.connectionManager.connect();
          }
        } catch (e) {
          if (e?.name === 'NotFoundError' || e?.name === 'NotAllowedError') {
            // 사용자 취소/거부는 조용히 무시
            console.warn('연결 취소/거부', e);
          } else {
            console.error(e);
            showNotification('연결 처리 중 오류가 발생했습니다.', 'error');
          }
        } finally {
          if (window.connectionManager.isConnected()) setConnectBtnText('연결 해제');
          else setConnectBtnText(window.isBluetoothMode ? '블루투스 연결' : '시리얼 연결');
        }
      });

      /* ===== 헤더 접기/펼치기 & 반응형 오버레이 이동 ===== */
      let previousDesktopCollapsed = false;
      let placeholder = null;

      function moveToOverlay() {
        if (!headerSettingsBar || !overlayMount) return;
        if (headerSettingsBar.parentNode === overlayMount) {
          if (mobileHint) mobileHint.style.display = 'block';
          if (headerToggleBtn) headerToggleBtn.style.display = 'none';
          return;
        }
        previousDesktopCollapsed = headerSettingsBar.classList.contains('closed');
        headerSettingsBar.classList.remove('closed');
        if (!placeholder) {
          placeholder = document.createElement('div');
          placeholder.id = 'headerSettingsPlaceholder';
          headerSettingsBar.parentNode?.insertBefore(placeholder, headerSettingsBar);
        }
        overlayMount.appendChild(headerSettingsBar);
        if (mobileHint) mobileHint.style.display = 'block';
        if (headerToggleBtn) headerToggleBtn.style.display = 'none';
      }
      function moveToDesktop() {
        if (!headerSettingsBar || !placeholder || !placeholder.parentNode) return;
        if (headerSettingsBar.previousSibling !== placeholder) {
          placeholder.parentNode.insertBefore(headerSettingsBar, placeholder);
        }
        placeholder.remove();
        placeholder = null;
        if (mobileHint) mobileHint.style.display = 'none';
        if (headerToggleBtn) headerToggleBtn.style.display = '';
        if (previousDesktopCollapsed) {
          headerSettingsBar.classList.add('closed');
          headerToggleBtn?.classList.add('closed');
          if (containerEl) containerEl.style.paddingTop = '180px';
        } else {
          headerSettingsBar.classList.remove('closed');
          headerToggleBtn?.classList.remove('closed');
          if (containerEl) containerEl.style.paddingTop = '320px';
        }
      }
      function applyLayout() {
        if (isMobileWidth()) {
          moveToOverlay();
          if (headerEl && containerEl) {
            const headerRect = headerEl.getBoundingClientRect();
            const topPadding = Math.max(0, headerRect.height + 30);
            containerEl.style.paddingTop = topPadding + 'px';
          }
        } else {
          moveToDesktop();
          if (navOverlay?.classList.contains('open')) {
            navOverlay.classList.remove('open');
            hamburgerBtn?.classList.remove('open');
            document.body.style.overflow = '';
          }
          if (containerEl && headerSettingsBar) {
            const isClosed = headerSettingsBar.classList.contains('closed');
            containerEl.style.paddingTop = isClosed ? '180px' : '375px';
          }
        }
      }

      if (headerToggleBtn && headerSettingsBar) {
        headerToggleBtn.addEventListener('click', () => {
          const isClosed = headerSettingsBar.classList.toggle('closed');
          headerToggleBtn.classList.toggle('closed');
          const isMobile = window.matchMedia('(max-width: 900px)').matches;
          if (isMobile) return;
          const container = document.querySelector('.container');
          if (container) container.style.paddingTop = isClosed ? '180px' : '375px';
        });
      }


      // 햄버거 열고/닫기
      hamburgerBtn?.addEventListener('click', () => {
        navOverlay?.classList.toggle('open');
        hamburgerBtn.classList.toggle('open');
        document.body.style.overflow = navOverlay?.classList.contains('open') ? 'hidden' : '';
      });
      // 오버레이 영역 밖 클릭 시 닫기
      navOverlay?.addEventListener('click', (e) => {
        if (e.target === navOverlay) {
          navOverlay.classList.remove('open');
          hamburgerBtn?.classList.remove('open');
          document.body.style.overflow = '';
        }
      });

      // 초기/리사이즈 반영
      window.addEventListener('resize', () => {
        // 모바일 키보드 대응 rAF 디바운스
        if (window._resizeRaf) cancelAnimationFrame(window._resizeRaf);
        window._resizeRaf = requestAnimationFrame(() => {
          applyLayout();
          syncSttVisualizerSize();
        });
      });
      window.addEventListener('orientationchange', applyLayout);
      document.addEventListener('DOMContentLoaded', applyLayout);
      applyLayout();
      syncSttVisualizerSize();

      /* ===== STT 마이크/파형 표시 ===== */
      const STT_SILENCE_MS = 4000;
      const STT_SILENCE_THRESHOLD = 0.015;
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      let sttAudioCtx = null;
      let sttAnalyser = null;
      let sttMediaStream = null;
      let sttSource = null;
      let sttRafId = null;
      let sttLastSoundTs = 0;
      let sttIsListening = false;
      let sttRecognition = null;
      let sttIsRecognizing = false;
      let sttLastMatchedValue = null;
      let sttHadTranscript = false;

      const waveCtx = sttWaveCanvas ? sttWaveCanvas.getContext('2d') : null;

      function updateSttUi(active) {
        if (sttToggleBtn) {
          sttToggleBtn.textContent = active ? '음성 인식 종료' : '음성 인식 시작';
          sttToggleBtn.classList.toggle('listening', active);
          sttToggleBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
        if (sttVisualizer) {
          sttVisualizer.classList.toggle('active', active);
        }
        syncSttVisualizerSize();
      }

      function clearWave() {
        if (!waveCtx || !sttWaveCanvas) return;
        waveCtx.clearRect(0, 0, sttWaveCanvas.width, sttWaveCanvas.height);
      }

      function stopSttListening() {
        sttIsListening = false;
        if (sttRafId) cancelAnimationFrame(sttRafId);
        sttRafId = null;
        if (sttIsRecognizing && sttRecognition) {
          try { sttRecognition.stop(); } catch (_) { }
        }
        sttIsRecognizing = false;
        if (sttMediaStream) {
          sttMediaStream.getTracks().forEach(t => t.stop());
          sttMediaStream = null;
        }
        if (sttAudioCtx) {
          sttAudioCtx.close().catch(() => { });
          sttAudioCtx = null;
        }
        sttAnalyser = null;
        sttSource = null;
        updateSttUi(false);
        clearWave();
        if (sttHadTranscript) sendMatchIfPossible();
        sttHadTranscript = false;
        syncSttVisualizerSize();
      }

      function updateSttText(text) {
        const safe = sanitizeInput(text);
        window.demoUpdateSTT(safe);
      }

      function resetSttDisplay() {
        const sttTextEl = document.getElementById('sttText');
        if (sttTextEl) {
          sttTextEl.textContent = '-';
          sttTextEl.className = 'status-value status-waiting';
        }
        if (matchKeyEl) matchKeyEl.textContent = '-';
        if (matchValueEl) matchValueEl.textContent = '-';
        sttLastMatchedValue = null;
        sttHadTranscript = false;
      }

      async function sendMatchIfPossible() {
        if (!sttLastMatchedValue) return;
        try {
          if (window.connectionManager?.isConnected()) {
            await window.connectionManager.send(sttLastMatchedValue);
            return;
          }
          const mgr = window.AppState?.ble?.manager || window.bleManager;
          if (mgr?.isConnected?.()) {
            await mgr.sendMessage(sttLastMatchedValue);
          }
        } catch (err) {
          console.warn('매칭 값 전송 실패', err);
        }
      }

      function startSpeechRecognition() {
        if (!SpeechRecognition) {
          alert('브라우저가 음성 인식을 지원하지 않습니다.');
          return;
        }
        const lang = sttLangSelect?.value || 'ko-KR';
        sttRecognition = new SpeechRecognition();
        sttRecognition.lang = lang;
        sttRecognition.interimResults = true;
        sttRecognition.continuous = true;

        sttRecognition.onresult = (event) => {
          if (!event.results?.length) return;
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            transcript += res[0]?.transcript || '';
          }
          if (transcript) {
            sttHadTranscript = true;
            updateSttText(transcript);
          }
        };

        sttRecognition.onerror = (err) => {
          if (err.error === 'no-speech' || err.error === 'aborted') {
            stopSttListening();
            return;
          }
          console.error('STT error', err);
          stopSttListening();
        };

        sttRecognition.onend = () => {
          sttIsRecognizing = false;
          if (sttIsListening) {
            // recognition ended unexpectedly; stop UI to stay in sync
            stopSttListening();
          }
        };

        sttRecognition.start();
        sttIsRecognizing = true;
      }

      function drawWave() {
        if (!sttAnalyser || !waveCtx || !sttWaveCanvas) return;
        sttRafId = requestAnimationFrame(drawWave);
        const bufferLength = sttAnalyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        sttAnalyser.getByteTimeDomainData(dataArray);

        sttWaveCanvas.width = sttWaveCanvas.clientWidth * (window.devicePixelRatio || 1);
        sttWaveCanvas.height = 60 * (window.devicePixelRatio || 1);

        waveCtx.clearRect(0, 0, sttWaveCanvas.width, sttWaveCanvas.height);
        waveCtx.lineWidth = 2 * (window.devicePixelRatio || 1);
        waveCtx.strokeStyle = '#764ba2';
        waveCtx.beginPath();

        let sum = 0;
        const sliceWidth = sttWaveCanvas.width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += Math.abs(v);
          const y = (v * 0.5 + 0.5) * sttWaveCanvas.height;
          if (i === 0) waveCtx.moveTo(x, y); else waveCtx.lineTo(x, y);
          x += sliceWidth;
        }
        waveCtx.stroke();

        const avg = sum / bufferLength;
        const now = performance.now();
        if (avg > STT_SILENCE_THRESHOLD) sttLastSoundTs = now;
        if (now - sttLastSoundTs > STT_SILENCE_MS) {
          stopSttListening();
        }
      }

      async function startSttListening() {
        if (!navigator.mediaDevices?.getUserMedia) {
          alert('이 브라우저에서는 마이크 접근을 지원하지 않습니다.');
          return;
        }
        if (sttIsListening) {
          stopSttListening();
          return;
        }
        sttHadTranscript = false;
        sttLastMatchedValue = null;
        resetSttDisplay();
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          sttAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          sttAnalyser = sttAudioCtx.createAnalyser();
          sttAnalyser.fftSize = 2048;
          sttSource = sttAudioCtx.createMediaStreamSource(stream);
          sttSource.connect(sttAnalyser);
          sttMediaStream = stream;
          sttLastSoundTs = performance.now();
        sttIsListening = true;
        updateSttUi(true);
        syncSttVisualizerSize();
        startSpeechRecognition();
        drawWave();
      } catch (err) {
        console.error(err);
        alert('마이크 사용 권한을 확인해주세요.\n' + (err?.message || err));
          stopSttListening();
        }
      }

      sttToggleBtn?.addEventListener('click', startSttListening);

      /* ===== STT 결과 덮어쓰기 유틸 ===== */
      window.demoUpdateSTT = function (text) {
        const el = document.getElementById('sttText');
        if (!el) return;
        const safeText = sanitizeInput(text);
        el.textContent = safeText || '-';
        el.className = 'status-value ' + (safeText ? 'status-ready' : 'status-waiting');
        const { key, value } = findMatch(safeText);
        document.getElementById('matchKey').textContent = key || '-';
        document.getElementById('matchValue').textContent = value || '-';
        sttLastMatchedValue = value || null;
      };

      /* ===== KV 매핑 (전역 편집 토글 + 행 삭제) ===== */
      const kvSectionEl = document.querySelector('.kv-section');
      const kvTbody = document.getElementById('kvTbody');
      const kvKeyInput = document.getElementById('kvKey');
      const kvValInput = document.getElementById('kvValue');
      const addPairBtn = document.getElementById('addPairBtn');
      const kvEditToggle = document.getElementById('kvEditToggle');
      const kvForm = document.getElementById('kvForm');
      const importBtn = document.getElementById('importBtn');
      const exportBtn = document.getElementById('exportBtn');
      const resetBtn = document.getElementById('resetBtn');
      const importFile = document.getElementById('importFile');

      const DEFAULT_KV_DATA = [
        { key: '전등 켜', value: 'LED_ON' },
        { key: '전등 꺼', value: 'LED_OFF' },
      ];
      const KV_STORAGE_KEY = 'edu_kv_map';
      const MAX_KV_ITEMS = 200;
      const MAX_FIELD_LENGTH = 15;
      const MAX_IMPORT_BYTES = 200000;

      const cloneDefaultKvData = () => DEFAULT_KV_DATA.map(pair => ({ ...pair }));

      const sanitizeInput = (value) => {
        let text = (value ?? '').toString();
        text = text.replace(/[\u0000-\u001F\u007F]/g, '');
        text = text.replace(/[<>]/g, '');
        text = text.trim();
        if (text.length > MAX_FIELD_LENGTH) text = text.slice(0, MAX_FIELD_LENGTH);
        return text;
      };

      const normalizeKvEntry = (entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const key = sanitizeInput(entry.key);
        const value = sanitizeInput(entry.value);
        if (!key || !value) return null;
        return { key, value };
      };

      const normalizeForMatch = (text) => sanitizeInput(text).replace(/\s+/g, '').toLowerCase();

      const validateKvArray = (data) => {
        if (!Array.isArray(data)) return null;
        const safe = [];
        for (const raw of data.slice(0, MAX_KV_ITEMS)) {
          const normalized = normalizeKvEntry(raw);
          if (normalized) safe.push(normalized);
        }
        return safe.length ? safe : null;
      };

      const persistKvData = () => {
        try {
          localStorage.setItem(KV_STORAGE_KEY, JSON.stringify(kvData));
        } catch (err) {
          console.warn('KV 저장 실패', err);
        }
      };

      const loadKvDataFromStorage = () => {
        try {
          const raw = localStorage.getItem(KV_STORAGE_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return validateKvArray(parsed);
        } catch (err) {
          console.warn('KV 로드 실패', err);
          return null;
        }
      };

      if (kvKeyInput) kvKeyInput.setAttribute('maxlength', String(MAX_FIELD_LENGTH));
      if (kvValInput) kvValInput.setAttribute('maxlength', String(MAX_FIELD_LENGTH));
      if (kvForm) {
        kvForm.addEventListener('input', (e) => {
          const target = e.target;
          if (!(target instanceof HTMLInputElement)) return;
          const cleaned = sanitizeInput(target.value);
          if (cleaned !== target.value) target.value = cleaned;
        });
      }
      const kvCharLimitNote = document.getElementById('kvCharLimitNote');

      let isEditMode = false;
      let kvData = loadKvDataFromStorage() || cloneDefaultKvData();

      function renderTable() {
        if (!kvTbody) return;
        kvTbody.innerHTML = '';
        kvData.forEach((row, idx) => {
          const tr = document.createElement('tr');

          const tdNo = document.createElement('td');
          tdNo.textContent = String(idx + 1);
          tr.appendChild(tdNo);

          const tdKey = document.createElement('td');
          if (isEditMode) {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = row.key;
            inp.className = 'kv-inline-input';
            inp.addEventListener('input', (e) => {
              const sanitized = sanitizeInput(e.target.value);
              if (!sanitized) {
                e.target.value = kvData[idx].key || '';
                return;
              }
              kvData[idx].key = sanitized;
              e.target.value = sanitized;
              persistKvData();
            });
            tdKey.appendChild(inp);
          } else {
            tdKey.textContent = row.key;
          }
          tr.appendChild(tdKey);

          const tdVal = document.createElement('td');
          if (isEditMode) {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = row.value;
            inp.className = 'kv-inline-input';
            inp.addEventListener('input', (e) => {
              const sanitized = sanitizeInput(e.target.value);
              if (!sanitized) {
                e.target.value = kvData[idx].value || '';
                return;
              }
              kvData[idx].value = sanitized;
              e.target.value = sanitized;
              persistKvData();
            });
            tdVal.appendChild(inp);
          } else {
            tdVal.textContent = row.value;
          }
          tr.appendChild(tdVal);

          const tdAct = document.createElement('td');
          tdAct.className = 'kv-row-actions';
          const delBtn = document.createElement('button');
          delBtn.className = 'btn btn-small btn-danger';
          delBtn.type = 'button';
            delBtn.textContent = '삭제';
            delBtn.disabled = !isEditMode;
            delBtn.title = isEditMode ? '행 삭제' : '편집 모드에서만 삭제 가능';
            delBtn.addEventListener('click', () => {
              if (!isEditMode) return;
              kvData.splice(idx, 1);
              persistKvData();
              renderTable();
            });
            tdAct.appendChild(delBtn);
            tr.appendChild(tdAct);

          kvTbody.appendChild(tr);
        });
      }

      function findMatch(text) {
        const normalizedText = normalizeForMatch(text);
        if (!normalizedText) return { key: null, value: null };
        let best = null;
        kvData.forEach((r) => {
          const normKey = normalizeForMatch(r.key);
          if (!normKey) return;
          const minLen = Math.ceil(normKey.length * 0.75);
          if (normalizedText.length < minLen) return;
          if (normalizedText.includes(normKey)) {
            if (!best || normKey.length > best.normLen) {
              best = { key: r.key, value: r.value, normLen: normKey.length };
            }
          }
        });
        return best ? { key: best.key, value: best.value } : { key: null, value: null };
      }

      function setEditMode(enabled) {
        isEditMode = enabled;
        if (kvEditToggle) kvEditToggle.textContent = isEditMode ? '완료' : '편집';
        kvForm?.classList.toggle('locked', isEditMode);
        kvSectionEl?.classList.toggle('editing', isEditMode);
        kvSectionEl?.classList.toggle('view-mode', !isEditMode);
        if (kvCharLimitNote) kvCharLimitNote.style.display = isEditMode ? '' : 'none';
        if (addPairBtn) addPairBtn.disabled = !isEditMode;
        if (resetBtn) resetBtn.disabled = !isEditMode;
        if (kvKeyInput) kvKeyInput.disabled = !isEditMode;
        if (kvValInput) kvValInput.disabled = !isEditMode;
        renderTable();
      }

      addPairBtn?.addEventListener('click', () => {
        if (!isEditMode) { alert('편집 버튼을 눌러 편집 모드를 켜주세요.'); return; }
        const k = sanitizeInput(kvKeyInput?.value);
        const v = sanitizeInput(kvValInput?.value);
        if (!k || !v) { alert('Key와 Value를 모두 입력해주세요.'); return; }
        kvData.push({ key: k, value: v });
        kvKeyInput.value = ''; kvValInput.value = '';
        persistKvData();
        renderTable();
      });

      kvEditToggle?.addEventListener('click', () => setEditMode(!isEditMode));

      exportBtn?.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(kvData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'kv-map.json';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      });

      importBtn?.addEventListener('click', () => importFile?.click());
      importFile?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        try {
          if (file.size > MAX_IMPORT_BYTES) throw new Error('파일 크기가 너무 큽니다 (200KB 제한).');
          const text = await file.text();
          const lowerText = text.toLowerCase();
          if (lowerText.includes('<script') || lowerText.includes('</script') || lowerText.includes('<?xml')) {
            throw new Error('위험한 태그가 포함된 파일은 허용되지 않습니다.');
          }
          const json = JSON.parse(text);
          const validated = validateKvArray(json);
          if (!validated) throw new Error('Key/Value 배열 형식이 아니거나 값이 없습니다.');
          kvData = validated;
          persistKvData();
          renderTable();
        } catch (err) {
          showNotification('불러오기 실패: ' + (err?.message || err), 'error');
        } finally {
          e.target.value = '';
        }
      });

      resetBtn?.addEventListener('click', () => {
        if (!confirm('매핑을 초기값으로 되돌릴까요?')) return;
        kvData = cloneDefaultKvData();
        if (kvKeyInput) kvKeyInput.value = '';
        if (kvValInput) kvValInput.value = '';
        persistKvData();
        renderTable();
      });

      // 초기 테이블 렌더
      setEditMode(false);
    })();
  
      function syncSttVisualizerSize() {
        if (!sttVisualizer || !sttToggleBtn) return;
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        if (vw < 800) {
          const btnWidth = sttToggleBtn.offsetWidth || 0;
          if (btnWidth) {
            sttVisualizer.style.width = btnWidth + 'px';
            sttVisualizer.style.maxWidth = btnWidth + 'px';
          } else {
            sttVisualizer.style.width = '';
            sttVisualizer.style.maxWidth = '';
          }
          sttVisualizer.style.alignSelf = 'flex-end';
        } else {
          sttVisualizer.style.width = '';
          sttVisualizer.style.maxWidth = '';
          sttVisualizer.style.alignSelf = '';
        }
      }
