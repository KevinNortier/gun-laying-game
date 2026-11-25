// Topographic map view: cached terrain tiles (relief, woods, water, contours)
// plus a vector overlay (MGRS grid, labels, spot heights, scale bar) drawn every frame.
// All drawing is in device pixels; "css" values are multiplied by devicePixelRatio.
(function (GL) {
  'use strict';

  const TILE = 256; // tile size in device pixels
  const SAMPLE = 2; // device pixels per terrain sample inside a tile
  const N = TILE / SAMPLE; // samples (cells) across a tile
  const BASE_MPP = 0.125; // metres per device pixel at tile level 0
  const MAX_LEVEL = 12;
  const MAX_TILES = 300;
  const MIN_CSS_MPP = 0.25; // most zoomed in  (~1:950)
  const MAX_CSS_MPP = 60; // most zoomed out (~1:227 000)

  const COLORS = {
    outside: '#b8b3a6',
    land: [247, 243, 229],
    wood: [205, 228, 178],
    water: [166, 208, 236],
    shore: 'rgba(40, 110, 175, 0.9)',
    contour: 'rgba(170, 105, 50, 0.75)',
    contourIndex: 'rgba(140, 78, 28, 0.95)',
    grid: 'rgba(20, 30, 60, 0.55)',
    gridMajor: 'rgba(20, 30, 60, 0.8)',
    gridFine: 'rgba(20, 30, 60, 0.13)',
    spot: '#3a2614',
  };

  // Contour interval depends on map scale, like paper maps at different scales.
  function contourSpec(cssMpp) {
    if (cssMpp <= 7) return { interval: 10, index: 50 };
    if (cssMpp <= 16) return { interval: 20, index: 100 };
    return { interval: 50, index: 250 };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  let scratch = null;
  function getScratch() {
    if (!scratch) {
      scratch = document.createElement('canvas');
      scratch.width = scratch.height = N + 1;
    }
    return scratch;
  }

  // Marching squares over the sample grid H (W x W, with a 1-sample border).
  // Emits segments for levels offset + k*interval that are >= minLevel, in tile pixel coords.
  function traceContours(H, W, interval, offset, minLevel, emit) {
    const s = SAMPLE;
    for (let j = 0; j < N; j++) {
      const row = (j + 1) * W + 1;
      for (let i = 0; i < N; i++) {
        const k = row + i;
        const a = H[k]; // top-left
        const b = H[k + 1]; // top-right
        const c = H[k + W + 1]; // bottom-right
        const d = H[k + W]; // bottom-left
        const mx = Math.max(a, b, c, d);
        if (mx < minLevel) continue;
        const mn = Math.max(Math.min(a, b, c, d), minLevel);
        const x = i * s;
        const y = j * s;
        for (let L = Math.ceil((mn - offset) / interval) * interval + offset; L <= mx; L += interval) {
          const idx = (a >= L ? 8 : 0) | (b >= L ? 4 : 0) | (c >= L ? 2 : 0) | (d >= L ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          // Edge crossing points (only the ones used for this case are meaningful).
          const tx = x + (s * (L - a)) / (b - a), ty = y; // top
          const rx = x + s, ry = y + (s * (L - b)) / (c - b); // right
          const bx = x + (s * (L - d)) / (c - d), by = y + s; // bottom
          const lx = x, ly = y + (s * (L - a)) / (d - a); // left
          switch (idx) {
            case 1: case 14: emit(L, lx, ly, bx, by); break;
            case 2: case 13: emit(L, bx, by, rx, ry); break;
            case 3: case 12: emit(L, lx, ly, rx, ry); break;
            case 4: case 11: emit(L, tx, ty, rx, ry); break;
            case 6: case 9: emit(L, tx, ty, bx, by); break;
            case 7: case 8: emit(L, lx, ly, tx, ty); break;
            case 5:
            case 10: {
              // Saddle: resolve with the cell centre value.
              const centreIn = (a + b + c + d) / 4 >= L;
              if ((idx === 5) === centreIn) {
                emit(L, lx, ly, tx, ty);
                emit(L, bx, by, rx, ry);
              } else {
                emit(L, tx, ty, rx, ry);
                emit(L, lx, ly, bx, by);
              }
              break;
            }
          }
        }
      }
    }
  }

  function renderTile(terrain, level, tx, ty, dpr, options) {
    const tm = BASE_MPP * Math.pow(2, level); // metres per device pixel
    const step = tm * SAMPLE; // metres per sample
    const tileM = TILE * tm;
    const e0 = tx * tileM;
    const nTop = (ty + 1) * tileM;

    // Heights with a 1-sample border (for hillshade gradients).
    const W = N + 3;
    const H = new Float32Array(W * W);
    for (let j = 0; j < W; j++) {
      const n = nTop - (j - 1) * step;
      for (let i = 0; i < W; i++) H[j * W + i] = terrain.height(e0 + (i - 1) * step, n);
    }

    const P = N + 1;
    const base = new ImageData(P, P);
    const water = new ImageData(P, P);
    const bd = base.data;
    const wd = water.data;
    const wl = terrain.waterLevel;
    const exag = 1.6;
    let hasWater = false;
    for (let j = 0; j < P; j++) {
      const n = nTop - j * step;
      for (let i = 0; i < P; i++) {
        const k = (j + 1) * W + (i + 1);
        const h = H[k];
        const p = (j * P + i) * 4;
        if (h < wl) {
          wd[p] = COLORS.water[0];
          wd[p + 1] = COLORS.water[1];
          wd[p + 2] = COLORS.water[2];
          wd[p + 3] = 255;
          hasWater = true;
        }
        const col = h >= wl && terrain.isWood(e0 + i * step, n, h) ? COLORS.wood : COLORS.land;
        let f = 1;
        if (options.hillshade) {
          // Light from the north-west, 45 degrees up.
          const dzx = ((H[k + 1] - H[k - 1]) / (2 * step)) * exag;
          const dzn = ((H[k - W] - H[k + W]) / (2 * step)) * exag;
          const shade = (0.5 * dzx - 0.5 * dzn + 0.7071) / Math.sqrt(dzx * dzx + dzn * dzn + 1);
          f = clamp(1 + 0.55 * (shade - 0.7071), 0.72, 1.06);
        }
        bd[p] = col[0] * f;
        bd[p + 1] = col[1] * f;
        bd[p + 2] = col[2] * f;
        bd[p + 3] = 255;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE;
    const ctx = canvas.getContext('2d');
    const sc = getScratch();
    const sctx = sc.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    // Pixel i is centred on sample i, so shift by half a sample.
    sctx.putImageData(base, 0, 0);
    ctx.drawImage(sc, 0, 0, P, P, -SAMPLE / 2, -SAMPLE / 2, P * SAMPLE, P * SAMPLE);

    // Contours (not under water).
    const spec = contourSpec(tm * dpr);
    const normal = new Path2D();
    const index = new Path2D();
    traceContours(H, W, spec.interval, 0, wl, (L, x1, y1, x2, y2) => {
      const path = Math.round(L) % spec.index === 0 ? index : normal;
      path.moveTo(x1, y1);
      path.lineTo(x2, y2);
    });
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLORS.contour;
    ctx.lineWidth = 0.8 * dpr;
    ctx.stroke(normal);
    ctx.strokeStyle = COLORS.contourIndex;
    ctx.lineWidth = 1.6 * dpr;
    ctx.stroke(index);

    if (hasWater) {
      sctx.putImageData(water, 0, 0);
      ctx.drawImage(sc, 0, 0, P, P, -SAMPLE / 2, -SAMPLE / 2, P * SAMPLE, P * SAMPLE);
      const shore = new Path2D();
      traceContours(H, W, 1e9, wl, wl, (L, x1, y1, x2, y2) => {
        shore.moveTo(x1, y1);
        shore.lineTo(x2, y2);
      });
      ctx.strokeStyle = COLORS.shore;
      ctx.lineWidth = 1 * dpr;
      ctx.stroke(shore);
    }
    return canvas;
  }

  function niceScaleLength(maxMetres) {
    const p = Math.pow(10, Math.floor(Math.log10(maxMetres)));
    for (const m of [5, 2, 1]) if (m * p <= maxMetres) return m * p;
    return p;
  }

  class MapView {
    constructor(canvas, terrain) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.terrain = terrain;
      this.dpr = window.devicePixelRatio || 1;
      this.centerE = terrain.size / 2;
      this.centerN = terrain.size / 2;
      this.cssMpp = 4;
      this.tiles = new Map();
      this.spots = new Map();
      this.options = { hillshade: true };
      this.marker = null; // { e, n, label }
      this.onRender = null;
      this._raf = 0;
      this.resize();
    }

    // ---- view state -------------------------------------------------------

    get mpp() {
      return this.cssMpp / this.dpr; // metres per device pixel
    }

    setTerrain(terrain) {
      this.terrain = terrain;
      this.tiles.clear();
      this.spots.clear();
      this.requestRender();
    }

    setOption(key, value) {
      this.options[key] = value;
      this.tiles.clear();
      this.requestRender();
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      if (dpr !== this.dpr) {
        this.dpr = dpr;
        this.tiles.clear();
      }
      const r = this.canvas.getBoundingClientRect();
      this.cssW = r.width;
      this.cssH = r.height;
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.requestRender();
    }

    worldToScreen(e, n) {
      return [
        (e - this.centerE) / this.mpp + this.canvas.width / 2,
        (this.centerN - n) / this.mpp + this.canvas.height / 2,
      ];
    }

    screenToWorld(x, y) {
      return [
        this.centerE + (x - this.canvas.width / 2) * this.mpp,
        this.centerN - (y - this.canvas.height / 2) * this.mpp,
      ];
    }

    // Position in CSS pixels relative to the canvas -> world metres.
    clientToWorld(cssX, cssY) {
      return this.screenToWorld(cssX * this.dpr, cssY * this.dpr);
    }

    clampView() {
      this.cssMpp = clamp(this.cssMpp, MIN_CSS_MPP, MAX_CSS_MPP);
      this.centerE = clamp(this.centerE, 0, this.terrain.size);
      this.centerN = clamp(this.centerN, 0, this.terrain.size);
    }

    panByCss(dx, dy) {
      this.centerE -= dx * this.cssMpp;
      this.centerN += dy * this.cssMpp;
      this.clampView();
      this.requestRender();
    }

    // factor > 1 zooms in, keeping the point under (cssX, cssY) fixed.
    zoomAtCss(factor, cssX, cssY) {
      const [e, n] = this.clientToWorld(cssX, cssY);
      this.cssMpp = clamp(this.cssMpp / factor, MIN_CSS_MPP, MAX_CSS_MPP);
      this.centerE = e - (cssX - this.cssW / 2) * this.cssMpp;
      this.centerN = n + (cssY - this.cssH / 2) * this.cssMpp;
      this.clampView();
      this.requestRender();
    }

    centerOn(e, n, cssMpp) {
      this.centerE = e;
      this.centerN = n;
      if (cssMpp) this.cssMpp = cssMpp;
      this.clampView();
      this.requestRender();
    }

    // Map scale assuming 96 CSS px per inch.
    scaleDenominator() {
      return this.cssMpp / (0.0254 / 96);
    }

    contourInterval() {
      return contourSpec(this._tileMpp() * this.dpr).interval;
    }

    // ---- rendering --------------------------------------------------------

    requestRender() {
      if (!this._raf) {
        this._raf = requestAnimationFrame(() => {
          this._raf = 0;
          this.render();
        });
      }
    }

    _level() {
      return clamp(Math.floor(Math.log2(this.mpp / BASE_MPP) + 1e-9), 0, MAX_LEVEL);
    }

    _tileMpp() {
      return BASE_MPP * Math.pow(2, this._level());
    }

    _getTile(key) {
      const t = this.tiles.get(key);
      if (t) {
        // LRU: move to the end.
        this.tiles.delete(key);
        this.tiles.set(key, t);
      }
      return t;
    }

    _putTile(key, canvas) {
      this.tiles.set(key, canvas);
      while (this.tiles.size > MAX_TILES) this.tiles.delete(this.tiles.keys().next().value);
    }

    render() {
      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const size = this.terrain.size;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgb(${COLORS.land.join(',')})`;
      ctx.fillRect(0, 0, W, H);

      const level = this._level();
      const tm = BASE_MPP * Math.pow(2, level);
      const tileM = TILE * tm;
      const mpp = this.mpp;
      const eMin = clamp(this.centerE - (W / 2) * mpp, 0, size);
      const eMax = clamp(this.centerE + (W / 2) * mpp, 0, size);
      const nMin = clamp(this.centerN - (H / 2) * mpp, 0, size);
      const nMax = clamp(this.centerN + (H / 2) * mpp, 0, size);

      // Visible tiles, nearest the centre first.
      const needed = [];
      for (let ty = Math.floor(nMin / tileM); ty * tileM < nMax; ty++) {
        for (let tx = Math.floor(eMin / tileM); tx * tileM < eMax; tx++) {
          const dx = (tx + 0.5) * tileM - this.centerE;
          const dy = (ty + 0.5) * tileM - this.centerN;
          needed.push({ tx, ty, d: dx * dx + dy * dy });
        }
      }
      needed.sort((a, b) => a.d - b.d);

      // Render missing tiles within a time budget; the rest next frame.
      const start = performance.now();
      let pending = false;
      for (const t of needed) {
        const key = `${level}/${t.tx}/${t.ty}`;
        t.canvas = this._getTile(key);
        if (!t.canvas) {
          if (performance.now() - start < 30) {
            t.canvas = renderTile(this.terrain, level, t.tx, t.ty, this.dpr, this.options);
            this._putTile(key, t.canvas);
          } else {
            pending = true;
          }
        }
      }

      ctx.imageSmoothingEnabled = true;
      for (const t of needed) {
        const [x0f, y0f] = this.worldToScreen(t.tx * tileM, (t.ty + 1) * tileM);
        const [x1f, y1f] = this.worldToScreen((t.tx + 1) * tileM, t.ty * tileM);
        const x0 = Math.round(x0f), y0 = Math.round(y0f);
        const w = Math.round(x1f) - x0, h = Math.round(y1f) - y0;
        if (t.canvas) {
          ctx.drawImage(t.canvas, x0, y0, w, h);
          continue;
        }
        // Fallback: part of a coarser cached tile.
        for (let d = 1; d <= 4 && level + d <= MAX_LEVEL; d++) {
          const m = 1 << d;
          const px = Math.floor(t.tx / m), py = Math.floor(t.ty / m);
          const parent = this.tiles.get(`${level + d}/${px}/${py}`);
          if (!parent) continue;
          const sub = TILE / m;
          const sx = (t.tx - px * m) * sub;
          const sy = (m - 1 - (t.ty - py * m)) * sub;
          ctx.drawImage(parent, sx, sy, sub, sub, x0, y0, w, h);
          break;
        }
      }

      this._drawOutside();
      this._drawGrid();
      this._drawSpotHeights();
      this._drawMarker();
      this._drawScaleBar();

      if (pending) this.requestRender();
      if (this.onRender) this.onRender();
    }

    _drawOutside() {
      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const [sx0, sy0] = this.worldToScreen(0, this.terrain.size);
      const [sx1, sy1] = this.worldToScreen(this.terrain.size, 0);
      ctx.fillStyle = COLORS.outside;
      if (sy0 > 0) ctx.fillRect(0, 0, W, sy0);
      if (sy1 < H) ctx.fillRect(0, sy1, W, H - sy1);
      if (sx0 > 0) ctx.fillRect(0, sy0, sx0, sy1 - sy0);
      if (sx1 < W) ctx.fillRect(sx1, sy0, W - sx1, sy1 - sy0);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2 * this.dpr;
      ctx.strokeRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
    }

    _drawGrid() {
      const ctx = this.ctx;
      const dpr = this.dpr;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const size = this.terrain.size;
      const mpp = this.mpp;
      const eMin = clamp(this.centerE - (W / 2) * mpp, 0, size);
      const eMax = clamp(this.centerE + (W / 2) * mpp, 0, size);
      const nMin = clamp(this.centerN - (H / 2) * mpp, 0, size);
      const nMax = clamp(this.centerN + (H / 2) * mpp, 0, size);
      const cssPerKm = 1000 / this.cssMpp;
      const [, yTop] = this.worldToScreen(0, nMax);
      const [, yBot] = this.worldToScreen(0, nMin);
      const [xLeft] = this.worldToScreen(eMin, 0);
      const [xRight] = this.worldToScreen(eMax, 0);

      const lines = (spacing, style, width, skip) => {
        ctx.beginPath();
        for (let e = Math.ceil(eMin / spacing) * spacing; e <= eMax; e += spacing) {
          if (skip && e % skip === 0) continue;
          const x = Math.round(this.worldToScreen(e, 0)[0]) + 0.5;
          ctx.moveTo(x, yTop);
          ctx.lineTo(x, yBot);
        }
        for (let n = Math.ceil(nMin / spacing) * spacing; n <= nMax; n += spacing) {
          if (skip && n % skip === 0) continue;
          const y = Math.round(this.worldToScreen(0, n)[1]) + 0.5;
          ctx.moveTo(xLeft, y);
          ctx.lineTo(xRight, y);
        }
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.stroke();
      };

      const fine = cssPerKm >= 400;
      if (fine) lines(100, COLORS.gridFine, 1 * dpr, 1000);
      if (cssPerKm >= 30) lines(1000, COLORS.grid, 1 * dpr, 10000);
      lines(10000, COLORS.gridMajor, 2 * dpr);

      // Labels along the top and left edges: two-digit km values within the square,
      // and three-digit values (100 m) on the fine grid when zoomed right in.
      const spacing = fine ? 100 : cssPerKm >= 60 ? 1000 : cssPerKm >= 30 ? 2000 : 10000;
      ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      const label = (v) => {
        const m = Math.round(v);
        if (m % 1000 === 0) return String((m / 1000) % 100).padStart(2, '0');
        return String((m / 100) % 1000).padStart(3, '0');
      };
      const box = (text, x, y) => {
        const w = ctx.measureText(text).width + 6 * dpr;
        const h = 15 * dpr;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(x, y - h / 2, w, h);
        ctx.fillStyle = '#14203c';
        ctx.fillText(text, x + 3 * dpr, y + 0.5 * dpr);
      };
      const top = Math.max(yTop, 0) + 10 * dpr;
      const left = Math.max(xLeft, 0) + 3 * dpr;
      for (let e = Math.ceil(eMin / spacing) * spacing; e <= eMax; e += spacing) {
        const x = this.worldToScreen(e, 0)[0];
        if (x < left + 30 * dpr || x > W - 20 * dpr) continue;
        box(label(e), x + 2 * dpr, top);
      }
      for (let n = Math.ceil(nMin / spacing) * spacing; n <= nMax; n += spacing) {
        const y = this.worldToScreen(0, n)[1];
        if (y < top + 15 * dpr || y > H - 75 * dpr) continue; // keep clear of the scale bar
        box(label(n), left, y - 9 * dpr);
      }
    }

    _drawSpotHeights() {
      if (this.cssMpp > 8) return;
      const ctx = this.ctx;
      const dpr = this.dpr;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const B = this.terrain.spotBlockSize;
      const maxB = Math.ceil(this.terrain.size / B) - 1;
      const [e0, n1] = this.screenToWorld(0, 0);
      const [e1, n0] = this.screenToWorld(W, H);
      ctx.font = `${10 * dpr}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (let by = clamp(Math.floor(n0 / B), 0, maxB); by <= clamp(Math.floor(n1 / B), 0, maxB); by++) {
        for (let bx = clamp(Math.floor(e0 / B), 0, maxB); bx <= clamp(Math.floor(e1 / B), 0, maxB); bx++) {
          const key = `${bx}/${by}`;
          let spots = this.spots.get(key);
          if (!spots) {
            spots = this.terrain.spotHeights(bx, by);
            this.spots.set(key, spots);
          }
          for (const s of spots) {
            const [x, y] = this.worldToScreen(s.e, s.n);
            if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
            ctx.fillStyle = COLORS.spot;
            ctx.beginPath();
            ctx.arc(x, y, 1.8 * dpr, 0, Math.PI * 2);
            ctx.fill();
            const text = String(Math.round(s.h));
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 3 * dpr;
            ctx.strokeText(text, x + 4 * dpr, y);
            ctx.fillText(text, x + 4 * dpr, y);
          }
        }
      }
    }

    _drawMarker() {
      if (!this.marker) return;
      const ctx = this.ctx;
      const dpr = this.dpr;
      const [x, y] = this.worldToScreen(this.marker.e, this.marker.n);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, 9 * dpr, 0, Math.PI * 2);
      ctx.moveTo(x - 14 * dpr, y);
      ctx.lineTo(x - 4 * dpr, y);
      ctx.moveTo(x + 4 * dpr, y);
      ctx.lineTo(x + 14 * dpr, y);
      ctx.moveTo(x, y - 14 * dpr);
      ctx.lineTo(x, y - 4 * dpr);
      ctx.moveTo(x, y + 4 * dpr);
      ctx.lineTo(x, y + 14 * dpr);
      ctx.stroke();
      if (this.marker.label) {
        ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 3 * dpr;
        ctx.strokeText(this.marker.label, x + 16 * dpr, y - 10 * dpr);
        ctx.fillStyle = '#111';
        ctx.fillText(this.marker.label, x + 16 * dpr, y - 10 * dpr);
      }
    }

    _drawScaleBar() {
      const ctx = this.ctx;
      const dpr = this.dpr;
      const metres = niceScaleLength(160 * this.cssMpp);
      const barW = (metres / this.cssMpp) * dpr;
      const pad = 8 * dpr;
      const x = 12 * dpr + pad;
      const panelH = 46 * dpr;
      const y0 = this.canvas.height - 12 * dpr - panelH;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.fillRect(12 * dpr, y0, barW + 2 * pad + 24 * dpr, panelH);

      const barY = y0 + 20 * dpr;
      const barH = 5 * dpr;
      const segs = 4;
      for (let i = 0; i < segs; i++) {
        ctx.fillStyle = i % 2 ? '#fff' : '#111';
        ctx.fillRect(x + (i * barW) / segs, barY, barW / segs, barH);
      }
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(x, barY, barW, barH);

      ctx.fillStyle = '#111';
      ctx.font = `${10 * dpr}px system-ui, sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'center';
      ctx.fillText('0', x, barY - 2 * dpr);
      ctx.fillText(metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, x + barW, barY - 2 * dpr);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`Contour interval ${this.contourInterval()} m`, x, barY + barH + 5 * dpr);
    }
  }

  GL.MapView = MapView;
})((window.GL = window.GL || {}));
