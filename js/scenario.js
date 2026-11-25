// Places the mortar, its sector of fire, the forward observer, known points and enemy units.
// Deterministic per map seed.
(function (GL) {
  'use strict';

  const TREE_HEIGHT = 15; // metres of canopy that blocks line of sight
  const EYE_HEIGHT = 2;

  const HOSTILE_TYPES = [
    { icon: 'infantry', echelon: 'section', description: 'Infantry section' },
    { icon: 'infantry', echelon: 'platoon', description: 'Infantry platoon' },
    { icon: 'mechinf', echelon: 'platoon', description: 'Mechanized infantry platoon' },
    { icon: 'armour', echelon: 'platoon', description: 'Tank platoon' },
    { icon: 'recon', echelon: 'section', description: 'Reconnaissance section' },
    { icon: 'antitank', echelon: 'section', description: 'Anti-tank section' },
    { icon: 'mortar', echelon: 'section', description: 'Mortar section' },
  ];

  function createScenario(terrain, seedInput) {
    const G = GL.Geo;
    const weapon = GL.WEAPONS.m81;
    const rand = GL.mulberry32(GL.hashSeed(String(seedInput) + '/scenario'));
    const h = (e, n) => terrain.height(e, n);
    const surface = (e, n) => {
      const z = h(e, n);
      return terrain.isWood(e, n, z) ? z + TREE_HEIGHT : z;
    };
    const slope = (e, n) => {
      const d = 25;
      return Math.max(Math.abs(h(e + d, n) - h(e - d, n)), Math.abs(h(e, n + d) - h(e, n - d))) / (2 * d);
    };
    const dry = (e, n, margin = 0) => h(e, n) > terrain.waterLevel + margin;
    const inBounds = (e, n, m) => e > m && n > m && e < terrain.size - m && n < terrain.size - m;

    // 1. Mortar position: dry, open (no overhead cover), fairly level ground.
    let gun = null;
    for (let i = 0; i < 3000 && !gun; i++) {
      const e = 25000 + rand() * 50000;
      const n = 25000 + rand() * 50000;
      if (!dry(e, n, 3) || terrain.isWood(e, n) || slope(e, n) > 0.08) continue;
      gun = { e: Math.round(e), n: Math.round(n) };
    }
    if (!gun) gun = { e: 50000, n: 50000 };

    // 2. Azimuth of fire: the direction with most dry land within range. Multiples of 100 mils.
    const startAz = Math.floor(rand() * 64) * 100;
    let bestScore = -1;
    let aof = startAz;
    for (let k = 0; k < 16; k++) {
      const az = G.normMils(startAz + k * 400);
      let score = rand() * 2;
      for (let d = 1000; d <= 5000; d += 500) {
        for (const off of [-600, 0, 600]) {
          const [e, n] = G.polar(gun.e, gun.n, az + off, d);
          if (inBounds(e, n, 500) && dry(e, n)) score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        aof = az;
      }
    }
    const sector = { left: G.normMils(aof - 800), right: G.normMils(aof + 800) };

    // 3. Forward observer: high, open ground ahead of the guns.
    let fo = null;
    let foScore = -Infinity;
    for (let i = 0; i < 120; i++) {
      const [e, n] = G.polar(gun.e, gun.n, aof + (rand() * 2 - 1) * 400, 1200 + rand() * 1800);
      if (!inBounds(e, n, 500) || !dry(e, n, 3) || terrain.isWood(e, n)) continue;
      const score = h(e, n) + rand() * 15;
      if (score > foScore) {
        foScore = score;
        fo = { e: Math.round(e), n: Math.round(n) };
      }
    }
    if (!fo) {
      const [e, n] = G.polar(gun.e, gun.n, aof, 2000);
      fo = { e: Math.round(e), n: Math.round(n) };
    }
    const foEye = h(fo.e, fo.n) + EYE_HEIGHT;

    // 4. Enemy units inside the sector and range, preferably visible from the observer.
    const hostiles = [];
    for (let i = 0; i < 5; i++) {
      const type = HOSTILE_TYPES[Math.floor(rand() * HOSTILE_TYPES.length)];
      let placed = null;
      let fallback = null;
      for (let tries = 0; tries < 400 && !placed; tries++) {
        const az = aof + (rand() * 2 - 1) * 700;
        const d = 800 + rand() * (weapon.maxRange - 1000);
        const [e, n] = G.polar(gun.e, gun.n, az, d);
        if (!inBounds(e, n, 300) || !dry(e, n, 2) || slope(e, n) > 0.15) continue;
        const dFo = G.distance(fo.e, fo.n, e, n);
        if (dFo < 300 || dFo > 4000) continue;
        if (hostiles.some((o) => G.distance(o.e, o.n, e, n) < 600)) continue;
        if (!fallback) fallback = { e, n };
        if (G.lineOfSight(surface, fo.e, fo.n, foEye, e, n, h(e, n) + EYE_HEIGHT)) placed = { e, n };
      }
      const p = placed || fallback;
      if (!p) continue;
      hostiles.push({
        id: `ENY${i + 1}`,
        affiliation: 'hostile',
        icon: type.icon,
        echelon: type.echelon,
        description: type.description,
        e: Math.round(p.e),
        n: Math.round(p.n),
        visibleToObserver: !!placed,
      });
    }

    // 5. Known points: prominent hilltops in the sector, for shift missions later.
    const B = terrain.spotBlockSize;
    const candidates = [];
    for (let by = Math.floor((gun.n - 6000) / B); by <= Math.floor((gun.n + 6000) / B); by++) {
      for (let bx = Math.floor((gun.e - 6000) / B); bx <= Math.floor((gun.e + 6000) / B); bx++) {
        if (bx < 0 || by < 0 || bx * B >= terrain.size || by * B >= terrain.size) continue;
        for (const s of terrain.spotHeights(bx, by)) {
          const d = G.distance(gun.e, gun.n, s.e, s.n);
          const az = G.azimuthMils(gun.e, gun.n, s.e, s.n);
          if (d < 1000 || d > weapon.maxRange - 600 || Math.abs(G.diffMils(az, aof)) > 750) continue;
          if (G.distance(fo.e, fo.n, s.e, s.n) < 500) continue; // keep clear of the observer
          candidates.push({ e: Math.round(s.e), n: Math.round(s.n), r: rand() });
        }
      }
    }
    candidates.sort((a, b) => a.r - b.r);
    const knownPoints = candidates.slice(0, 2).map((c, i) => ({
      id: `AB${String(i + 1).padStart(4, '0')}`,
      kind: 'knownPoint',
      description: 'Known point (hilltop)',
      e: c.e,
      n: c.n,
    }));

    return {
      weapon,
      gun: {
        id: 'H24',
        affiliation: 'friend',
        icon: 'mortar',
        echelon: 'platoon',
        label: 'H24',
        description: 'Mortar platoon (own position)',
        e: gun.e,
        n: gun.n,
      },
      azimuthOfFire: aof,
      sector,
      observer: {
        id: 'T31',
        affiliation: 'friend',
        icon: 'observer',
        echelon: 'team',
        label: 'T31',
        description: 'Forward observer',
        e: fo.e,
        n: fo.n,
      },
      hostiles,
      knownPoints,
    };
  }

  GL.createScenario = createScenario;
})((window.GL = window.GL || {}));
