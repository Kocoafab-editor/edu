(function (global) {
  "use strict";

  class ConnectionManager {
    constructor(appState, opts = {}) {
      if (!appState) throw new Error("ConnectionManager: AppState가 필요합니다.");
      this.app = appState;
      this.onStatusChange = typeof opts.onStatusChange === 'function' ? opts.onStatusChange : () => {};
      this._bleReady = false;
      this._lastSentValue = null;   // (선택) 동일 값 중복 전송 최소화용
      this._lastSentAt = 0;
      this.dedupe = !!opts.dedupe;
    }

    /* ---------- 외부(UI) Serial 상태 전달 ---------- */
    notifySerialStatusFromUI(statusText, className) {
      const connected   = /status-connected/.test(className || "") || /연결됨|connected/i.test(statusText || "");
      const connecting  = /status-connecting/.test(className || "") || /연결 중|connecting/i.test(statusText || "");
      this.app.setSerialPortOpen(!!connected);
      const status = connected ? "connected" : (connecting ? "connecting" : "disconnected");
      this._emit("serial", statusText, status);
    }

    /* ---------- 내부 공통 ---------- */
    _emit(transport, text, status) {
      try { this.onStatusChange({ transport, statusText: text, status }); } catch {}
    }

    setDevice(device) {
      this.app.setDevice(device);
      if (this.app.ble.manager && typeof this.app.ble.manager.setMode === 'function') {
        try { this.app.ble.manager.setMode(this.app.device === 'uno' ? 'orange' : this.app.device); } catch {}
      }
    }

    setTransport(transport) {
      const prev = this.app.transport;
      this.app.setTransport(transport);
      if (transport === 'ble' && prev !== 'ble' && global.serialAdapter?.isConnected()) {
        try { global.serialAdapter.disconnect(); } catch {}
      }
      this._emit(transport, '연결 안됨', "disconnected");
    }

    /* ---------- 연결 ---------- */
    _ensureBle() {
      if (this._bleReady && this.app.ble.manager) return this.app.ble.manager;
      if (!global.BLE || !global.BLE.BLEManager) throw new Error("BLE.BLEManager 가 로드되지 않았습니다.");
      const mgr = new global.BLE.BLEManager();
      try { mgr.setMode(this.app.device === 'uno' ? 'orange' : this.app.device); } catch {}
      mgr.onStatusChange((text, status) => {
        const mapped = (status === 'connected') ? 'connected' : (status === 'connecting' ? 'connecting' : 'disconnected');
        this.app.setBleConnected(mapped === 'connected');
        this._emit('ble', text, mapped);
      });
      if (mgr.onReceive) mgr.onReceive((msg) => { /* console.log('[BLE RX]', msg); */ });
      global.bleManager = mgr;     // 호환 유지
      this.app.setBleManager(mgr);
      this._bleReady = true;
      return mgr;
    }

    async connect() {
      if (this.app.transport === 'ble') {
        const bm = this._ensureBle();
        this._emit('ble', '연결 중…', 'connecting');
        await bm.connect();
      } else {
        if (!global.serialAdapter) throw new Error('serial_adapter.js가 로드되지 않았습니다.');
        this._emit('serial', '연결 시도중…', 'connecting');
        await global.serialAdapter.connect();
      }
    }

    async disconnect() {
      if (this.app.transport === 'ble') {
        const bm = this.app.ble.manager;
        if (bm && bm.isConnected()) await bm.disconnect();
      } else {
        if (global.serialAdapter?.isConnected()) await global.serialAdapter.disconnect();
      }
    }

    isConnected() {
      return (this.app.transport === 'ble')
        ? !!(this.app.ble.manager && this.app.ble.manager.isConnected())
        : !!global.serialAdapter?.isConnected();
    }

    /* ---------- 즉시 전송 (스케치는 타이머 쓰로틀로 호출) ---------- */
    async send(text) {
      const payload = String(text ?? '');

      // (선택) 직전 전송값과 같으면 스킵 — 필요 없으면 이 4줄 제거해도 됩니다.
      if (this.dedpue && payload === this._lastSentValue) {
        this._lastSentAt = Date.now();
        return;
      }

      if (this.app.transport === 'ble') {
        const bm = this._ensureBle();
        if (!bm.isConnected()) throw new Error('BLE가 연결되지 않았습니다.');
        await bm.sendMessage(payload); // BLE는 내부 EOL 처리
      } else {
        if (!global.serialAdapter?.isConnected()) throw new Error('Serial이 연결되지 않았습니다.');
        await global.serialAdapter.write(payload);   // SerialAdapter가 AppState.eol 부착
      }

      this._lastSentAt = Date.now();
      this._lastSentValue = payload;
    }
  }

  // 클래스만 노출
  global.ConnectionManager = ConnectionManager;
})(window);