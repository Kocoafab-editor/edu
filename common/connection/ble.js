// Simple reusable BLE module
// Exposes window.BLE.BLEManager for pages to use without duplicating logic

(function(global) {
  'use strict';

  class BLEManager {
    constructor(appState) {
      this.app = appState || global.AppState || null;
      this.device = null;
      this.server = null;
      this.service = null;
      this.txCharacteristic = null;
      this.rxCharacteristic = null;

      this.serviceUUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
      this.txUUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
      this.rxUUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

      this.deviceMode = 'esp32'; // 'esp32' | 'orange' | 'microbit'
      this._onReceive = null;
      this._onStatusChange = null; // (text, status) => void, status: 'disconnected' | 'connecting' | 'connected'
      this._lineBuf = '';
      this._decoder = new TextDecoder('utf-8');

      if (this.app && typeof this.app.setBleManager === 'function') {
        try { this.app.setBleManager(this); } catch (_) {}
      }
    }

    setMode(mode) {
      this.deviceMode = mode;
    }

    onReceive(cb) {
      this._onReceive = cb;
    }

    onStatusChange(cb) {
      this._onStatusChange = cb;
    }

    isConnected() {
      return !!(this.device && this.device.gatt && this.device.gatt.connected);
    }

    async connect() {
      try {
        this._emitStatus('연결 중...', 'connecting');

        let options;
        if (this.deviceMode === 'esp32') {
          options = { filters: [ { services: [ this.serviceUUID ] } ] };
        } else if (this.deviceMode === 'orange') {
          options = { filters: [ { services: [ this.serviceUUID ] } ], optionalServices: [ this.serviceUUID ] };
        } else { // microbit
          options = { filters: [ { namePrefix: 'BBC micro:bit' }, { namePrefix: 'micro:bit' } ], optionalServices: [ this.serviceUUID ] };
        }

        const tryReconnectExisting = async () => {
          if (!this.device) return false;
          try {
            if (!this.device.gatt.connected) {
              await this.device.gatt.connect();
            }
            this.device.addEventListener('gattserverdisconnected', () => this._onDisconnected());
            return true;
          } catch (_) {
            return false;
          }
        };

        let hasDevice = await tryReconnectExisting();
        if (!hasDevice) {
          try {
            this.device = await navigator.bluetooth.requestDevice(options);
          } catch (err) {
            if (this.deviceMode === 'orange' && err && err.name === 'NotFoundError') {
              this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [ this.serviceUUID ],
              });
            } else {
              throw err;
            }
          }
          this.device.addEventListener('gattserverdisconnected', () => this._onDisconnected());
          await this.device.gatt.connect();
        }

        this.server = this.device.gatt;
        this.service = await this.server.getPrimaryService(this.serviceUUID);

        if (this.deviceMode === 'microbit') {
          const chars = await this.service.getCharacteristics();
          this.txCharacteristic = chars.find(c => { try { return c.properties.notify || c.properties.indicate; } catch { return false; } });
          this.rxCharacteristic = chars.find(c => { try { return c.properties.write || c.properties.writeWithoutResponse; } catch { return false; } });
          if (!this.txCharacteristic || !this.rxCharacteristic) {
            throw new Error('micro:bit 특성(TX/RX)을 찾을 수 없습니다.');
          }
          try { await this.txCharacteristic.startNotifications(); } catch(e1) { await new Promise(r=>setTimeout(r,120)); await this.txCharacteristic.startNotifications(); }
          this.txCharacteristic.addEventListener('characteristicvaluechanged', (event) => this._handleNotify(event));
        } else {
          this.txCharacteristic = await this.service.getCharacteristic(this.txUUID);
          this.rxCharacteristic = await this.service.getCharacteristic(this.rxUUID);
          const isESP32 = this.deviceMode === 'esp32';
          if (isESP32) {
            await this.txCharacteristic.startNotifications();
            this.txCharacteristic.addEventListener('characteristicvaluechanged', (event) => this._handleNotify(event));
          } else {
            await this.rxCharacteristic.startNotifications();
            this.rxCharacteristic.addEventListener('characteristicvaluechanged', (event) => this._handleNotify(event));
          }
        }

        this._emitStatus('연결됨', 'connected');
      } catch (error) {
        this._emitStatus('연결 실패', 'disconnected');
        this._reset();
        try { this.device?.gatt?.disconnect?.(); } catch (_) {}
        throw error;
      }
    }

    async disconnect() {
      try {
        try {
          if (this.deviceMode === 'microbit' && this.txCharacteristic) {
            await this.txCharacteristic.stopNotifications();
          }
          if (this.deviceMode === 'esp32' && this.txCharacteristic) {
            await this.txCharacteristic.stopNotifications();
          }
          if (this.deviceMode === 'orange' && this.rxCharacteristic) {
            await this.rxCharacteristic.stopNotifications();
          }
        } catch (_) {}

        if (this.device?.gatt?.connected) {
          try { await this.device.gatt.disconnect(); } catch (_) {}
        }
        this._reset();
      } finally {
        this._emitStatus('연결 끊김', 'disconnected');
      }
    }

    async sendMessage(text) {
      const msg = (text || '').trim();
      if (!msg) return;
      if (!this.isConnected()) {
        throw new Error('BLE 장치가 연결되지 않았습니다.');
      }
      const encoder = new TextEncoder();
      // ESP32(BLE)에는 델리미터를 붙이지 않음. 그 외에는 LF 사용
      const eol = this._getEol();
      const data = encoder.encode(msg + eol);
      if (this.deviceMode === 'microbit') {
        await this._writeChunked(this.rxCharacteristic, data);
      } else if (this.deviceMode === 'esp32') {
        // 일부 ESP32 펌웨어는 writeWithoutResponse만 허용하므로 안전하게 청크 전송
        await this._writeChunked(this.rxCharacteristic, data);
      } else { // orange (Arduino NUS)
        await this._writeChunked(this.txCharacteristic, data);
      }
    }

    _getEol() {
      if (this.app && typeof this.app.eol === 'string') {
        return this.app.eol;
      }
      return this.deviceMode === 'esp32' ? '' : '\n';
    }

    async _writeChunked(characteristic, bytes) {
      const CHUNK = 20;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.slice(i, i + CHUNK);
        const hasWriteWithResponse = typeof characteristic.writeValueWithResponse === 'function';
        const hasWriteWithoutResponse = typeof characteristic.writeValueWithoutResponse === 'function';
        const canWriteWithResponse = characteristic.properties && characteristic.properties.write;
        const canWriteWithoutResponse = characteristic.properties && characteristic.properties.writeWithoutResponse;

        const writeWithResponse = async (value) => {
          if (!hasWriteWithResponse) {
            throw new Error('writeValueWithResponse is not supported.');
          }
          return characteristic.writeValueWithResponse(value);
        };

        const writeWithoutResponse = async (value) => {
          if (!hasWriteWithoutResponse) {
            throw new Error('writeValueWithoutResponse is not supported.');
          }
          return characteristic.writeValueWithoutResponse(value);
        };

        try {
          if (canWriteWithResponse && hasWriteWithResponse) {
            await writeWithResponse(slice);
          } else if (canWriteWithoutResponse && hasWriteWithoutResponse) {
            await writeWithoutResponse(slice);
          } else if (hasWriteWithoutResponse) {
            await writeWithoutResponse(slice);
          } else if (hasWriteWithResponse) {
            await writeWithResponse(slice);
          } else {
            throw new Error('No supported write method on characteristic.');
          }
        } catch (e) {
          if (hasWriteWithoutResponse) {
            await writeWithoutResponse(slice);
          } else if (hasWriteWithResponse) {
            await writeWithResponse(slice);
          } else {
            throw e;
          }
        }
        await new Promise(r => setTimeout(r, 5));
      }
    }

    _handleNotify(event) {
      try {
        const value = event.target.value;
        if (!value) return;
        const chunk = this._decoder.decode(value);
        if (!chunk) return;
        this._lineBuf += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let idx;
        while ((idx = this._lineBuf.indexOf('\n')) >= 0) {
          const line = this._lineBuf.slice(0, idx).replace(/\r$/, '');
          this._lineBuf = this._lineBuf.slice(idx + 1);
          const text = line.trim();
          if (text && typeof this._onReceive === 'function') {
            this._onReceive(text);
          }
        }
      } catch (_) {}
    }

    _onDisconnected() {
      this._emitStatus('연결 끊김', 'disconnected');
      this._reset();
    }

    _reset() {
      this.device = null;
      this.server = null;
      this.service = null;
      this.txCharacteristic = null;
      this.rxCharacteristic = null;
      this._lineBuf = '';
    }

    _emitStatus(text, status) {
      if (typeof this._onStatusChange === 'function') {
        try { this._onStatusChange(text, status); } catch(_) {}
      }
    }
  }

  global.BLE = global.BLE || {};
  global.BLE.BLEManager = BLEManager;

})(window);
