/* Simple canvas line graph utility */
(function (global) {
  'use strict';

  const DEFAULTS = {
    padding: { top: 20, right: 20, bottom: 28, left: 52 },
    gridColor: '#e2e8f0',
    axisColor: '#94a3b8',
    textColor: '#64748b',
    lineWidth: 2,
    minValueSpan: 1,
    pxPerSec: 40,
    tickPx: 120,
    font: '12px sans-serif',
    timeMode: 'absolute',
    timeSuffix: 's',
  };

  class Graph {
    constructor(canvas, opts = {}) {
      if (!canvas) throw new Error('Graph: canvas is required.');
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.series = [];
      this.data = new Map();
      this.options = Graph._mergeOptions(opts);
      this.axisCanvas = opts.axisCanvas || null;
      this.axisCtx = this.axisCanvas ? this.axisCanvas.getContext('2d') : null;
      this.axisWidth = this.axisCanvas ? (opts.axisWidth || this.options.padding.left) : 0;
      this.startTime = opts.startTime || null;
      this.width = canvas.clientWidth || 300;
      this.height = canvas.clientHeight || 150;
      this.setSeries(opts.series || []);
      this.setSize(this.width, this.height);
    }

    static _mergeOptions(opts) {
      const merged = { ...DEFAULTS };
      const padding = { ...DEFAULTS.padding };
      if (opts.padding) Object.assign(padding, opts.padding);
      merged.padding = padding;
      Object.keys(opts).forEach((key) => {
        if (key !== 'padding') merged[key] = opts[key];
      });
      return merged;
    }

    setSeries(series) {
      this.series = Array.isArray(series) ? series.map((s) => ({ ...s })) : [];
      this.series.forEach((s) => {
        if (!this.data.has(s.id)) this.data.set(s.id, []);
      });
    }

    setStartTime(ts) {
      if (Number.isFinite(ts)) this.startTime = ts;
    }

    addPoint(seriesId, point) {
      if (!this.data.has(seriesId)) this.data.set(seriesId, []);
      this.data.get(seriesId).push(point);
    }

    setSize(width, height) {
      const safeWidth = Math.max(1, Math.floor(width));
      const safeHeight = Math.max(1, Math.floor(height));
      const dpr = global.devicePixelRatio || 1;
      this.canvas.style.width = `${safeWidth}px`;
      this.canvas.style.height = `${safeHeight}px`;
      this.canvas.width = Math.floor(safeWidth * dpr);
      this.canvas.height = Math.floor(safeHeight * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.width = safeWidth;
      this.height = safeHeight;

      if (this.axisCanvas && this.axisCtx) {
        const axisWidth = Math.max(1, Math.floor(this.axisWidth || this.options.padding.left));
        this.axisWidth = axisWidth;
        this.axisCanvas.style.width = `${axisWidth}px`;
        this.axisCanvas.style.height = `${safeHeight}px`;
        this.axisCanvas.width = Math.floor(axisWidth * dpr);
        this.axisCanvas.height = Math.floor(safeHeight * dpr);
        this.axisCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    getHoverInfo(x, tolerancePx = 12) {
      const padding = this.options.padding;
      const plotWidth = this.width - padding.left - padding.right;
      const plotHeight = this.height - padding.top - padding.bottom;
      if (plotWidth <= 0 || plotHeight <= 0) return null;
      if (x < padding.left || x > padding.left + plotWidth) return null;
      const summary = this._summarizeData();
      if (!summary.hasData) return null;
      const startTime = Number.isFinite(this.startTime) ? this.startTime : summary.minTime;
      const targetTime = startTime + ((x - padding.left) / this.options.pxPerSec) * 1000;
      const toleranceMs = (tolerancePx / this.options.pxPerSec) * 1000;

      const seriesValues = [];
      this.series.forEach((series) => {
        const points = this.data.get(series.id) || [];
        const nearest = Graph._findNearestPoint(points, targetTime);
        if (!nearest) return;
        if (Math.abs(nearest.t - targetTime) > toleranceMs) return;
        seriesValues.push({
          id: series.id,
          label: series.label,
          color: series.color,
          point: nearest,
        });
      });

      if (!seriesValues.length) return null;
      return { time: targetTime, series: seriesValues };
    }

    render() {
      const ctx = this.ctx;
      if (!ctx) return;
      const axisCtx = this.axisCtx;

      ctx.clearRect(0, 0, this.width, this.height);
      if (axisCtx) {
        axisCtx.clearRect(0, 0, this.axisWidth, this.height);
      }

      const padding = this.options.padding;
      const plotWidth = this.width - padding.left - padding.right;
      const plotHeight = this.height - padding.top - padding.bottom;
      if (plotWidth <= 0 || plotHeight <= 0) return;

      const summary = this._summarizeData();
      if (!summary.hasData) {
        ctx.fillStyle = this.options.textColor;
        ctx.font = this.options.font;
        ctx.fillText('No data', padding.left + 8, padding.top + 16);
        return;
      }

      const minVal = summary.minValue;
      const maxVal = summary.maxValue;
      const span = Math.max(maxVal - minVal, this.options.minValueSpan);
      const paddedMin = minVal - span * 0.1;
      const paddedMax = maxVal + span * 0.1;
      const valueRange = paddedMax - paddedMin || 1;

      const startTime = Number.isFinite(this.startTime) ? this.startTime : summary.minTime;
      const endTime = summary.maxTime;
      const pxPerSec = this.options.pxPerSec;

      ctx.font = this.options.font;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.options.textColor;
      ctx.strokeStyle = this.options.gridColor;
      ctx.lineWidth = 1;

      if (axisCtx) {
        axisCtx.font = this.options.font;
        axisCtx.textBaseline = 'middle';
        axisCtx.fillStyle = this.options.textColor;
        axisCtx.strokeStyle = this.options.axisColor;
        axisCtx.lineWidth = 1;
      }

      const gridLines = 4;
      for (let i = 0; i <= gridLines; i += 1) {
        const y = padding.top + (plotHeight / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(this.width - padding.right, y);
        ctx.stroke();

        const value = paddedMax - (valueRange * i) / gridLines;
        if (axisCtx) {
          axisCtx.fillText(value.toFixed(2), 6, y);
        } else {
          ctx.fillText(value.toFixed(2), 6, y);
        }
      }

      ctx.strokeStyle = this.options.axisColor;
      ctx.beginPath();
      if (!axisCtx) {
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, this.height - padding.bottom);
      }
      ctx.moveTo(padding.left, this.height - padding.bottom);
      ctx.lineTo(this.width - padding.right, this.height - padding.bottom);
      ctx.stroke();

      if (axisCtx) {
        const axisX = Math.max(0, this.axisWidth - 1);
        axisCtx.beginPath();
        axisCtx.moveTo(axisX, padding.top);
        axisCtx.lineTo(axisX, this.height - padding.bottom);
        axisCtx.stroke();
      }

      this._drawTimeAxis(startTime, endTime, pxPerSec, padding, plotHeight);

      this.series.forEach((series) => {
        const points = this.data.get(series.id) || [];
        if (!points.length) return;
        ctx.strokeStyle = series.color || '#667eea';
        ctx.lineWidth = this.options.lineWidth;
        ctx.beginPath();
        points.forEach((pt, index) => {
          const x = padding.left + ((pt.t - startTime) / 1000) * pxPerSec;
          const y = padding.top + ((paddedMax - pt.v) / valueRange) * plotHeight;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
    }

    _drawTimeAxis(startTime, endTime, pxPerSec, padding, plotHeight) {
      const ctx = this.ctx;
      const tickSec = Math.max(1, Math.round(this.options.tickPx / pxPerSec));
      const totalSec = Math.max(0, (endTime - startTime) / 1000);
      const tickCount = Math.floor(totalSec / tickSec);

      ctx.strokeStyle = this.options.gridColor;
      ctx.fillStyle = this.options.textColor;
      ctx.textBaseline = 'top';

      for (let i = 0; i <= tickCount; i += 1) {
        const secOffset = i * tickSec;
        const x = padding.left + secOffset * pxPerSec;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + plotHeight);
        ctx.stroke();

        const label = (this.options.timeMode === 'relative')
          ? `${secOffset}${this.options.timeSuffix}`
          : Graph._formatTime(new Date(startTime + secOffset * 1000));
        ctx.fillText(label, x + 4, padding.top + plotHeight + 6);
      }
    }

    _summarizeData() {
      let minValue = Infinity;
      let maxValue = -Infinity;
      let minTime = Infinity;
      let maxTime = -Infinity;
      let hasData = false;

      this.data.forEach((points) => {
        points.forEach((pt) => {
          if (!Number.isFinite(pt.v) || !Number.isFinite(pt.t)) return;
          hasData = true;
          minValue = Math.min(minValue, pt.v);
          maxValue = Math.max(maxValue, pt.v);
          minTime = Math.min(minTime, pt.t);
          maxTime = Math.max(maxTime, pt.t);
        });
      });

      if (!hasData) {
        return { hasData: false, minValue: 0, maxValue: 0, minTime: 0, maxTime: 0 };
      }

      return { hasData, minValue, maxValue, minTime, maxTime };
    }

    static _findNearestPoint(points, targetTime) {
      if (!points.length) return null;
      let lo = 0;
      let hi = points.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const t = points[mid]?.t ?? 0;
        if (t < targetTime) lo = mid + 1;
        else hi = mid;
      }
      const idx = lo;
      const prev = Math.max(0, idx - 1);
      const candA = points[idx];
      const candB = points[prev];
      if (!candA) return candB || null;
      if (!candB) return candA;
      return Math.abs(candA.t - targetTime) <= Math.abs(candB.t - targetTime) ? candA : candB;
    }

    static _formatTime(date) {
      const pad = (v) => String(v).padStart(2, '0');
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
  }

  global.Graph = Graph;
})(window);
