// Settlements, roads, bridges and buildings, generated to fit the terrain and theme.
// Attached to the terrain as terrain.features (createTerrain calls createInfrastructure).
(function (GL) {
  'use strict';

  const ROAD_CELL = 250; // metres per node of the road routing grid
  const SIZE = { town: 550, village: 230, hamlet: 100 }; // settlement radius, metres
  const BUILDINGS = { town: [90, 170], village: [16, 40], hamlet: [4, 9] };
  const CLASS_RANK = { main: 3, secondary: 2, track: 1 };

  const ROAD_STYLE = {
    main: { casing: '#4a2416', casingW: 5.5, fill: '#e0533a', fillW: 3.5 },
    secondary: { casing: '#5a4a2a', casingW: 4.5, fill: '#f2c94c', fillW: 2.8 },
    track: { fill: '#4a3b2a', fillW: 1.4, dash: [6, 3] },
  };

  // Douglas-Peucker simplification of [e, n] points.
  function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let best = -1;
      let bestD = tol;
      for (let i = a + 1; i < b; i++) {
        const [d] = GL.segDist(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]);
        if (d > bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) {
        keep[best] = 1;
        stack.push([a, best], [best, b]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  }

  function segIntersect(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]];
    const s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
    const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return [a[0] + t * r[0], a[1] + t * r[1]];
  }

  function createInfrastructure(terrain) {
    const theme = terrain.theme;
    const C = GL.COVER;
    const G = GL.Geo;
    const size = terrain.size;
    const rand = GL.mulberry32(GL.hashSeed(terrain.seed + '/infrastructure'));
    const nextName = GL.nameGenerator(theme.names, rand);
    const scfg = theme.settlements;
    const rcfg = theme.roads;

    // ---- settlements ---------------------------------------------------------
    const settlements = [];
    const S = scfg.spacing;
    const siteOk = (e, n) => {
      if (e < 800 || n < 800 || e > size - 800 || n > size - 800) return null;
      const h = terrain.height(e, n);
      if (h < terrain.waterSurfaceAt(e, n) + 3 || h > terrain.settlementMaxAlt) return null;
      const slope = terrain.slopeAt(e, n);
      if (slope > (theme.relief.ridged > 0.5 ? 0.12 : 0.08)) return null;
      const c = terrain.coverAt(e, n, h, slope);
      if (c === C.MARSH || c === C.ROCK || c === C.WATER) return null;
      const r = terrain.riverAt(e, n);
      return { h, slope, nearRiver: r && r.dist < 700 };
    };
    for (let gy = 0; gy * S < size; gy++) {
      for (let gx = 0; gx * S < size; gx++) {
        if (rand() > scfg.prob) continue;
        let best = null;
        let bestScore = -Infinity;
        for (let k = 0; k < 8; k++) {
          const e = (gx + 0.15 + rand() * 0.7) * S;
          const n = (gy + 0.15 + rand() * 0.7) * S;
          const s = siteOk(e, n);
          if (!s) continue;
          const score = -s.slope * 40 + (s.nearRiver ? 1.5 : 0) - s.h / 2000 + rand() * 0.5;
          if (score > bestScore) {
            bestScore = score;
            best = { e, n };
          }
        }
        if (!best) continue;
        const r = rand();
        const kind = r < scfg.townFrac ? 'town' : r < scfg.townFrac + scfg.hamletFrac ? 'hamlet' : 'village';
        settlements.push({
          id: settlements.length,
          name: nextName(),
          kind,
          e: Math.round(best.e),
          n: Math.round(best.n),
          r: SIZE[kind] * (0.8 + rand() * 0.4),
        });
      }
    }
    const settlementIndex = new GL.SpatialIndex(2000);
    for (const s of settlements) {
      const pad = s.r * 1.8;
      settlementIndex.insert(s, s.e - pad, s.n - pad, s.e + pad, s.n + pad);
    }

    // ---- road network: nearest neighbours, pruned with the Gabriel test ------
    const edges = new Map();
    for (const a of settlements) {
      const near = settlements
        .filter((b) => b !== a)
        .map((b) => ({ b, d: G.distance(a.e, a.n, b.e, b.n) }))
        .filter((x) => x.d <= rcfg.maxDist)
        .sort((x, y) => x.d - y.d)
        .slice(0, rcfg.k);
      for (const { b } of near) {
        const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
        if (!edges.has(key)) edges.set(key, [a, b]);
      }
    }
    const roadPairs = [];
    for (const [a, b] of edges.values()) {
      // Drop the edge if another settlement lies inside the circle with AB as diameter.
      const me = (a.e + b.e) / 2;
      const mn = (a.n + b.n) / 2;
      const r2 = ((a.e - b.e) ** 2 + (a.n - b.n) ** 2) / 4;
      const blocked = settlements.some((c) => c !== a && c !== b && (c.e - me) ** 2 + (c.n - mn) ** 2 < r2 * 0.85);
      if (blocked) continue;
      const rank = Math.min(a.kind === 'town' ? 3 : a.kind === 'village' ? 2 : 1, b.kind === 'town' ? 3 : b.kind === 'village' ? 2 : 1);
      let cls = rank === 3 ? 'main' : rank === 2 ? 'secondary' : 'track';
      if (rcfg.trackOnly) cls = rank === 3 ? 'secondary' : 'track';
      if (a.kind === 'town' && b.kind !== 'hamlet' && !rcfg.trackOnly) cls = 'main';
      roadPairs.push({ a, b, cls });
    }
    roadPairs.sort((x, y) => CLASS_RANK[y.cls] - CLASS_RANK[x.cls]);

    // ---- routing grid (lazy) --------------------------------------------------
    const NG = size / ROAD_CELL + 1;
    const nodeH = new Float32Array(NG * NG).fill(NaN);
    const nodeCost = new Float32Array(NG * NG).fill(NaN); // terrain multiplier, Infinity = impassable
    const nodeRiver = new Uint8Array(NG * NG);
    const used = new Uint8Array(NG * NG); // best road class through the node
    const slopeCost = rcfg.slopeCost || 1;
    const nodeInfo = (k) => {
      if (Number.isNaN(nodeH[k])) {
        const e = (k % NG) * ROAD_CELL;
        const n = Math.floor(k / NG) * ROAD_CELL;
        const h = terrain.height(e, n);
        nodeH[k] = h;
        const c = terrain.coverAt(e, n, h);
        nodeCost[k] = c === C.WATER ? Infinity : c === C.MARSH ? 4 : c === C.ROCK ? 3 : c === C.WOOD ? 1.3 : c === C.SAND ? 1.15 : 1;
        const r = terrain.riverAt(e, n);
        nodeRiver[k] = r && r.dist < 90 ? 1 : 0;
      }
      return k;
    };

    // Binary min-heap.
    function makeHeap() {
      const ks = [];
      const vs = [];
      return {
        get size() {
          return ks.length;
        },
        push(k, v) {
          ks.push(k);
          vs.push(v);
          let i = ks.length - 1;
          while (i > 0) {
            const p = (i - 1) >> 1;
            if (vs[p] <= vs[i]) break;
            [ks[p], ks[i]] = [ks[i], ks[p]];
            [vs[p], vs[i]] = [vs[i], vs[p]];
            i = p;
          }
        },
        pop() {
          const k = ks[0];
          const lk = ks.pop();
          const lv = vs.pop();
          if (ks.length) {
            ks[0] = lk;
            vs[0] = lv;
            let i = 0;
            for (;;) {
              let c = 2 * i + 1;
              if (c >= ks.length) break;
              if (c + 1 < ks.length && vs[c + 1] < vs[c]) c++;
              if (vs[c] >= vs[i]) break;
              [ks[c], ks[i]] = [ks[i], ks[c]];
              [vs[c], vs[i]] = [vs[i], vs[c]];
              i = c;
            }
          }
          return k;
        },
      };
    }

    function route(a, b) {
      const pad = 2500;
      const i0 = Math.max(0, Math.floor((Math.min(a.e, b.e) - pad) / ROAD_CELL));
      const i1 = Math.min(NG - 1, Math.ceil((Math.max(a.e, b.e) + pad) / ROAD_CELL));
      const j0 = Math.max(0, Math.floor((Math.min(a.n, b.n) - pad) / ROAD_CELL));
      const j1 = Math.min(NG - 1, Math.ceil((Math.max(a.n, b.n) + pad) / ROAD_CELL));
      const start = Math.round(a.n / ROAD_CELL) * NG + Math.round(a.e / ROAD_CELL);
      const goal = Math.round(b.n / ROAD_CELL) * NG + Math.round(b.e / ROAD_CELL);
      const gi = goal % NG;
      const gj = Math.floor(goal / NG);
      const gScore = new Map([[start, 0]]);
      const came = new Map();
      const heap = makeHeap();
      heap.push(start, 0);
      const done = new Set();
      while (heap.size) {
        const k = heap.pop();
        if (k === goal) break;
        if (done.has(k)) continue;
        done.add(k);
        const i = k % NG;
        const j = Math.floor(k / NG);
        nodeInfo(k);
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ii = i + di;
            const jj = j + dj;
            if (ii < i0 || ii > i1 || jj < j0 || jj > j1) continue;
            const nk = jj * NG + ii;
            if (done.has(nk)) continue;
            nodeInfo(nk);
            const mult = nodeCost[nk];
            if (mult === Infinity && nk !== goal) continue;
            const d = (di && dj ? Math.SQRT2 : 1) * ROAD_CELL;
            const slope = Math.abs(nodeH[nk] - nodeH[k]) / d;
            let cost = d * mult * (1 + slopeCost * (slope / 0.07) ** 2);
            if (slope > 0.22) cost *= 15;
            if (nodeRiver[nk] && !nodeRiver[k]) cost += 900; // bridge
            if (used[nk]) cost *= 0.45; // follow existing roads
            const g = gScore.get(k) + cost;
            if (g < (gScore.get(nk) ?? Infinity)) {
              gScore.set(nk, g);
              came.set(nk, k);
              heap.push(nk, g + Math.hypot(ii - gi, jj - gj) * ROAD_CELL * 0.45);
            }
          }
        }
      }
      if (!came.has(goal)) return null;
      const path = [goal];
      while (path[path.length - 1] !== start) path.push(came.get(path[path.length - 1]));
      path.reverse();
      return path;
    }

    const roads = [];
    const roadIndex = new GL.SpatialIndex(1000);
    for (const p of roadPairs) {
      const path = route(p.a, p.b);
      if (!path) continue;
      for (const k of path) used[k] = Math.max(used[k], CLASS_RANK[p.cls]);
      let pts = path.map((k) => [(k % NG) * ROAD_CELL, Math.floor(k / NG) * ROAD_CELL]);
      pts[0] = [p.a.e, p.a.n];
      pts[pts.length - 1] = [p.b.e, p.b.n];
      pts = GL.chaikin(simplify(pts, 35), 2);
      const road = { cls: p.cls, pts, from: p.a, to: p.b };
      roads.push(road);
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const seg = { road, ax, ay, bx, by };
        roadIndex.insert(seg, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
      }
    }

    // ---- bridges ----------------------------------------------------------------
    const bridges = [];
    for (const road of roads) {
      const p = road.pts;
      for (let i = 0; i < p.length - 1; i++) {
        const near = terrain.riverIndex.query(Math.min(p[i][0], p[i + 1][0]), Math.min(p[i][1], p[i + 1][1]),
          Math.max(p[i][0], p[i + 1][0]), Math.max(p[i][1], p[i + 1][1]));
        for (const s of near) {
          // Small streams get culverts and dry wadis are crossed at grade: no bridge symbol.
          if (s.acc < theme.rivers.minAcc * 1.2 || s.river.intermittent) continue;
          const x = segIntersect(p[i], p[i + 1], [s.ax, s.ay], [s.bx, s.by]);
          if (!x) continue;
          if (bridges.some((b) => G.distance(b.e, b.n, x[0], x[1]) < 150)) continue;
          bridges.push({
            e: x[0],
            n: x[1],
            angle: Math.atan2(p[i + 1][1] - p[i][1], p[i + 1][0] - p[i][0]),
            cls: road.cls,
            dry: s.river.intermittent,
          });
        }
      }
    }
    const bridgeIndex = new GL.SpatialIndex(2000);
    for (const b of bridges) bridgeIndex.insert(b, b.e, b.n, b.e, b.n);

    // ---- buildings -----------------------------------------------------------
    const buildings = [];
    const buildingIndex = new GL.SpatialIndex(500);
    const free = (e, n, minD) => {
      const near = buildingIndex.query(e - minD, n - minD, e + minD, n + minD);
      for (const b of near) if ((b.e - e) ** 2 + (b.n - n) ** 2 < minD * minD) return false;
      return true;
    };
    const buildable = (e, n) => {
      const h = terrain.height(e, n);
      if (h < terrain.waterSurfaceAt(e, n) + 1.5) return false;
      const r = terrain.riverAt(e, n);
      if (r && r.dist < 30) return false;
      return terrain.slopeAt(e, n) < 0.2;
    };
    const addBuilding = (e, n, angle, w, d, s) => {
      const b = { e, n, angle, w, d, settlement: s };
      buildings.push(b);
      const R = Math.max(w, d);
      buildingIndex.insert(b, e - R, n - R, e + R, n + R);
    };
    for (const s of settlements) {
      const [lo, hi] = BUILDINGS[s.kind];
      const target = Math.round(lo + rand() * (hi - lo));
      let count = 0;
      // Along the roads through the settlement.
      const segs = roadIndex.query(s.e - s.r, s.n - s.r, s.e + s.r, s.n + s.r);
      const spacing = s.kind === 'town' ? 22 : s.kind === 'village' ? 28 : 36;
      for (const seg of segs) {
        const len = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay);
        const ang = Math.atan2(seg.by - seg.ay, seg.bx - seg.ax);
        const nx = -Math.sin(ang);
        const ny = Math.cos(ang);
        for (let t = spacing / 2; t < len && count < target; t += spacing) {
          const pe = seg.ax + (t / len) * (seg.bx - seg.ax);
          const pn = seg.ay + (t / len) * (seg.by - seg.ay);
          const dc = G.distance(pe, pn, s.e, s.n) / s.r;
          if (dc > 1) continue;
          for (const side of [-1, 1]) {
            if (rand() > 0.85 * (1 - dc * dc) + 0.1) continue;
            const off = 14 + rand() * 6;
            const e = pe + nx * off * side;
            const n = pn + ny * off * side;
            if (!free(e, n, 13) || !buildable(e, n)) continue;
            addBuilding(e, n, ang, 9 + rand() * 9, 7 + rand() * 5, s);
            count++;
          }
        }
      }
      // A cluster around the centre for the rest, aligned with the main road if there is one.
      const baseAng = segs.size ? [...segs][0] : null;
      const ang0 = baseAng ? Math.atan2(baseAng.by - baseAng.ay, baseAng.bx - baseAng.ax) : rand() * Math.PI;
      for (let tries = 0; count < target && tries < target * 12; tries++) {
        const rr = s.r * 0.75 * Math.sqrt(rand());
        const a = rand() * Math.PI * 2;
        const e = s.e + Math.cos(a) * rr;
        const n = s.n + Math.sin(a) * rr;
        if (!free(e, n, 16) || !buildable(e, n)) continue;
        addBuilding(e, n, ang0 + (rand() < 0.5 ? 0 : Math.PI / 2), 8 + rand() * 10, 7 + rand() * 6, s);
        count++;
      }
      s.buildingCount = count;
    }

    // ---- queries ------------------------------------------------------------------

    function nearestSettlement(e, n) {
      const near = settlementIndex.at(e, n);
      let best = null;
      let bestD = Infinity;
      if (near) {
        for (const s of near) {
          const d = G.distance(e, n, s.e, s.n);
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
      }
      return best ? { s: best, d: bestD } : null;
    }

    // Built-up area: 12.5 m cells within ~30 m of a building in a village or town.
    const BUILT_CELL = 12.5;
    const builtCells = new Set();
    const cellKey = (i, j) => i * 8192 + j;
    for (const b of buildings) {
      if (b.settlement.kind === 'hamlet') continue;
      const R = 30 + Math.max(b.w, b.d) / 2;
      for (let j = Math.floor((b.n - R) / BUILT_CELL); j <= Math.floor((b.n + R) / BUILT_CELL); j++) {
        for (let i = Math.floor((b.e - R) / BUILT_CELL); i <= Math.floor((b.e + R) / BUILT_CELL); i++) {
          const ce = (i + 0.5) * BUILT_CELL;
          const cn = (j + 0.5) * BUILT_CELL;
          if ((ce - b.e) ** 2 + (cn - b.n) ** 2 <= R * R) builtCells.add(cellKey(i, j));
        }
      }
    }
    function builtAt(e, n) {
      return builtCells.has(cellKey(Math.floor(e / BUILT_CELL), Math.floor(n / BUILT_CELL)));
    }

    // Fields and pasture around settlements, with irregular edges: no forest there.
    const clearingNoise = GL.createNoise2D(rand);
    function clearingAt(e, n) {
      const near = settlementIndex.at(e, n);
      if (!near) return false;
      for (const s of near) {
        const R = s.r * (1.45 + 0.55 * clearingNoise(e / 380, n / 380));
        if ((e - s.e) ** 2 + (n - s.n) ** 2 < R * R) return true;
      }
      return false;
    }

    function buildingAt(e, n) {
      const near = buildingIndex.at(e, n);
      if (!near) return null;
      for (const b of near) {
        const dx = e - b.e;
        const dy = n - b.n;
        const c = Math.cos(b.angle);
        const s = Math.sin(b.angle);
        if (Math.abs(dx * c + dy * s) < b.w / 2 && Math.abs(-dx * s + dy * c) < b.d / 2) return b;
      }
      return null;
    }

    function nearestRoad(e, n, maxD) {
      const segs = roadIndex.query(e - maxD, n - maxD, e + maxD, n + maxD);
      let best = null;
      let bestD = maxD;
      for (const s of segs) {
        const [d] = GL.segDist(e, n, s.ax, s.ay, s.bx, s.by);
        if (d < bestD) {
          bestD = d;
          best = s.road;
        }
      }
      return best ? { road: best, d: bestD } : null;
    }

    function nearestBridge(e, n, maxD) {
      const near = bridgeIndex.query(e - maxD, n - maxD, e + maxD, n + maxD);
      let best = null;
      let bestD = maxD;
      for (const b of near) {
        const d = G.distance(e, n, b.e, b.n);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      return best ? { b: best, d: bestD } : null;
    }

    // ---- drawing on map tiles -------------------------------------------------------

    function drawTile(ctx, e0, nTop, tileM, tm, dpr) {
      const cssMpp = tm * dpr;
      const X = (e) => (e - e0) / tm;
      const Y = (n) => (nTop - n) / tm;
      const pad = 100;
      const box = [e0 - pad, nTop - tileM - pad, e0 + tileM + pad, nTop + pad];
      const scale = cssMpp > 25 ? 0.6 : cssMpp > 10 ? 0.8 : 1;

      // Buildings (or a built-up dot when zoomed far out).
      if (cssMpp <= 6) {
        const bs = buildingIndex.query(...box);
        ctx.fillStyle = '#2f2a28';
        for (const b of bs) {
          ctx.save();
          ctx.translate(X(b.e), Y(b.n));
          ctx.rotate(-b.angle);
          const w = Math.max(b.w / tm, 1.2 * dpr);
          const d = Math.max(b.d / tm, 1.2 * dpr);
          ctx.fillRect(-w / 2, -d / 2, w, d);
          ctx.restore();
        }
      }

      // Roads: tracks first, then casings and fills of the larger classes on top.
      const segs = roadIndex.query(...box);
      const byClass = { main: [], secondary: [], track: [] };
      for (const s of segs) byClass[s.road.cls].push(s);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pathOf = (list) => {
        const p = new Path2D();
        for (const s of list) {
          p.moveTo(X(s.ax), Y(s.ay));
          p.lineTo(X(s.bx), Y(s.by));
        }
        return p;
      };
      if (cssMpp <= 20 && byClass.track.length) {
        const st = ROAD_STYLE.track;
        ctx.setLineDash(st.dash.map((v) => v * dpr));
        ctx.strokeStyle = st.fill;
        ctx.lineWidth = st.fillW * dpr;
        ctx.lineCap = 'butt';
        ctx.stroke(pathOf(byClass.track));
        ctx.setLineDash([]);
        ctx.lineCap = 'round';
      }
      for (const cls of ['secondary', 'main']) {
        if (!byClass[cls].length) continue;
        const st = ROAD_STYLE[cls];
        const p = pathOf(byClass[cls]);
        ctx.strokeStyle = st.casing;
        ctx.lineWidth = st.casingW * dpr * scale;
        ctx.stroke(p);
        ctx.strokeStyle = st.fill;
        ctx.lineWidth = st.fillW * dpr * scale;
        ctx.stroke(p);
      }

      // Bridges: short parallel lines either side of the road.
      if (cssMpp <= 12) {
        const bs = bridgeIndex.query(...box);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.2 * dpr;
        for (const b of bs) {
          const half = (b.cls === 'track' ? 3 : 4.5) * dpr;
          const len = 7 * dpr;
          ctx.save();
          ctx.translate(X(b.e), Y(b.n));
          ctx.rotate(-b.angle);
          ctx.beginPath();
          for (const side of [-1, 1]) {
            ctx.moveTo(-len, side * half);
            ctx.lineTo(len, side * half);
            ctx.moveTo(-len - 2 * dpr, side * (half + 2 * dpr));
            ctx.lineTo(-len, side * half);
            ctx.moveTo(len + 2 * dpr, side * (half + 2 * dpr));
            ctx.lineTo(len, side * half);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // Settlement name labels for the map overlay at the given scale.
    function labels(e0, n0, e1, n1, cssMpp) {
      const out = [];
      for (const s of settlementIndex.query(e0, n0, e1, n1)) {
        if (s.e < e0 || s.e > e1 || s.n < n0 || s.n > n1) continue;
        const show = s.kind === 'town' ? cssMpp <= 40 : s.kind === 'village' ? cssMpp <= 14 : cssMpp <= 5;
        if (show) out.push(s);
      }
      return out;
    }

    return {
      settlements,
      roads,
      bridges,
      buildings,
      settlementIndex,
      roadIndex,
      bridgeIndex,
      buildingIndex,
      builtAt,
      clearingAt,
      buildingAt,
      nearestSettlement,
      nearestRoad,
      nearestBridge,
      drawTile,
      labels,
    };
  }

  GL.ROAD_STYLE = ROAD_STYLE;
  GL.createInfrastructure = createInfrastructure;
})((window.GL = window.GL || {}));
