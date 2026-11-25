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

    // 1–2. Mortar position and azimuth of fire. The position must be dry, open (no overhead
    // cover) and fairly level. Candidates are scored on dry land in the sector and on how much
    // of it lies near the mortar's own altitude (so early missions need no height correction).
    // Azimuths of fire are multiples of 100 mils.
    let gun = null;
    let aof = 0;
    let bestScore = -Infinity;
    for (let i = 0, found = 0; i < 4000 && found < 25; i++) {
      const ge = 25000 + rand() * 50000;
      const gn = 25000 + rand() * 50000;
      if (!dry(ge, gn, 3) || terrain.isWood(ge, gn) || slope(ge, gn) > 0.08) continue;
      found++;
      const gAlt = h(ge, gn);
      const startAz = Math.floor(rand() * 64) * 100;
      for (let k = 0; k < 16; k++) {
        const az = G.normMils(startAz + k * 400);
        let score = rand() * 2;
        for (let d = 1000; d <= 5000; d += 500) {
          for (const off of [-600, 0, 600]) {
            const [e, n] = G.polar(ge, gn, az + off, d);
            if (!inBounds(e, n, 500) || !dry(e, n)) continue;
            score++;
            if (Math.abs(h(e, n) - gAlt) <= 25) score += 2;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          gun = { e: Math.round(ge), n: Math.round(gn) };
          aof = az;
        }
      }
    }
    if (!gun) gun = { e: 50000, n: 50000 };
    const sector = { left: G.normMils(aof - 800), right: G.normMils(aof + 800) };

    // 3. Forward observer: open ground ahead of the guns with the best view over the sector.
    const viewPoints = [];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        const [e, n] = G.polar(gun.e, gun.n, aof + (i / 5 - 0.5) * 1400, 800 + (j / 5) * (weapon.maxRange - 1200));
        if (inBounds(e, n, 100) && dry(e, n)) viewPoints.push([e, n, h(e, n) + EYE_HEIGHT]);
      }
    }
    let fo = null;
    let foScore = -Infinity;
    for (let i = 0, tried = 0; i < 300 && tried < 40; i++) {
      const [e, n] = G.polar(gun.e, gun.n, aof + (rand() * 2 - 1) * 400, 1200 + rand() * 1800);
      if (!inBounds(e, n, 500) || !dry(e, n, 3) || terrain.isWood(e, n)) continue;
      tried++;
      const eye = h(e, n) + EYE_HEIGHT;
      let visible = 0;
      for (const [pe, pn, pz] of viewPoints) {
        if (G.lineOfSight(surface, e, n, eye, pe, pn, pz, 40)) visible++;
      }
      const score = visible * 10 + h(e, n) * 0.05 + rand() * 5;
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
      referredDeflection: 2800, // deflection set on the sight when laid on the azimuth of fire
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
