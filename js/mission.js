// Fire missions: target generation, radio traffic, firing, impacts, observer adjustment and scoring.
//
// Game time runs in seconds and normally follows real time; skip() jumps to the next event
// (e.g. the impact of a round in flight) so long times of flight need not be waited out.
//
// Adjustment follows successive bracketing: the observer sends corrections along the
// observer-target (OT) line, establishes a range bracket (400/200/100 m), splits it, and calls
// fire for effect when the 100 m bracket is split or the range is correct.
(function (GL) {
  'use strict';

  const G = () => GL.Geo;
  const EFFECT_RADIUS = 35; // metres: a burst this close to the target is effective
  const LOST_ROUND = 1000; // metres: the observer cannot place bursts further off than this
  const ROUND_INTERVAL = 4; // seconds between rounds of a multi-round command
  const RADIO_GAP = 1.6; // seconds between radio transmissions
  const SPLASH_WARNING = 5; // "splash" is sent this many seconds before impact
  const MUZZLE_HEIGHT = 1; // metres above ground
  const TREE_HEIGHT = 15;
  const EYE_HEIGHT = 2;
  const SMOKE_HEIGHT = 20; // a burst's smoke is visible this far above the ground

  // Observer errors.
  const LOCATION_ERROR = [60, 250]; // metres, initial target location error (uniform)
  const DIRECTION_SIGMA = 5; // mils, compass error of the OT direction
  const LATERAL_SIGMA = 2; // mils, error measuring lateral deviation with binoculars
  const RANGE_EST_SIGMA = 0.25; // fractional error estimating range deviation

  // Dispersion (one standard deviation), loosely modelled on mortar probable errors.
  const MV_SIGMA = 0.0025; // fraction of muzzle velocity
  const AZ_SIGMA = 1.5; // mils

  const TARGET_TYPES = [
    { icon: 'infantry', echelon: 'section', text: 'infantry section in the open' },
    { icon: 'infantry', echelon: 'platoon', text: 'infantry platoon in the open' },
    { icon: 'infantry', echelon: 'platoon', text: 'infantry platoon digging in' },
    { icon: 'mechinf', echelon: 'platoon', text: 'mechanized infantry platoon, stationary' },
    { icon: 'recon', echelon: 'section', text: 'reconnaissance section, two vehicles' },
    { icon: 'antitank', echelon: 'section', text: 'anti-tank team in position' },
    { icon: 'mortar', echelon: 'section', text: 'mortar section firing' },
  ];

  function gaussian(rand) {
    let u = 0;
    while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  }

  function roundTo(v, step) {
    return Math.round(v / step) * step;
  }

  function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
  }

  class MissionManager {
    constructor(terrain, scenario, listener) {
      this.terrain = terrain;
      this.scenario = scenario;
      this.listener = listener || {};
      this.rand = GL.mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);
      this.time = 0;
      this.events = [];
      this.radio = [];
      this.impacts = [];
      this.mission = null;
      this.missionCount = 0;
      this.state = 'idle'; // idle | receiving | ready | firing | complete
      this._last = performance.now();
      this._timer = setInterval(() => this.tick(), 100);
    }

    destroy() {
      clearInterval(this._timer);
    }

    // ---- clock and events ---------------------------------------------------

    tick() {
      const now = performance.now();
      this.time += (now - this._last) / 1000;
      this._last = now;
      this._runDue();
      if (this.listener.onTick) this.listener.onTick();
    }

    _runDue() {
      let changed = false;
      while (this.events.length && this.events[0].t <= this.time) {
        const ev = this.events.shift();
        ev.fn();
        changed = true;
      }
      if (changed) this._changed();
    }

    _at(t, fn) {
      this.events.push({ t, fn });
      this.events.sort((a, b) => a.t - b.t);
    }

    nextEventIn() {
      return this.events.length ? Math.max(0, this.events[0].t - this.time) : null;
    }

    // Jump the clock to the next scheduled event.
    skip() {
      if (!this.events.length) return;
      this.time = Math.max(this.time, this.events[0].t);
      this._runDue();
    }

    _changed() {
      if (this.listener.onChange) this.listener.onChange();
    }

    _say(from, text, delay = 0) {
      this._at(this.time + delay, () => {
        this.radio.push({ t: this.time, from, text });
        if (this.listener.onRadio) this.listener.onRadio();
      });
    }

    get fdc() {
      return this.scenario.gun.label;
    }

    get fo() {
      return this.scenario.observer.label;
    }

    // ---- target generation ----------------------------------------------------

    _surface(e, n) {
      const z = this.terrain.height(e, n);
      return this.terrain.isWood(e, n, z) ? z + TREE_HEIGHT : z;
    }

    _foSees(e, n, aboveGround) {
      const fo = this.scenario.observer;
      const t = this.terrain;
      return G().lineOfSight(
        (x, y) => this._surface(x, y),
        fo.e, fo.n, t.height(fo.e, fo.n) + EYE_HEIGHT,
        e, n, t.height(e, n) + aboveGround
      );
    }

    _generateTarget(maxVI) {
      const { terrain, scenario } = this;
      const g = G();
      const { gun, observer: fo, weapon } = scenario;
      const gunAlt = terrain.height(gun.e, gun.n);
      // If the terrain offers nothing near the mortar's altitude, relax the height limit in steps.
      const tiers = [maxVI, maxVI * 2, maxVI * 3.5, maxVI * 6];
      for (let tries = 0; tries < 4000; tries++) {
        const vi = tiers[Math.floor(tries / 1000)];
        const az = scenario.azimuthOfFire + (this.rand() * 2 - 1) * 600;
        const d = 700 + this.rand() * (weapon.maxRange - 1000);
        const [e, n] = g.polar(gun.e, gun.n, az, d);
        const z = terrain.height(e, n);
        if (z <= terrain.waterLevel + 1 || Math.abs(z - gunAlt) > vi) continue;
        if (e < 500 || n < 500 || e > terrain.size - 500 || n > terrain.size - 500) continue;
        const dFo = g.distance(fo.e, fo.n, e, n);
        if (dFo < 400 || dFo > 4000) continue;
        if (!this._foSees(e, n, EYE_HEIGHT)) continue;
        return { e, n };
      }
      return null;
    }

    // ---- mission flow ---------------------------------------------------------

    start() {
      if (this.state !== 'idle' && this.state !== 'complete') return;
      const pos = this._generateTarget(10);
      if (!pos) {
        this.radio.push({ t: this.time, from: 'SYS', text: 'No suitable target found on this map. Try a new map.' });
        this._changed();
        return;
      }
      const g = G();
      const fo = this.scenario.observer;
      this.missionCount++;
      const type = TARGET_TYPES[Math.floor(this.rand() * TARGET_TYPES.length)];

      // The observer's estimate of the target location is off by some tens of metres.
      const errDist = LOCATION_ERROR[0] + this.rand() * (LOCATION_ERROR[1] - LOCATION_ERROR[0]);
      const [ee, en] = g.polar(pos.e, pos.n, this.rand() * 6400, errDist);
      const reportedGrid = GL.MGRS.format(ee, en, 4, false);
      // OT direction as measured with a compass, to the nearest 10 mils.
      const otDir = g.normMils(roundTo(g.azimuthMils(fo.e, fo.n, pos.e, pos.n) + gaussian(this.rand) * DIRECTION_SIGMA, 10));

      this.impacts = [];
      this.mission = {
        number: `AB${1000 + this.missionCount}`,
        type,
        target: {
          id: 'TGT',
          affiliation: 'hostile',
          icon: type.icon,
          echelon: type.echelon,
          description: type.text,
          e: pos.e,
          n: pos.n,
        },
        reportedGrid,
        locationError: errDist,
        otDir,
        directionSent: false,
        phase: 'adjust', // adjust | ffe
        adj: { step: null, lastSpot: null, bracketed: false },
        startTime: null,
        effectTime: null,
        rounds: 0,
        adjustRounds: 0,
        ffeRounds: 0,
        ffeMisses: [],
        firstMiss: null,
        violations: 0,
        result: null,
      };
      this.state = 'receiving';
      const sq = GL.MGRS.SQUARE_ID;
      const desc = capitalize(type.text);
      const t0 = 0.3;
      this._say(this.fo, `${this.fdc}, this is ${this.fo}, adjust fire, over.`, t0);
      this._say(this.fdc, `${this.fo}, this is ${this.fdc}, adjust fire, out.`, t0 + RADIO_GAP);
      this._say(this.fo, `Grid ${sq} ${reportedGrid}, over.`, t0 + 2 * RADIO_GAP);
      this._say(this.fdc, `Grid ${sq} ${reportedGrid}, out.`, t0 + 3 * RADIO_GAP);
      this._say(this.fo, `${desc}, over.`, t0 + 4 * RADIO_GAP);
      this._say(this.fdc, `${desc}, target number ${this.mission.number}, out.`, t0 + 5 * RADIO_GAP);
      this._at(this.time + t0 + 5 * RADIO_GAP, () => {
        this.state = 'ready';
        this.mission.startTime = this.time;
      });
      this._changed();
    }

    // Abandon the current mission.
    end() {
      if (!this.mission || this.state === 'complete') return;
      this.events = [];
      this.mission.result = 'abandoned';
      this._finish();
      this.radio.push({ t: this.time, from: this.fdc, text: `End of mission, target number ${this.mission.number}, out.` });
      this._changed();
    }

    // Validates and fires a command. Returns { ok } or { error }.
    fire(cmd) {
      if (this.state !== 'ready') {
        return { error: this.state === 'firing' ? 'Rounds are still in flight.' : 'No fire mission in progress.' };
      }
      const { scenario } = this;
      const g = G();
      const w = scenario.weapon;
      const m = this.mission;
      const charge = Number(cmd.charge);
      const defl = Number(cmd.deflection);
      const elev = Number(cmd.elevation);
      const rounds = Number(cmd.rounds) || 1;
      if (!Number.isInteger(charge) || !w.charges[charge]) return { error: 'Select a charge.' };
      if (!Number.isFinite(defl) || defl < 0 || defl >= 6400) return { error: 'Deflection must be 0–6399 mils.' };
      if (!Number.isFinite(elev) || elev < w.minElev || elev > w.maxElev) {
        return { error: `Elevation must be ${w.minElev}–${w.maxElev} mils.` };
      }

      const az = g.normMils(scenario.azimuthOfFire + scenario.referredDeflection - defl);
      const { left, right } = scenario.sector;
      if (g.diffMils(az, left) < 0 || g.diffMils(right, az) < 0) {
        m.violations++;
        this.radio.push({
          t: this.time,
          from: 'SYS',
          text: `CHECK FIRING. Deflection ${g.fmtMils(defl)} lays the mortar outside the sector of fire ` +
            `(L ${g.fmtMils(left)} – R ${g.fmtMils(right)}). Safety violation recorded.`,
        });
        this._changed();
        return { error: 'Outside the sector of fire — check firing.' };
      }

      this.state = 'firing';
      const phase = m.phase;
      if (phase === 'ffe') m.ffeRounds += rounds;
      else m.adjustRounds += rounds;
      const volley = [];
      let lastImpact = 0;
      for (let i = 0; i < rounds; i++) {
        const shot = this._flyRound(charge, az, elev);
        const fireAt = this.time + 0.5 + i * ROUND_INTERVAL;
        shot.fireAt = fireAt;
        shot.impactAt = fireAt + shot.tof;
        shot.phase = phase;
        volley.push(shot);
        lastImpact = Math.max(lastImpact, shot.impactAt);
        this._at(fireAt, () => {
          m.rounds++;
        });
        this._at(shot.impactAt, () => {
          shot.roundNo = this.impacts.length + 1;
          this.impacts.push(shot);
          if (this.listener.onImpact) this.listener.onImpact(shot);
        });
      }
      const first = volley[0];
      const count = rounds > 1 ? `${rounds} rounds, ` : '';
      this._say(this.fdc, `${count}shot, over.`.replace(/^./, (c) => c.toUpperCase()), 0.5);
      this._say(this.fo, `Shot, out.`, 0.5 + RADIO_GAP);
      if (first.tof > SPLASH_WARNING + 2 * RADIO_GAP) {
        this._at(first.impactAt - SPLASH_WARNING, () => {
          this.radio.push({ t: this.time, from: this.fdc, text: 'Splash, over.' });
          this._say(this.fo, 'Splash, out.', RADIO_GAP * 0.6);
          if (this.listener.onRadio) this.listener.onRadio();
        });
      }
      this._at(lastImpact + 2.5, () => this._observe(volley, phase));
      this._changed();
      return { ok: true, tof: first.tof };
    }

    // Simulates one round with dispersion and finds where it meets the ground.
    _flyRound(charge, az, elev) {
      const { terrain, scenario } = this;
      const g = G();
      const gun = scenario.gun;
      const gunAlt = terrain.height(gun.e, gun.n) + MUZZLE_HEIGHT;
      const azR = g.normMils(az + gaussian(this.rand) * AZ_SIGMA);
      const cond = { mvDev: gaussian(this.rand) * MV_SIGMA, targetHeight: -800 };
      const res = GL.Ballistics.simulate(scenario.weapon, charge, elev, cond, { trace: true });
      const r = azR * g.RAD_PER_MIL;
      const sin = Math.sin(r);
      const cos = Math.cos(r);
      const toWorld = (p) => [gun.e + p[0] * sin + p[2] * cos, gun.n + p[0] * cos - p[2] * sin, gunAlt + p[1]];
      const above = (p) => {
        const [e, n, z] = toWorld(p);
        return z - terrain.height(e, n);
      };
      const tr = res.trace;
      const dt = 0.05;
      for (let i = 1; i < tr.length; i++) {
        if (above(tr[i]) > 0) continue;
        // Bisect between the last point above ground and this one.
        let lo = 0;
        let hi = 1;
        const a = tr[i - 1];
        const b = tr[i];
        const lerp = (f) => [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2;
          if (above(lerp(mid)) > 0) lo = mid;
          else hi = mid;
        }
        const [e, n] = toWorld(lerp(hi));
        return { e, n, tof: (i - 1 + hi) * dt, charge, elev, az, maxOrd: res.maxOrd };
      }
      const [e, n] = toWorld(tr[tr.length - 1]);
      return { e, n, tof: res.tof, charge, elev, az, maxOrd: res.maxOrd };
    }

    // ---- observer -------------------------------------------------------------

    // Deviation of a point from the target in the observer's OT frame (as the observer judges it).
    _otDeviation(e, n) {
      const g = G();
      const m = this.mission;
      const fo = this.scenario.observer;
      const t = m.target;
      const r = m.otDir * g.RAD_PER_MIL;
      const de = e - t.e;
      const dn = n - t.n;
      const range = de * Math.sin(r) + dn * Math.cos(r); // + beyond the target (over)
      const lateral = de * Math.cos(r) - dn * Math.sin(r); // + right of the target
      const otDist = g.distance(fo.e, fo.n, t.e, t.n);
      return {
        range: range * (1 + gaussian(this.rand) * RANGE_EST_SIGMA),
        lateral: lateral + (gaussian(this.rand) * LATERAL_SIGMA * otDist) / 1000,
      };
    }

    _observe(volley, phase) {
      const m = this.mission;
      const g = G();
      const t = m.target;
      for (const s of volley) s.miss = g.distance(s.e, s.n, t.e, t.n);
      if (m.firstMiss === null) m.firstMiss = volley[0].miss;

      if (phase === 'ffe') {
        for (const s of volley) m.ffeMisses.push(s.miss);
        const hits = volley.filter((s) => s.miss <= EFFECT_RADIUS).length;
        if (hits > 0) {
          m.result = 'effective';
          m.effectTime = this.time;
          const cas = Math.min(12, hits * 2 + Math.floor(this.rand() * 4));
          this._say(this.fo, `End of mission, target number ${m.number}. Estimate ${cas} casualties, ` +
            `target ${hits >= 2 ? 'neutralized' : 'suppressed'}, over.`, 0);
          this._say(this.fdc, `End of mission, target number ${m.number}, out.`, RADIO_GAP);
          this._at(this.time + RADIO_GAP, () => this._finish());
          return;
        }
      }

      // Centre of the visible bursts.
      const seen = volley.filter((s) => s.miss <= LOST_ROUND && this._foSees(s.e, s.n, SMOKE_HEIGHT));
      if (!seen.length) {
        this._say(this.fo, 'Lost, repeat, over.', 0);
        this._say(this.fdc, 'Lost, repeat, out.', RADIO_GAP);
        this._at(this.time + RADIO_GAP + 0.5, () => {
          this.state = 'ready';
        });
        return;
      }
      const ce = seen.reduce((a, s) => a + s.e, 0) / seen.length;
      const cn = seen.reduce((a, s) => a + s.n, 0) / seen.length;
      const dev = this._otDeviation(ce, cn);

      const parts = [];
      if (!m.directionSent) {
        parts.push(`direction ${g.fmtMils(m.otDir)}`);
        m.directionSent = true;
      }
      const lat = roundTo(-dev.lateral, 10);
      if (lat !== 0) parts.push(`${lat > 0 ? 'right' : 'left'} ${Math.abs(lat)}`);

      let rangeCorr;
      let callFFE = false;
      if (phase === 'ffe') {
        // Refining fire for effect: small corrections to the nearest 10 m, then repeat.
        rangeCorr = roundTo(-dev.range, 10);
        if (rangeCorr !== 0) parts.push(`${rangeCorr > 0 ? 'add' : 'drop'} ${Math.abs(rangeCorr)}`);
        parts.push('repeat');
      } else {
        ({ rangeCorr, callFFE } = this._bracket(dev.range));
        if (rangeCorr !== 0) parts.push(`${rangeCorr > 0 ? 'add' : 'drop'} ${Math.abs(rangeCorr)}`);
        if (callFFE) {
          parts.push('fire for effect');
          m.phase = 'ffe';
        }
      }
      const msg = capitalize(parts.join(', '));
      this._say(this.fo, `${msg}, over.`, 0);
      this._say(this.fdc, `${msg}, out.`, RADIO_GAP);
      this._at(this.time + RADIO_GAP + 0.5, () => {
        this.state = 'ready';
      });
    }

    // Successive bracketing on the OT line. Returns the range correction and whether to fire for effect.
    _bracket(rangeDev) {
      const adj = this.mission.adj;
      const est = Math.abs(rangeDev);
      if (est <= 25) return { rangeCorr: 0, callFFE: true }; // range correct
      const spot = rangeDev > 0 ? 'over' : 'short';
      let step;
      if (adj.step === null || est > 2 * adj.step + 50) {
        // First spotting (or the round went somewhere unexpected): bracket the target.
        adj.bracketed = false;
        if (est <= 60) step = 50;
        else step = [100, 200, 400, 800].find((s) => s >= est) || 800;
      } else if (spot !== adj.lastSpot || adj.bracketed) {
        // Bracket established, or already bracketed: split it.
        adj.bracketed = true;
        step = Math.max(50, adj.step / 2);
      } else {
        // Same side, no bracket yet: same correction again.
        step = adj.step;
      }
      adj.step = step;
      adj.lastSpot = spot;
      return { rangeCorr: spot === 'over' ? -step : step, callFFE: step <= 50 };
    }

    _finish() {
      const m = this.mission;
      this.state = 'complete';
      m.endTime = this.time;
      const time = m.startTime === null ? 0 : (m.effectTime || this.time) - m.startTime;
      const meanFFE = m.ffeMisses.length ? m.ffeMisses.reduce((a, b) => a + b, 0) / m.ffeMisses.length : null;
      const s = {
        effective: m.result === 'effective',
        time,
        rounds: m.rounds,
        adjustRounds: m.adjustRounds,
        ffeRounds: m.ffeRounds,
        firstMiss: m.firstMiss,
        meanFFE,
        violations: m.violations,
      };
      if (s.effective) {
        s.accuracy = Math.max(0, Math.round(400 - 5 * Math.max(0, meanFFE - 20)));
        s.economy = Math.max(0, 300 - 40 * Math.max(0, m.adjustRounds - 2) - 30 * Math.max(0, m.ffeRounds - 4));
        s.speed = Math.max(0, Math.round(300 - 1.5 * Math.max(0, time - 180)));
      } else {
        s.accuracy = 0;
        s.economy = 0;
        s.speed = 0;
      }
      s.penalty = 200 * m.violations;
      s.total = Math.max(0, s.accuracy + s.economy + s.speed - s.penalty);
      m.score = s;
      this._changed();
    }
  }

  GL.MissionManager = MissionManager;
  GL.MISSION_EFFECT_RADIUS = EFFECT_RADIUS;
})((window.GL = window.GL || {}));
