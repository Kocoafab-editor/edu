(function (global) {
  "use strict";

  class ConnectionManager {
    constructor(appState, opts = {}) {
      if (!appState) throw new Error("ConnectionManager: AppState is required.");
      this.app = appState;
      this.onStatusChange = typeof opts.onStatusChange === 'function' ? opts.onStatusChange : () => {};
      this._onReceive = typeof opts.onReceive === 'function' ? opts.onReceive : null;
      this._serialBound = false;
      this._bleReady = false;
      this._lastSentValue = null;
      this._lastSentAt = 0;
      this.dedupe = !!opts.dedupe;
      this._bindSerialAdapter();
    }

    /* ---------- (UI) Serial status sync ---------- */
    notifySerialStatusFromUI(statusText, className) {
      const connected = /status-connected/.test(className || "") || /connected/i.test(statusText || "");
      const connecting = /status-connecting/.test(className || "") || /connecting/i.test(statusText || "");
      this.app.setSerialPortOpen(!!connected);
      const status = connected ? "connected" : (connecting ? "connecting" : "disconnected");
      this._emit("serial", statusText, status);
    }

    /* ---------- Status ---------- */
    _emit(transport, text, status) {
      try { this.onStatusChange({ transport, statusText: text, status }); } catch {}
    }

    _emitReceive(transport, text) {
      if (typeof this._onReceive === 'function') {
        try { this._onReceive({ transport, text }); } catch {}
      }
    }

    onReceive(cb) {
      this._onReceive = (typeof cb === 'function') ? cb : null;
      this._bindSerialAdapter();
      this._bindBleReceive();
    }

    _bindSerialAdapter() {
      if (!global.serialAdapter || typeof global.serialAdapter.onReceive !== 'function') return;
      global.serialAdapter.onReceive((msg) => this._emitReceive('serial', msg));
      this._serialBound = true;
    }

    _bindBleReceive() {
      const bm = this.app.ble.manager;
      if (!bm || typeof bm.onReceive !== 'function') return;
      bm.onReceive((msg) => this._emitReceive('ble', msg));
    }

    setDevice(device) {
      this.app.setDevice(device);
      if (this.app.ble.manager && typeof this.app.ble.manager.setMode === 'function') {
        try { this.app.ble.manager.setMode(this.app.device); } catch {}
      }
    }

    setTransport(transport) {
      const prev = this.app.transport;
      this.app.setTransport(transport);
      if (transport === 'ble' && prev !== 'ble' && global.serialAdapter?.isConnected()) {
        try { global.serialAdapter.disconnect(); } catch {}
      } else if (transport === 'serial' && prev !== 'serial') {
        this._bindSerialAdapter();
        const bm = this.app.ble.manager;
        if (bm && bm.isConnected && bm.isConnected()) {
          try { bm.disconnect(); } catch {}
        }
      }
      this._emit(transport, '연결 안 됨', 'disconnected');
    }

    /* ---------- BLE ---------- */
    _ensureBle() {
      if (this.app.ble.manager) {
        this._bleReady = true;
        return this.app.ble.manager;
      }
      if (!global.BLE || !global.BLE.BLEManager) throw new Error('BLE.BLEManager is not loaded.');
      const mgr = new global.BLE.BLEManager();
      try { mgr.setMode(this.app.device); } catch {}
      mgr.onStatusChange((text, status) => {
        const mapped = (status === 'connected') ? 'connected' : (status === 'connecting' ? 'connecting' : 'disconnected');
        this.app.setBleConnected(mapped === 'connected');
        this._emit('ble', text, mapped);
      });
      if (mgr.onReceive) mgr.onReceive((msg) => this._emitReceive('ble', msg));
      global.bleManager = mgr;
      global.bleConnection = mgr;
      this.app.setBleManager(mgr);
      this._bleReady = true;
      return mgr;
    }

    async connect() {
      if (this.app.transport === 'ble') {
        if (global.serialAdapter?.isConnected()) {
          try { await global.serialAdapter.disconnect(); } catch {}
        }
        const bm = this._ensureBle();
        this._emit('ble', 'Connecting...', 'connecting');
        await bm.connect();
      } else {
        if (!global.serialAdapter) throw new Error('serial_adapter.js is not loaded.');
        this._bindSerialAdapter();
        const bm = this.app.ble.manager;
        if (bm && bm.isConnected && bm.isConnected()) {
          try { await bm.disconnect(); } catch {}
        }
        this._emit('serial', 'Connecting...', 'connecting');
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

    /* ---------- Send (optional dedupe) ---------- */
    async send(text) {
      const payload = String(text ?? '');

      if (this.dedupe && payload === this._lastSentValue) {
        this._lastSentAt = Date.now();
        return;
      }

      if (this.app.transport === 'ble') {
        const bm = this._ensureBle();
        if (!bm.isConnected()) throw new Error('BLE is not connected.');
        await bm.sendMessage(payload);
      } else {
        if (!global.serialAdapter?.isConnected()) throw new Error('Serial is not connected.');
        await global.serialAdapter.write(payload);
      }

      this._lastSentAt = Date.now();
      this._lastSentValue = payload;
    }
  }

  global.ConnectionManager = ConnectionManager;
})(window);
