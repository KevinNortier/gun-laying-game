// Fire missions: target generation, radio traffic, firing, impacts and scoring.
//
// Game time runs in seconds and normally follows real time; skip() jumps to the next event
// (e.g. the impact of a round in flight) so long times of flight need not be waited out.
(function (GL) {
  'use strict';

  const G = () => GL.Geo;
  const EFFECT_RADIUS = 35; // metres: a burst this close to the target is effective
  const LOST_ROUND = 1000; // metres: the observer cannot see bursts this far off
  const ROUND_INTERVAL = 4; // seconds between rounds of a multi-round command
  const RADIO_GAP = 1.6; // seconds between radio transmissions
  const SPLASH_WARNING = 5; // "splash" is sent this many seconds before impact
  const MUZZLE_HEIGHT = 1; // metres above ground
  const TREE_HEIGHT = 15;
  const EYE_HEIGHT = 2;

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

  function compass(az) {
    const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    return names[Math.round(G().normMils(az) / 800) % 8];
  }

  function roundTo(v, step) {
    return Math.round(v / step) * step;
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

    // ---- missions -------------------------------------------------------------

    _generateTarget(maxVI) {
      const { terrain, scenario } = this;
      const g = G();
      const { gun, observer: fo, weapon } = scenario;
      const h = (e, n) => terrain.height(e, n);
      const surface = (e, n) => {
        const z = h(e, n);
        return terrain.isWood(e, n, z) ? z + TREE_HEIGHT : z;
      };
      const gunAlt = h(gun.e, gun.n);
      const foEye = h(fo.e, fo.n) + EYE_HEIGHT;
      // If the terrain offers nothing near the mortar's altitude, relax the height limit in steps.
      const tiers = [maxVI, maxVI * 2, maxVI * 3.5, maxVI * 6];
      for (let tries = 0; tries < 4000; tries++) {
        const vi = tiers[Math.floor(tries / 1000)];
        const az = scenario.azimuthOfFire + (this.rand() * 2 - 1) * 720;
        const d = 600 + this.rand() * (weapon.maxRange - 800);
        const [e, n] = g.polar(gun.e, gun.n, az, d);
        const z = h(e, n);
        if (z <= terrain.waterLevel + 1 || Math.abs(z - gunAlt) > vi) continue;
        if (e < 500 || n < 500 || e > terrain.size - 500 || n > terrain.size - 500) continue;
        const dFo = g.distance(fo.e, fo.n, e, n);
        if (dFo < 300 || dFo > 4000) continue;
        if (!g.lineOfSight(surface, fo.e, fo.n, foEye, e, n, z + EYE_HEIGHT)) continue;
        return { e, n };
      }
      return null;
    }

    start() {
      if (this.state !== 'idle' && this.state !== 'complete') return;
      const pos = this._generateTarget(10);
      if (!pos) {
        this.radio.push({ t: this.time, from: 'SYS', text: 'No suitable target found on this map. Try a new map.' });
        this._changed();
        return;
      }
      this.missionCount++;
      const type = TARGET_TYPES[Math.floor(this.rand() * TARGET_TYPES.length)];
      const reportedGrid = GL.MGRS.format(pos.e, pos.n, 4, false);
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
        startTime: null,
        effectTime: null,
        rounds: 0,
        volleys: 0,
        firstMiss: null,
        bestMiss: Infinity,
        violations: 0,
        result: null,
      };
      this.state = 'receiving';
      const fo = this.scenario.observer.label;
      const fdc = this.scenario.gun.label;
      const sq = GL.MGRS.SQUARE_ID;
      this._say(fo, `${fdc}, this is ${fo}, adjust fire, over.`, 0.3);
      this._say(fdc, `${fo}, this is ${fdc}, adjust fire, out.`, 0.3 + RADIO_GAP);
      this._say(fo, `Grid ${sq} ${reportedGrid}, over.`, 0.3 + 2 * RADIO_GAP);
      this._say(fdc, `Grid ${sq} ${reportedGrid}, out.`, 0.3 + 3 * RADIO_GAP);
      this._say(fo, `${type.text[0].toUpperCase()}${type.text.slice(1)}, over.`, 0.3 + 4 * RADIO_GAP);
      this._say(fdc, `${type.text[0].toUpperCase()}${type.text.slice(1)}, target number ${this.mission.number}, out.`, 0.3 + 5 * RADIO_GAP);
      this._at(this.time + 0.3 + 5 * RADIO_GAP, () => {
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
      this.radio.push({ t: this.time, from: this.scenario.gun.label, text: `End of mission, target number ${this.mission.number}, out.` });
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
        this.mission.violations++;
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
      this.mission.volleys++;
      const fdc = scenario.gun.label;
      const fo = scenario.observer.label;
      const volley = [];
      let lastImpact = 0;
      for (let i = 0; i < rounds; i++) {
        const shot = this._flyRound(charge, az, elev);
        const fireAt = this.time + 0.5 + i * ROUND_INTERVAL;
        shot.fireAt = fireAt;
        shot.impactAt = fireAt + shot.tof;
        volley.push(shot);
        lastImpact = Math.max(lastImpact, shot.impactAt);
        this._at(fireAt, () => {
          this.mission.rounds++;
        });
        this._at(shot.impactAt, () => {
          shot.roundNo = this.impacts.length + 1;
          this.impacts.push(shot);
          if (this.listener.onImpact) this.listener.onImpact(shot);
        });
      }
      const first = volley[0];
      this._say(fdc, `Shot, over.`, 0.5);
      this._say(fo, `Shot, out.`, 0.5 + RADIO_GAP);
      if (first.tof > SPLASH_WARNING + 2 * RADIO_GAP) {
        this._at(first.impactAt - SPLASH_WARNING, () => {
          this.radio.push({ t: this.time, from: fdc, text: 'Splash, over.' });
          this._say(fo, 'Splash, out.', RADIO_GAP * 0.6);
          if (this.listener.onRadio) this.listener.onRadio();
        });
      }
      this._at(lastImpact + 2.5, () => this._observe(volley));
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
          const m = (lo + hi) / 2;
          if (above(lerp(m)) > 0) lo = m;
          else hi = m;
        }
        const [e, n] = toWorld(lerp(hi));
        return { e, n, tof: (i - 1 + hi) * dt, charge, elev, az, maxOrd: res.maxOrd };
      }
      const [e, n] = toWorld(tr[tr.length - 1]);
      return { e, n, tof: res.tof, charge, elev, az, maxOrd: res.maxOrd };
    }

    _observe(volley) {
      const m = this.mission;
      const g = G();
      const fo = this.scenario.observer.label;
      const t = m.target;
      let best = null;
      for (const s of volley) {
        s.miss = g.distance(s.e, s.n, t.e, t.n);
        if (!best || s.miss < best.miss) best = s;
      }
      if (m.firstMiss === null) m.firstMiss = volley[0].miss;
      m.bestMiss = Math.min(m.bestMiss, best.miss);

      if (best.miss <= EFFECT_RADIUS) {
        m.result = 'effective';
        m.effectTime = this.time;
        const cas = 2 + Math.floor(this.rand() * 6);
        this._say(fo, `Target effective. End of mission, target number ${m.number}. ` +
          `Estimate ${cas} casualties, enemy dispersing, over.`, 0);
        this._say(this.scenario.gun.label, `End of mission, target number ${m.number}, out.`, RADIO_GAP);
        this._at(this.time + RADIO_GAP, () => this._finish());
        return;
      }

      if (best.miss > LOST_ROUND) {
        this._say(fo, 'Lost round. Did not observe, over.', 0);
      } else {
        const dir = compass(g.azimuthMils(t.e, t.n, best.e, best.n));
        const dist = roundTo(best.miss, best.miss > 200 ? 50 : 10);
        this._say(fo, `Observed burst approximately ${dist} metres ${dir} of the target, over.`, 0);
      }
      this._at(this.time + 0.5, () => {
        this.state = 'ready';
      });
    }

    _finish() {
      const m = this.mission;
      this.state = 'complete';
      m.endTime = this.time;
      const time = m.startTime === null ? 0 : (m.effectTime || this.time) - m.startTime;
      const s = {
        effective: m.result === 'effective',
        time,
        rounds: m.rounds,
        firstMiss: m.firstMiss,
        violations: m.violations,
      };
      if (s.effective) {
        s.accuracy = Math.max(0, Math.round(400 - 2 * Math.max(0, m.firstMiss - EFFECT_RADIUS)));
        s.economy = Math.max(0, 300 - 60 * (m.rounds - 1));
        s.speed = Math.max(0, Math.round(300 - 2 * Math.max(0, time - 90)));
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
