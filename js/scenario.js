// Places the mortar, its sector of fire, the forward observer, known points and enemy units.
// Deterministic per map seed.
(function (GL) {
  'use strict';

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
    // Observers in flat forest country use a raised post (tower, tall tree).
    const obsEye = terrain.theme.observerEye || EYE_HEIGHT;
    const h = (e, n) => terrain.height(e, n);
    const surface = (e, n) => terrain.surfaceHeight(e, n);
    const slope = (e, n) => {
      const d = 25;
      return Math.max(Math.abs(h(e + d, n) - h(e - d, n)), Math.abs(h(e, n + d) - h(e, n - d))) / (2 * d);
    };
    // Dry ground at least `margin` metres above any water surface.
    const dry = (e, n, margin = 0) => h(e, n) > terrain.waterSurfaceAt(e, n) + margin;
    // Firm, open ground for weapons and observers: no woods, marsh or buildings.
    const C = GL.COVER;
    const open = (e, n) => {
      const c = terrain.coverAt(e, n);
      return c === C.OPEN || c === C.SAND || c === C.SCRUB;
    };
    const inBounds = (e, n, m) => e > m && n > m && e < terrain.size - m && n < terrain.size - m;

    // 1–2. Mortar position and azimuth of fire. The position must be dry, open (no overhead
    // cover) and fairly level. Candidates are scored on dry land in the sector and on a mix of
    // ground near the mortar's own altitude (missions without height correction) and ground
    // clearly above or below it (height-difference missions). Azimuths of fire are multiples
    // of 100 mils.
    // Positions near a road are preferred (supply), and sectors containing settlements and
    // roads (where the enemy will be and observers describe targets by).
    const feats = terrain.features;
    let gun = null;
    let aof = 0;
    let bestScore = -Infinity;
    for (let i = 0, found = 0; i < 4000 && found < 30; i++) {
      const ge = 25000 + rand() * 50000;
      const gn = 25000 + rand() * 50000;
      if (!dry(ge, gn, 3) || slope(ge, gn) > 0.08 || !open(ge, gn)) continue;
      found++;
      const gAlt = h(ge, gn);
      const roadBonus = feats && feats.nearestRoad(ge, gn, 600) ? 8 : 0;
      const nearSettlements = feats
        ? feats.settlements.filter((s) => s.kind !== 'hamlet' && G.distance(ge, gn, s.e, s.n) < weapon.maxRange)
        : [];
      const startAz = Math.floor(rand() * 64) * 100;
      for (let k = 0; k < 16; k++) {
        const az = G.normMils(startAz + k * 400);
        let score = rand() * 2 + roadBonus;
        let level = 0;
        let relief = 0;
        let roads = 0;
        for (let d = 1000; d <= 5000; d += 500) {
          for (const off of [-600, -300, 0, 300, 600]) {
            const [e, n] = G.polar(ge, gn, az + off, d);
            if (!inBounds(e, n, 500) || !dry(e, n)) continue;
            score++;
            const vi = Math.abs(h(e, n) - gAlt);
            if (vi <= 20) level++;
            else if (vi >= 40 && vi <= 150) relief++;
            if (feats && feats.nearestRoad(e, n, 250)) roads++;
          }
        }
        let villages = 0;
        for (const s of nearSettlements) {
          const sd = G.distance(ge, gn, s.e, s.n);
          if (sd > 900 && Math.abs(G.diffMils(G.azimuthMils(ge, gn, s.e, s.n), az)) <= 700) villages++;
        }
        score += 2.5 * Math.min(level, 15) + 2.5 * Math.min(relief, 12) + 1.5 * Math.min(roads, 10) + 9 * Math.min(villages, 3);
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
        if (inBounds(e, n, 100) && dry(e, n)) viewPoints.push([e, n, h(e, n) + EYE_HEIGHT, 1]);
      }
    }
    // Settlements in the sector count double: the observer should be able to see them.
    if (feats) {
      for (const s of feats.settlements) {
        const d = G.distance(gun.e, gun.n, s.e, s.n);
        if (d > 800 && d < weapon.maxRange && Math.abs(G.diffMils(G.azimuthMils(gun.e, gun.n, s.e, s.n), aof)) <= 750) {
          viewPoints.push([s.e, s.n, h(s.e, s.n) + 10, 2]);
        }
      }
    }
    let fo = null;
    let foScore = -Infinity;
    for (let i = 0, tried = 0; i < 300 && tried < 40; i++) {
      const [e, n] = G.polar(gun.e, gun.n, aof + (rand() * 2 - 1) * 400, 1200 + rand() * 1800);
      if (!inBounds(e, n, 500) || !dry(e, n, 3) || !open(e, n)) continue;
      tried++;
      const eye = h(e, n) + obsEye;
      let visible = 0;
      for (const [pe, pn, pz, w] of viewPoints) {
        if (G.lineOfSight(surface, e, n, eye, pe, pn, pz, 40)) visible += w;
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
    const foEye = h(fo.e, fo.n) + obsEye;

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

    // 5. Known points for shift missions, all visible to the observer: map features (bridges,
    // village churches), hilltops, and other ground in the sector if there are too few.
    const foSees = (e, n, above = EYE_HEIGHT) => G.lineOfSight(surface, fo.e, fo.n, foEye, e, n, h(e, n) + above);
    const inSector = (e, n) => {
      const d = G.distance(gun.e, gun.n, e, n);
      const az = G.azimuthMils(gun.e, gun.n, e, n);
      return d >= 1000 && d <= weapon.maxRange - 600 && Math.abs(G.diffMils(az, aof)) <= 750 &&
        G.distance(fo.e, fo.n, e, n) >= 500;
    };
    const featureKPs = [];
    const f = terrain.features;
    if (f) {
      for (const b of f.bridges) {
        if (inSector(b.e, b.n) && foSees(b.e, b.n, 4)) featureKPs.push({ e: Math.round(b.e), n: Math.round(b.n), r: rand(), what: 'bridge' });
      }
      for (const s of f.settlements) {
        if (s.kind === 'hamlet' || !inSector(s.e, s.n)) continue;
        // The church tower at the centre is visible from further than the houses.
        if (foSees(s.e, s.n, 20)) featureKPs.push({ e: s.e, n: s.n, r: rand(), what: `church, ${s.name}` });
      }
      featureKPs.sort((a, b) => a.r - b.r);
    }
    const B = terrain.spotBlockSize;
    const candidates = featureKPs.slice(0, 2);
    const hilltops = [];
    for (let by = Math.floor((gun.n - 6000) / B); by <= Math.floor((gun.n + 6000) / B); by++) {
      for (let bx = Math.floor((gun.e - 6000) / B); bx <= Math.floor((gun.e + 6000) / B); bx++) {
        if (bx < 0 || by < 0 || bx * B >= terrain.size || by * B >= terrain.size) continue;
        for (const s of terrain.spotHeights(bx, by)) {
          const d = G.distance(gun.e, gun.n, s.e, s.n);
          const az = G.azimuthMils(gun.e, gun.n, s.e, s.n);
          if (d < 1000 || d > weapon.maxRange - 600 || Math.abs(G.diffMils(az, aof)) > 750) continue;
          if (G.distance(fo.e, fo.n, s.e, s.n) < 500) continue; // keep clear of the observer
          if (!foSees(s.e, s.n)) continue;
          hilltops.push({ e: Math.round(s.e), n: Math.round(s.n), r: rand(), what: 'hilltop' });
        }
      }
    }
    hilltops.sort((a, b) => a.r - b.r);
    for (const hp of hilltops) {
      if (candidates.length >= 3) break;
      if (!candidates.some((c) => G.distance(c.e, c.n, hp.e, hp.n) < 500)) candidates.push(hp);
    }
    for (let i = 0; i < 3000 && candidates.length < 2; i++) {
      const [e, n] = G.polar(gun.e, gun.n, aof + (rand() * 2 - 1) * 600, 1500 + rand() * 2500);
      if (!inBounds(e, n, 300) || !dry(e, n, 2) || G.distance(fo.e, fo.n, e, n) < 500 || !foSees(e, n)) continue;
      if (candidates.some((c) => G.distance(c.e, c.n, e, n) < 800)) continue;
      let what = 'terrain feature';
      if (feats && feats.nearestRoad(e, n, 60)) what = 'road bend';
      else if ([0, 1600, 3200, 4800].some((az) => terrain.isWood(...G.polar(e, n, az, 50)))) what = 'wood corner';
      candidates.push({ e: Math.round(e), n: Math.round(n), what });
    }
    const knownPoints = candidates.slice(0, 3).map((c, i) => ({
      id: `AB${String(i + 1).padStart(4, '0')}`,
      kind: 'knownPoint',
      description: `Known point (${c.what})`,
      e: c.e,
      n: c.n,
    }));

    // 6. Grid-magnetic angle: magnetic north east (+) or west (−) of grid north, in mils.
    const declRand = GL.mulberry32(GL.hashSeed(String(seedInput) + '/declination'));
    const declination = (declRand() < 0.5 ? -1 : 1) * Math.round((60 + declRand() * 140) / 5) * 5;

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
      declination, // grid azimuth = magnetic azimuth + declination
    };
  }

  GL.createScenario = createScenario;
})((window.GL = window.GL || {}));
