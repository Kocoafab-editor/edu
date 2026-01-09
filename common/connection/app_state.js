(function (global) {
  "use strict";

  const BAUD = { microbit: 115200, esp32: 115200, orange: 9600 };
  // EOL is defined here for both BLE and serial.
  const EOL = {
    ble:    { microbit: '\n', esp32: '', orange: '\n' },
    serial: { microbit: '\n', esp32: '\r\n', orange: '\n' }
  };

  const AppState = {
    device: 'microbit',              // 'microbit' | 'esp32' | 'orange'
    transport: 'serial',             // 'ble' | 'serial'
    ble:    { manager: null, connected: false },
    serial: { portOpen: false, baudRate: BAUD.microbit },
    // 파생 상태(읽기 전용 느낌으로 사용)
    get baud() { return this.serial.baudRate; },
    get eol()  { return EOL[this.transport][this.device] || '\n'; },

    setDevice(device) {
      this.device = (device === 'esp32' || device === 'orange' || device === 'microbit') ? device : 'microbit';
      this.serial.baudRate = BAUD[this.device] || 115200;
      // BLE 매니저가 있으면 모드 동기화(ble.js API 유지)
      if (this.ble.manager && typeof this.ble.manager.setMode === 'function') {
        try { this.ble.manager.setMode(this.device); } catch {}
      }
    },

    setTransport(transport) {
      if (transport !== 'ble' && transport !== 'serial') return;
      this.transport = transport;
    },

    setBleManager(mgr) { this.ble.manager = mgr; },
    setBleConnected(v) { this.ble.connected = !!v; },
    setSerialPortOpen(v){ this.serial.portOpen = !!v; },
  };

  // 전역 공개
  global.AppState = AppState;
})(window);
