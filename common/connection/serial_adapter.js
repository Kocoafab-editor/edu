(function (global) {
  "use strict";

  class SerialAdapter {
    constructor(appState) {
      this.app = appState;

      // 공통 상태
      this.backend = null;      // 'webserial' | 'p5'
      this._opened = false;

      // Web Serial
      this.port = null;
      this.reader = null;
      this.writer = null;
      this.readableClosed = null;
      this.keepReading = false;
      this._lineBuf = "";

      // p5.serialport
      this.p5serial = null;
      this._p5Bound = false;
      this._onReceive = null;
    }

    _pickBackend() {
      if (this.backend) return this.backend;
      if ('serial' in navigator) {
        this.backend = 'webserial';
      } else if (global.p5 && typeof global.p5.SerialPort === 'function') {
        this.backend = 'p5';
      } else {
        throw new Error('이 브라우저는 Web Serial을 지원하지 않고 p5.serialport도 없습니다.');
      }
      return this.backend;
    }

    _status(text, cls) {
      if (typeof global.updateSerialStatus === 'function') {
        global.updateSerialStatus(text, cls);
      }
    }

    /* -------------------- Web Serial -------------------- */
    async _ws_connect() {
      this._status('연결 시도중…', 'status-connecting');

      // 매번 포트 선택 강제
      // filters를 비워 두면 모든 시리얼 포트를 보여줍니다.
      this.port = await navigator.serial.requestPort({ /* filters: [] */ });
      await this.port.open({ baudRate: this.app.baud });

      // writer 확보
      this.writer = this.port.writable.getWriter();

      // 읽기 루프 시작
      this.keepReading = true;
      const decoder = new TextDecoderStream();
      this.readableClosed = this.port.readable.pipeTo(decoder.writable).catch(() => {});
      this.reader = decoder.readable.getReader();
      this._opened = true;
      this._status('연결됨', 'status-connected');

      this._ws_readLoop().catch((e) => {
        console.warn('[WebSerial readLoop stopped]', e);
      });
      return true;
    }

    async _ws_readLoop() {
      this._lineBuf = "";
      while (this.keepReading && this.reader) {
        const { value, done } = await this.reader.read();
        if (done || !this.keepReading) break;
        if (value) {
          this._lineBuf += value;
          let idx;
          while ((idx = this._lineBuf.indexOf('\n')) >= 0) {
            const line = this._lineBuf.slice(0, idx);
            this._lineBuf = this._lineBuf.slice(idx + 1);
            this._onDataLine(line.replace(/\r$/, ''));
          }
        }
      }
    }

    _onDataLine(line) {
      if (typeof this._onReceive === 'function') {
        try { this._onReceive(line); } catch {}
      }
    }

    onReceive(cb) {
      this._onReceive = (typeof cb === 'function') ? cb : null;
    }

    async _ws_disconnect() {
      try { this.keepReading = false; } catch {}
      try { if (this.reader) await this.reader.cancel(); } catch {}
      try { if (this.writer) { await this.writer.close(); this.writer.releaseLock(); } } catch {}
      try { if (this.readableClosed) await this.readableClosed; } catch {}
      try { if (this.port) await this.port.close(); } catch {}
      this.reader = null;
      this.writer = null;
      this.port = null;
      this._opened = false;
      this._status('연결 끊김', 'status-disconnected');
      return true;
    }

    async _ws_write(text) {
      if (!this._opened || !this.port || !this.writer) {
        throw new Error('Serial이 연결되어 있지 않습니다.');
      }
      const payload = String(text ?? '') + this.app.eol; // EOL은 AppState에서
      const data = new TextEncoder().encode(payload);
      await this.writer.write(data);
      return true;
    }

    _ws_isOpen() {
      return !!(this._opened && this.port && this.port.readable && this.port.writable);
    }

    /* -------------------- p5.serialport (fallback) -------------------- */
    _p5_ensure() {
      if (this.p5serial) return;
      this.p5serial = new global.p5.SerialPort();
      if (this._p5Bound) return;

      this.p5serial.on('open',  () => { this._opened = true;  this._status('연결됨', 'status-connected'); });
      this.p5serial.on('close', () => { this._opened = false; this._status('연결 끊김', 'status-disconnected'); });
      this.p5serial.on('error', (e) => { console.error('[p5.serial error]', e); this._status('연결 오류', 'status-disconnected'); });
      this.p5serial.on('data',  () => {
        try {
          const v = this.p5serial.readLine();
          if (v) this._onDataLine(String(v).trim());
        } catch {}
      });
      this._p5Bound = true;
    }

    async _p5_connect() {
      this._p5_ensure();
      this._status('연결 시도중…', 'status-connecting');

      // 포트 requestPort를 통한 선택 강제
      if (typeof this.p5serial.requestPort === 'function') {
        await this.p5serial.requestPort();
      }
      // open 호출 (대부분 시리얼기반 p5.serialport는 requestPort 이후 open 필요)
      if (typeof this.p5serial.open === 'function') {
        await this.p5serial.open({ baudRate: this.app.baud });
      } else {
        throw new Error('p5.serialport: open API를 찾을 수 없습니다.');
      }
      return true;
    }

    async _p5_disconnect() {
      try { if (this.p5serial && this.p5serial.isOpen()) await this.p5serial.close(); } catch {}
      this._opened = false;
      this._status('연결 끊김', 'status-disconnected');
      return true;
    }

    _p5_isOpen() {
      return !!(this.p5serial && this.p5serial.isOpen && this.p5serial.isOpen());
    }

    async _p5_write(text) {
      if (!this._p5_isOpen()) throw new Error('Serial이 연결되어 있지 않습니다.');
      const payload = String(text ?? '') + this.app.eol;
      this.p5serial.write(payload);
      return true;
    }

    /* -------------------- 공통 API -------------------- */
    async connect() {
      const backend = this._pickBackend();
      if (backend === 'webserial')  return this._ws_connect();
      if (backend === 'p5')         return this._p5_connect();
    }

    async disconnect() {
      const backend = this._pickBackend();
      if (backend === 'webserial')  return this._ws_disconnect();
      if (backend === 'p5')         return this._p5_disconnect();
    }

    isConnected() {
      const backend = this.backend || this._pickBackend();
      if (backend === 'webserial')  return this._ws_isOpen();
      if (backend === 'p5')         return this._p5_isOpen();
      return false;
    }

    async write(text) {
      const backend = this.backend || this._pickBackend();
      if (backend === 'webserial')  return this._ws_write(text);
      if (backend === 'p5')         return this._p5_write(text);
    }
  }

  // 전역 익스포트 & 백워드 호환 훅
  const adapter = new SerialAdapter(window.AppState);
  global.serialAdapter   = adapter;
  global.newConnect      = () => adapter.connect();
  global.closeSerialPort = () => adapter.disconnect();

})(window);
