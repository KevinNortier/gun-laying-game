// Procedural terrain for one 100 km MGRS square, shaped by a map theme (see themes.js).
// Coordinates are metres within the square: easting e and northing n, both 0..100000.
//
// Provides heights (with river valleys carved in), land cover, rivers and ponds. Settlements,
// roads and buildings are added afterwards by infrastructure.js (terrain.features).
(function (GL) {
  'use strict';

  const SQUARE_SIZE = 100000;
  const SPOT_BLOCK = 5000; // spot heights are computed per 5 km block
  const SPOT_STEP = 100; // sample spacing when searching for hilltops
  const SPOT_RADIUS = 5; // a hilltop must be the highest point within 5 samples (500 m)
  const FLOW_CELL = 400; // metres per cell of the river flow grid
  const FLOW_N = SQUARE_SIZE / FLOW_CELL;

  const COVER = { OPEN: 0, WATER: 1, WOOD: 2, MARSH: 3, SAND: 4, SCRUB: 5, ROCK: 6, BUILT: 7 };

  function quantile(sorted, q) {
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
  }

  // Simple bucket index for features with a bounding box.
  class SpatialIndex {
    constructor(size) {
      this.size = size;
      this.buckets = new Map();
    }

    _key(bx, by) {
      return bx * 4096 + by;
    }

    insert(item, x0, y0, x1, y1) {
      const s = this.size;
      for (let by = Math.floor(y0 / s); by <= Math.floor(y1 / s); by++) {
        for (let bx = Math.floor(x0 / s); bx <= Math.floor(x1 / s); bx++) {
          const k = this._key(bx, by);
          let b = this.buckets.get(k);
          if (!b) this.buckets.set(k, (b = []));
          b.push(item);
        }
      }
    }

    // Items in buckets overlapping the box (may contain duplicates across buckets).
    query(x0, y0, x1, y1, out = new Set()) {
      const s = this.size;
      for (let by = Math.floor(y0 / s); by <= Math.floor(y1 / s); by++) {
        for (let bx = Math.floor(x0 / s); bx <= Math.floor(x1 / s); bx++) {
          const b = this.buckets.get(this._key(bx, by));
          if (b) for (const it of b) out.add(it);
        }
      }
      return out;
    }

    // Items in the single bucket containing a point (fast path for point queries).
    at(x, y) {
      return this.buckets.get(this._key(Math.floor(x / this.size), Math.floor(y / this.size))) || null;
    }
  }

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const x = ax + t * dx - px;
    const y = ay + t * dy - py;
    return [Math.sqrt(x * x + y * y), t];
  }

  function chaikin(pts, iters) {
    let p = pts;
    for (let k = 0; k < iters; k++) {
      if (p.length < 3) return p;
      const out = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i];
        const b = p[i + 1];
        const q = a.map((v, j) => v * 0.75 + b[j] * 0.25);
        const r = a.map((v, j) => v * 0.25 + b[j] * 0.75);
        if (i > 0) out.push(q);
        if (i < p.length - 2) out.push(r);
      }
      out.push(p[p.length - 1]);
      p = out;
    }
    return p;
  }

  function createTerrain(seedInput, themeKey) {
    const seed = GL.hashSeed(seedInput);
    const themeName = GL.pickTheme(seedInput, themeKey);
    const theme = GL.THEMES[themeName];
    const rand = GL.mulberry32(seed);
    const noiseHeight = GL.createNoise2D(rand);
    const noiseWarpX = GL.createNoise2D(rand);
    const noiseWarpY = GL.createNoise2D(rand);
    const noiseRegion = GL.createNoise2D(rand);
    const noiseRough = GL.createNoise2D(rand);
    const noiseWood = GL.createNoise2D(rand);
    const noiseMarsh = GL.createNoise2D(rand);
    const noiseSand = GL.createNoise2D(rand);
    const noiseScrub = GL.createNoise2D(rand);
    const offsets = [];
    for (let o = 0; o < 8; o++) offsets.push([rand() * 256, rand() * 256]);
    const R = theme.relief;

    function rawHeight(e, n) {
      const x = e / R.scale;
      const y = n / R.scale;
      // Domain warp makes the hills less blobby.
      const wx = x + 0.45 * noiseWarpX(x * 0.7, y * 0.7);
      const wy = y + 0.45 * noiseWarpY(x * 0.7, y * 0.7);
      let sum = 0;
      let ridge = 0;
      let amp = 1;
      let f = 1;
      for (let o = 0; o < 7; o++) {
        const v = noiseHeight(wx * f + offsets[o][0], wy * f + offsets[o][1]);
        sum += amp * v;
        ridge += amp * (1 - Math.abs(v));
        amp *= 0.48;
        f *= 2.07;
      }
      if (R.ridged) sum = (1 - R.ridged) * sum + R.ridged * (ridge - 1.15) * 1.3;
      // Some regions are hilly, others gentle.
      const rough = Math.max(0.3, 0.85 + 0.6 * noiseRough(e / 22000 + 1.3, n / 22000 + 7.9));
      const region = noiseRegion(e / 28000 + 3.7, n / 28000 + 9.1);
      return R.amp * rough * sum + R.regional * region;
    }

    function fbm(noise, x, y, oct) {
      let s = 0;
      let a = 1;
      let f = 1;
      for (let o = 0; o < oct; o++) {
        s += a * noise(x * f + offsets[o][1], y * f + offsets[o][0]);
        a *= 0.5;
        f *= 2.1;
      }
      return s;
    }

    const woodValue = (e, n) => fbm(noiseWood, e / 2600, n / 2600, 4);
    const marshValue = (e, n) => fbm(noiseMarsh, e / 1800, n / 1800, 3);
    const sandValue = (e, n) => fbm(noiseSand, e / 3500, n / 3500, 3);
    const scrubValue = (e, n) => fbm(noiseScrub, e / 900, n / 900, 3);

    // ---- calibration: thresholds giving each theme its intended proportions ----
    const calRand = GL.mulberry32(seed ^ 0x9e3779b9);
    const hs = [];
    const ws = [];
    const ms = [];
    const ss = [];
    const cs = [];
    for (let i = 0; i < 6000; i++) {
      const e = calRand() * SQUARE_SIZE;
      const n = calRand() * SQUARE_SIZE;
      hs.push(rawHeight(e, n));
      if (theme.wood) ws.push(woodValue(e, n));
      if (theme.marsh) ms.push(marshValue(e, n));
      if (theme.sand) ss.push(sandValue(e, n));
      if (theme.scrub) cs.push(scrubValue(e, n));
    }
    for (const a of [hs, ws, ms, ss, cs]) a.sort((x, y) => x - y);
    const baseAlt = themeName === 'mountain' ? 350 : 35;
    const heightOffset = baseAlt - quantile(hs, 0.005);
    const waterLevel = theme.waterFrac > 0 ? quantile(hs, theme.waterFrac) + heightOffset : -Infinity;
    const woodThreshold = theme.wood ? quantile(ws, 1 - theme.wood.frac) : Infinity;
    const treeline = theme.wood && theme.wood.treeline ? quantile(hs, theme.wood.treeline) + heightOffset : Infinity;
    const marshLevel = theme.marsh ? quantile(hs, theme.marsh.lowQuantile) + heightOffset : -Infinity;
    const marshThreshold = theme.marsh ? quantile(ms, 1 - theme.marsh.frac) : Infinity;
    const sandThreshold = theme.sand ? quantile(ss, 1 - theme.sand.frac) : Infinity;
    const scrubThreshold = theme.scrub ? quantile(cs, 1 - theme.scrub.frac) : Infinity;
    const settlementMaxAlt = theme.settlements.maxQuantile
      ? quantile(hs, theme.settlements.maxQuantile) + heightOffset
      : Infinity;

    // ---- rivers and basin lakes ----
    // Priority-flood on a coarse grid: drainage is routed from the map edge and the main lakes
    // inwards, so every cell drains somewhere and hollows fill up. Deep enough filled hollows
    // become lakes (in wet themes) with a level surface at their spill height.
    const rivers = [];
    const riverIndex = new SpatialIndex(1000);
    const lakeLevel = new Float32Array(FLOW_N * FLOW_N).fill(-Infinity);
    buildRivers();

    function buildRivers() {
      const N = FLOW_N;
      const H = new Float32Array(N * N);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) H[j * N + i] = rawHeight((i + 0.5) * FLOW_CELL, (j + 0.5) * FLOW_CELL) + heightOffset;
      }

      // Binary min-heap on filled height.
      const heapK = new Int32Array(N * N);
      const heapV = new Float32Array(N * N);
      let size = 0;
      const push = (k, v) => {
        let i = size++;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (heapV[p] <= v) break;
          heapK[i] = heapK[p];
          heapV[i] = heapV[p];
          i = p;
        }
        heapK[i] = k;
        heapV[i] = v;
      };
      const pop = () => {
        const k = heapK[0];
        const lastK = heapK[--size];
        const lastV = heapV[size];
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= size) break;
          if (c + 1 < size && heapV[c + 1] < heapV[c]) c++;
          if (heapV[c] >= lastV) break;
          heapK[i] = heapK[c];
          heapV[i] = heapV[c];
          i = c;
        }
        heapK[i] = lastK;
        heapV[i] = lastV;
        return k;
      };

      const F = Float32Array.from(H);
      const down = new Int32Array(N * N).fill(-1);
      const closed = new Uint8Array(N * N);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          if (i === 0 || j === 0 || i === N - 1 || j === N - 1 || H[k] < waterLevel) {
            closed[k] = 1;
            push(k, H[k]);
          }
        }
      }
      const popOrder = [];
      while (size > 0) {
        const k = pop();
        popOrder.push(k);
        const i = k % N;
        const j = (k - i) / N;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
            const nk = jj * N + ii;
            if (closed[nk]) continue;
            closed[nk] = 1;
            F[nk] = Math.max(H[nk], F[k] + 0.01);
            down[nk] = k;
            push(nk, F[nk]);
          }
        }
      }
      const acc = new Float32Array(N * N).fill(1);
      for (let x = popOrder.length - 1; x >= 0; x--) {
        const k = popOrder[x];
        if (down[k] >= 0) acc[down[k]] += acc[k];
      }

      // Basin lakes: connected filled hollows deeper than 4 m (wet themes only).
      if (theme.rivers.ponds) {
        const seen = new Uint8Array(N * N);
        for (let k0 = 0; k0 < N * N; k0++) {
          if (seen[k0] || F[k0] - H[k0] < 1) continue;
          const comp = [];
          const stack = [k0];
          seen[k0] = 1;
          let maxDepth = 0;
          while (stack.length) {
            const k = stack.pop();
            comp.push(k);
            maxDepth = Math.max(maxDepth, F[k] - H[k]);
            const i = k % N;
            const j = (k - i) / N;
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const ii = i + di;
              const jj = j + dj;
              if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
              const nk = jj * N + ii;
              if (!seen[nk] && F[nk] - H[nk] >= 1) {
                seen[nk] = 1;
                stack.push(nk);
              }
            }
          }
          if (maxDepth < 4) continue;
          // The lake fills the basin only partway (evaporation, seepage); boreal basins fill most.
          let spill = -Infinity;
          let bottom = Infinity;
          for (const k of comp) {
            spill = Math.max(spill, F[k]);
            bottom = Math.min(bottom, H[k]);
          }
          const level = bottom + theme.rivers.lakeFill * (spill - bottom);
          for (const k of comp) if (H[k] < level + 2) lakeLevel[k] = level;
        }
      }

      const minAcc = theme.rivers.minAcc;
      const isRiver = (k) => acc[k] >= minAcc && H[k] >= waterLevel;
      const up = new Uint8Array(N * N);
      for (let k = 0; k < N * N; k++) if (isRiver(k) && down[k] >= 0 && isRiver(down[k])) up[down[k]]++;
      const heads = [];
      for (let k = 0; k < N * N; k++) if (isRiver(k) && up[k] === 0) heads.push(k);
      heads.sort((a, b) => acc[b] - acc[a]);

      const owner = new Int32Array(N * N).fill(-1);
      const centre = (k) => [((k % N) + 0.5) * FLOW_CELL, (Math.floor(k / N) + 0.5) * FLOW_CELL];
      for (const head of heads) {
        const id = rivers.length;
        const pts = [];
        let parent = -1;
        let k = head;
        for (;;) {
          const [e, n] = centre(k);
          pts.push([e, n, acc[k]]);
          if (owner[k] >= 0) {
            parent = owner[k]; // joined an existing river
            break;
          }
          owner[k] = id;
          const d = down[k];
          if (d < 0) break; // map edge or main lake
          if (H[d] < waterLevel) {
            const [de, dn] = centre(d);
            pts.push([de, dn, acc[k]]);
            break;
          }
          k = d;
        }
        if (pts.length >= 2) rivers.push({ id, pts, parent, intermittent: theme.rivers.intermittent });
      }

      // Smooth, pull vertices into the valley bottom, smooth again.
      for (const r of rivers) {
        let p = chaikin(r.pts, 2);
        p = p.map((v, i) => {
          if (i === 0 || i === p.length - 1) return v;
          const a = p[i - 1];
          const b = p[i + 1];
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const L = Math.hypot(dx, dy) || 1;
          const nx = -dy / L;
          const ny = dx / L;
          let best = v;
          let bestH = Infinity;
          for (let t = -160; t <= 160; t += 40) {
            const hh = rawHeight(v[0] + nx * t, v[1] + ny * t);
            if (hh < bestH) {
              bestH = hh;
              best = [v[0] + nx * t, v[1] + ny * t, v[2]];
            }
          }
          return best;
        });
        r.pts = chaikin(p, 1);
      }
      // Tributaries end exactly on their parent river.
      for (const r of rivers) {
        if (r.parent < 0) continue;
        const parent = rivers.find((x) => x.id === r.parent);
        if (!parent) continue;
        const last = r.pts[r.pts.length - 1];
        let best = null;
        let bestD = Infinity;
        for (let i = 0; i < parent.pts.length - 1; i++) {
          const a = parent.pts[i];
          const b = parent.pts[i + 1];
          const [d, t] = segDist(last[0], last[1], a[0], a[1], b[0], b[1]);
          if (d < bestD) {
            bestD = d;
            best = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
          }
        }
        if (best) {
          last[0] = best[0];
          last[1] = best[1];
        }
      }

      // Carving parameters per segment, indexed for height queries.
      const arid = theme.rivers.intermittent;
      for (const r of rivers) {
        for (let i = 0; i < r.pts.length - 1; i++) {
          const a = r.pts[i];
          const b = r.pts[i + 1];
          const accM = (a[2] + b[2]) / 2;
          const rel = Math.log2(accM / minAcc + 1);
          const seg = {
            river: r,
            ax: a[0], ay: a[1], bx: b[0], by: b[1],
            acc: accM,
            w: Math.min(320, (45 + 12 * Math.sqrt(accM)) * (arid ? 1.6 : 1)),
            d: Math.min(10, (2.5 + 2 * rel) * (arid ? 0.45 : 1)),
          };
          const pad = seg.w;
          riverIndex.insert(seg, Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad,
            Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad);
        }
      }
    }

    // Basin lake surface near a point: the highest lake level among the surrounding flow cells.
    function lakeLevelAt(e, n) {
      const i0 = Math.floor(e / FLOW_CELL);
      const j0 = Math.floor(n / FLOW_CELL);
      let L = -Infinity;
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        if (j < 0 || j >= FLOW_N) continue;
        for (let i = i0 - 1; i <= i0 + 1; i++) {
          if (i < 0 || i >= FLOW_N) continue;
          const v = lakeLevel[j * FLOW_N + i];
          if (v > L) L = v;
        }
      }
      return L;
    }

    // Depth of the river valley carved at a point, and the distance to the nearest river.
    function riverAt(e, n) {
      const segs = riverIndex.at(e, n);
      if (!segs) return null;
      let carve = 0;
      let dist = Infinity;
      let nearest = null;
      for (const s of segs) {
        const [d] = segDist(e, n, s.ax, s.ay, s.bx, s.by);
        if (d < dist) {
          dist = d;
          nearest = s;
        }
        if (d < s.w) {
          const t = d / s.w;
          const c = s.d * (1 - t * t);
          if (c > carve) carve = c;
        }
      }
      return { carve, dist, seg: nearest };
    }

    function height(e, n) {
      const r = riverAt(e, n);
      return rawHeight(e, n) + heightOffset - (r ? r.carve : 0);
    }

    // Water surface at a point (main lake level or a basin lake), or -Infinity.
    function waterSurfaceAt(e, n) {
      return Math.max(waterLevel, lakeLevelAt(e, n));
    }

    function isWaterAt(e, n, h) {
      if (h === undefined) h = height(e, n);
      return h < waterLevel || h < lakeLevelAt(e, n);
    }

    function slopeAt(e, n) {
      const d = 25;
      const sx = (height(e + d, n) - height(e - d, n)) / (2 * d);
      const sy = (height(e, n + d) - height(e, n - d)) / (2 * d);
      return Math.sqrt(sx * sx + sy * sy);
    }

    // Land cover. `slope` may be passed when already known (tile rendering).
    function coverAt(e, n, h, slope) {
      if (h === undefined) h = height(e, n);
      if (isWaterAt(e, n, h)) return COVER.WATER;
      const f = api.features;
      if (f && f.builtAt(e, n)) return COVER.BUILT;
      if (slope === undefined) slope = slopeAt(e, n);
      const rock = theme.rock;
      if (slope > rock.slope || (rock.aboveTreeline && h > treeline + rock.aboveTreeline)) return COVER.ROCK;
      if (theme.marsh && h < marshLevel && slope < theme.marsh.maxSlope && marshValue(e, n) > marshThreshold) {
        return COVER.MARSH;
      }
      if (theme.wood && h < treeline && woodValue(e, n) > woodThreshold && !(f && f.clearingAt(e, n))) return COVER.WOOD;
      if (theme.sand && slope < theme.sand.maxSlope && sandValue(e, n) > sandThreshold) return COVER.SAND;
      if (theme.scrub && scrubValue(e, n) > scrubThreshold) return COVER.SCRUB;
      return COVER.OPEN;
    }

    // Cheap wood test (no slope) for line-of-sight work, which samples heavily.
    function isWood(e, n, h) {
      if (!theme.wood) return false;
      if (h === undefined) h = height(e, n);
      if (h >= treeline || isWaterAt(e, n, h)) return false;
      if (woodValue(e, n) <= woodThreshold) return false;
      const f = api.features;
      return !(f && f.clearingAt(e, n));
    }

    // Height of whatever blocks the view: ground, tree canopy, buildings.
    function surfaceHeight(e, n) {
      const h = height(e, n);
      if (isWood(e, n, h)) return h + theme.wood.height;
      const f = api.features;
      if (f && f.buildingAt(e, n)) return h + 8;
      return h;
    }

    // Local hilltops in one 5 km block, refined to ~5 m. Each hilltop belongs to exactly one block.
    function spotHeights(bx, by) {
      const cells = SPOT_BLOCK / SPOT_STEP;
      const Rr = SPOT_RADIUS;
      const M = cells + 2 * Rr;
      const e0 = bx * SPOT_BLOCK - Rr * SPOT_STEP;
      const n0 = by * SPOT_BLOCK - Rr * SPOT_STEP;
      const g = new Float32Array(M * M);
      for (let j = 0; j < M; j++) {
        for (let i = 0; i < M; i++) g[j * M + i] = height(e0 + i * SPOT_STEP, n0 + j * SPOT_STEP);
      }
      const out = [];
      for (let j = Rr; j < Rr + cells; j++) {
        for (let i = Rr; i < Rr + cells; i++) {
          const k = j * M + i;
          const v = g[k];
          if (v <= waterSurfaceAt(e0 + i * SPOT_STEP, n0 + j * SPOT_STEP) + 5) continue;
          if (g[k - 1] > v || g[k + 1] > v || g[k - M] > v || g[k + M] > v) continue;
          let isMax = true;
          for (let dj = -Rr; dj <= Rr && isMax; dj++) {
            for (let di = -Rr; di <= Rr; di++) {
              if (di === 0 && dj === 0) continue;
              const w = g[k + dj * M + di];
              // Tie-break on index so flat tops produce one point, not several.
              if (w > v || (w === v && dj * M + di < 0)) {
                isMax = false;
                break;
              }
            }
          }
          if (!isMax) continue;
          let e = e0 + i * SPOT_STEP;
          let n = n0 + j * SPOT_STEP;
          let hh = v;
          for (const step of [50, 25, 10, 5]) {
            for (let iter = 0; iter < 20; iter++) {
              let best = hh;
              let be = e;
              let bn = n;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (!dx && !dy) continue;
                  const t = height(e + dx * step, n + dy * step);
                  if (t > best) {
                    best = t;
                    be = e + dx * step;
                    bn = n + dy * step;
                  }
                }
              }
              if (best === hh) break;
              hh = best;
              e = be;
              n = bn;
            }
          }
          if (e >= 0 && e < SQUARE_SIZE && n >= 0 && n < SQUARE_SIZE) out.push({ e, n, h: hh });
        }
      }
      return out;
    }

    const api = {
      seed: String(seedInput),
      themeName,
      theme,
      size: SQUARE_SIZE,
      waterLevel,
      treeline,
      settlementMaxAlt,
      rawHeight: (e, n) => rawHeight(e, n) + heightOffset,
      height,
      isWaterAt,
      waterSurfaceAt,
      lakeLevelAt,
      slopeAt,
      coverAt,
      isWood,
      surfaceHeight,
      riverAt,
      rivers,
      riverIndex,
      spotHeights,
      spotBlockSize: SPOT_BLOCK,
      features: null, // settlements, roads, buildings (infrastructure.js)
    };
    if (GL.createInfrastructure) api.features = GL.createInfrastructure(api);
    return api;
  }

  GL.SQUARE_SIZE = SQUARE_SIZE;
  GL.COVER = COVER;
  GL.SpatialIndex = SpatialIndex;
  GL.segDist = segDist;
  GL.chaikin = chaikin;
  GL.createTerrain = createTerrain;
})((window.GL = window.GL || {}));
