// Seeded random numbers and 2D gradient (Perlin) noise.
(function (GL) {
  'use strict';

  // Small, fast, seedable PRNG. Returns floats in [0, 1).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Turns any string or number into a 32-bit seed (FNV-1a for strings).
  function hashSeed(input) {
    const str = String(input);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  // Returns noise(x, y) in roughly [-1, 1], smooth, with features ~1 unit apart.
  function createNoise2D(rand) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

    const gx = new Float64Array(256);
    const gy = new Float64Array(256);
    for (let i = 0; i < 256; i++) {
      const a = rand() * Math.PI * 2;
      gx[i] = Math.cos(a);
      gy[i] = Math.sin(a);
    }

    return function noise(x, y) {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const xf = x - x0;
      const yf = y - y0;
      const X = x0 & 255;
      const Y = y0 & 255;
      const pX = perm[X];
      const pX1 = perm[X + 1];
      const aa = perm[pX + Y];
      const ab = perm[pX + Y + 1];
      const ba = perm[pX1 + Y];
      const bb = perm[pX1 + Y + 1];

      const n00 = gx[aa] * xf + gy[aa] * yf;
      const n10 = gx[ba] * (xf - 1) + gy[ba] * yf;
      const n01 = gx[ab] * xf + gy[ab] * (yf - 1);
      const n11 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1);

      const u = fade(xf);
      const v = fade(yf);
      const nx0 = n00 + u * (n10 - n00);
      const nx1 = n01 + u * (n11 - n01);
      return (nx0 + v * (nx1 - nx0)) * 1.4142;
    };
  }

  GL.mulberry32 = mulberry32;
  GL.hashSeed = hashSeed;
  GL.createNoise2D = createNoise2D;
})((window.GL = window.GL || {}));
