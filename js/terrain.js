// Procedural terrain for one 100 km MGRS square.
// Coordinates are metres within the square: easting e and northing n, both 0..100000.
(function (GL) {
  'use strict';

  const SQUARE_SIZE = 100000;
  const SPOT_BLOCK = 5000; // spot heights are computed per 5 km block
  const SPOT_STEP = 100; // sample spacing when searching for hilltops
  const SPOT_RADIUS = 5; // a hilltop must be the highest point within 5 samples (500 m)

  function quantile(sorted, q) {
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  }

  function createTerrain(seedInput) {
    const seed = GL.hashSeed(seedInput);
    const rand = GL.mulberry32(seed);
    const noiseHeight = GL.createNoise2D(rand);
    const noiseWarpX = GL.createNoise2D(rand);
    const noiseWarpY = GL.createNoise2D(rand);
    const noiseRegion = GL.createNoise2D(rand);
    const noiseRough = GL.createNoise2D(rand);
    const noiseWood = GL.createNoise2D(rand);
    const offsets = [];
    for (let o = 0; o < 8; o++) offsets.push([rand() * 256, rand() * 256]);

    function rawHeight(e, n) {
      const x = e / 6500;
      const y = n / 6500;
      // Domain warp makes the hills less blobby.
      const wx = x + 0.45 * noiseWarpX(x * 0.7, y * 0.7);
      const wy = y + 0.45 * noiseWarpY(x * 0.7, y * 0.7);
      let sum = 0;
      let amp = 1;
      let f = 1;
      for (let o = 0; o < 7; o++) {
        sum += amp * noiseHeight(wx * f + offsets[o][0], wy * f + offsets[o][1]);
        amp *= 0.48;
        f *= 2.07;
      }
      // Some regions are hilly, others gentle.
      const rough = Math.max(0.3, 0.85 + 0.6 * noiseRough(e / 22000 + 1.3, n / 22000 + 7.9));
      const region = noiseRegion(e / 28000 + 3.7, n / 28000 + 9.1);
      return 230 * rough * sum + 130 * region;
    }

    function woodValue(e, n) {
      let s = 0;
      let a = 1;
      let f = 1;
      for (let o = 0; o < 4; o++) {
        s += a * noiseWood((e / 2600) * f + offsets[o][1], (n / 2600) * f + offsets[o][0]);
        a *= 0.5;
        f *= 2.1;
      }
      return s;
    }

    // Calibrate elevation offset, lake level and wood coverage from a sample of the square,
    // so every seed gets a similar amount of water and woodland.
    const calRand = GL.mulberry32(seed ^ 0x9e3779b9);
    const hs = [];
    const ws = [];
    for (let i = 0; i < 6000; i++) {
      const e = calRand() * SQUARE_SIZE;
      const n = calRand() * SQUARE_SIZE;
      hs.push(rawHeight(e, n));
      ws.push(woodValue(e, n));
    }
    hs.sort((a, b) => a - b);
    ws.sort((a, b) => a - b);
    const heightOffset = 35 - quantile(hs, 0.005);
    const waterLevel = quantile(hs, 0.04) + heightOffset;
    const woodThreshold = quantile(ws, 0.7);

    function height(e, n) {
      return rawHeight(e, n) + heightOffset;
    }

    function isWater(h) {
      return h < waterLevel;
    }

    function isWood(e, n, h) {
      if (h === undefined) h = height(e, n);
      return h > waterLevel + 0.5 && woodValue(e, n) > woodThreshold;
    }

    // Local hilltops in one 5 km block, refined to ~5 m. Each hilltop belongs to exactly one block.
    function spotHeights(bx, by) {
      const cells = SPOT_BLOCK / SPOT_STEP;
      const R = SPOT_RADIUS;
      const M = cells + 2 * R;
      const e0 = bx * SPOT_BLOCK - R * SPOT_STEP;
      const n0 = by * SPOT_BLOCK - R * SPOT_STEP;
      const g = new Float32Array(M * M);
      for (let j = 0; j < M; j++) {
        for (let i = 0; i < M; i++) g[j * M + i] = height(e0 + i * SPOT_STEP, n0 + j * SPOT_STEP);
      }
      const out = [];
      for (let j = R; j < R + cells; j++) {
        for (let i = R; i < R + cells; i++) {
          const k = j * M + i;
          const v = g[k];
          if (v <= waterLevel + 5) continue;
          if (g[k - 1] > v || g[k + 1] > v || g[k - M] > v || g[k + M] > v) continue;
          let isMax = true;
          for (let dj = -R; dj <= R && isMax; dj++) {
            for (let di = -R; di <= R; di++) {
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
          let h = v;
          for (const step of [50, 25, 10, 5]) {
            for (let iter = 0; iter < 20; iter++) {
              let best = h;
              let be = e;
              let bn = n;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (!dx && !dy) continue;
                  const hh = height(e + dx * step, n + dy * step);
                  if (hh > best) {
                    best = hh;
                    be = e + dx * step;
                    bn = n + dy * step;
                  }
                }
              }
              if (best === h) break;
              h = best;
              e = be;
              n = bn;
            }
          }
          if (e >= 0 && e < SQUARE_SIZE && n >= 0 && n < SQUARE_SIZE) out.push({ e, n, h });
        }
      }
      return out;
    }

    return {
      seed: String(seedInput),
      size: SQUARE_SIZE,
      waterLevel,
      height,
      isWater,
      isWood,
      spotHeights,
      spotBlockSize: SPOT_BLOCK,
    };
  }

  GL.SQUARE_SIZE = SQUARE_SIZE;
  GL.createTerrain = createTerrain;
})((window.GL = window.GL || {}));
