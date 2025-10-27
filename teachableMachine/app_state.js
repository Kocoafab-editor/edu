(function (global) {
  "use strict";

  const BAUD = { microbit: 115200, esp32: 115200, uno: 9600 };
  // BLE는 ble.js가 알아서 처리하므로 EOL=''
  const EOL = {
    ble:    { microbit: '', esp32: '', uno: '' },
    serial: { microbit: '\n', esp32: '\r\n', uno: '\n' }
  };

  const AppState = {
    device: 'microbit',              // 'microbit' | 'esp32' | 'uno' | (orange는 esp32/orange로 매핑 가능)
    transport: 'serial',             // 'ble' | 'serial'
    ble:    { manager: null, connected: false },
    serial: { portOpen: false, baudRate: BAUD.microbit },
    // 파생 상태(읽기 전용 느낌으로 사용)
    get baud() { return this.serial.baudRate; },
    get eol()  { return EOL[this.transport][this.device] || '\n'; },

    setDevice(device) {
      this.device = (device === 'esp32' || device === 'uno' || device === 'microbit') ? device : 'microbit';
      this.serial.baudRate = BAUD[this.device] || 115200;
      // BLE 매니저가 있으면 모드 동기화(ble.js API 유지)
      if (this.ble.manager && typeof this.ble.manager.setMode === 'function') {
        try { this.ble.manager.setMode(this.device === 'uno' ? 'uno' : this.device); } catch {}
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