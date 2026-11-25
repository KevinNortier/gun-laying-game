// Point-mass exterior ballistics for fin-stabilised mortar bombs (no spin drift).
//
// Frame: x downrange along the line of fire, y up (relative to the weapon), z to the right.
// Atmosphere: ICAO standard lapse rate, with standard sea-level values *at the weapon*
// (the "met datum" is the firing position), so standard conditions reproduce the firing
// tables exactly regardless of where on the map the weapon stands.
//
// Conditions (all optional, 0 = standard):
//   windRange   m/s, + = tail wind (blowing towards the target)
//   windCross   m/s, + = blowing from left to right
//   airTempDev  °C deviation from standard air temperature
//   densityDev  % deviation from standard air density
//   propTempDev °C deviation from standard propellant temperature (21 °C)
//   targetHeight m, target altitude minus weapon altitude
(function (GL) {
  'use strict';

  const G0 = 9.80665;
  const T0 = 288.15; // K
  const RHO0 = 1.225; // kg/m3
  const LAPSE = 0.0065; // K/m
  const RHO_EXP = 4.2559; // (g / (R * L)) - 1
  const GAMMA_R = 1.4 * 287.05;

  function makeCd(table) {
    return function cd(mach) {
      if (mach <= table[0][0]) return table[0][1];
      for (let i = 1; i < table.length; i++) {
        if (mach <= table[i][0]) {
          const [m0, c0] = table[i - 1];
          const [m1, c1] = table[i];
          return c0 + ((c1 - c0) * (mach - m0)) / (m1 - m0);
        }
      }
      return table[table.length - 1][1];
    };
  }

  const cdCache = new WeakMap();
  function cdFor(weapon) {
    let f = cdCache.get(weapon);
    if (!f) {
      f = makeCd(weapon.cd);
      cdCache.set(weapon, f);
    }
    return f;
  }

  function muzzleVelocity(weapon, charge, cond) {
    const ch = weapon.charges[charge];
    return ch.mv * (1 + ((cond && cond.propTempDev) || 0) * weapon.propTempCoeff);
  }

  // Flies one round. Returns { range, cross, tof, maxOrd, impactAngle, impactVel } or null if
  // the trajectory never reaches targetHeight on the way down.
  // opts.trace = true also returns the sampled path as [[x, y, z], ...].
  function simulate(weapon, charge, elevMils, cond = {}, opts = {}) {
    const cd = cdFor(weapon);
    const dt = opts.dt || 0.05;
    const mv = muzzleVelocity(weapon, charge, cond);
    const th = elevMils * GL.Geo.RAD_PER_MIL;
    const wx = cond.windRange || 0;
    const wz = cond.windCross || 0;
    const densF = 1 + (cond.densityDev || 0) / 100;
    const dT = cond.airTempDev || 0;
    const targetY = cond.targetHeight || 0;
    const kA = (0.5 * Math.PI * weapon.diameter * weapon.diameter) / 4 / weapon.mass;

    const a = [0, 0, 0];
    function acc(y, vx, vy, vz) {
      const T = T0 - LAPSE * Math.max(y, -2000);
      const rho = RHO0 * densF * Math.pow(T / T0, RHO_EXP);
      const ux = vx - wx;
      const uz = vz - wz;
      const va = Math.sqrt(ux * ux + vy * vy + uz * uz);
      const mach = va / Math.sqrt(GAMMA_R * (T + dT));
      const k = kA * rho * cd(mach) * va;
      a[0] = -k * ux;
      a[1] = -k * vy - G0;
      a[2] = -k * uz;
    }

    let x = 0, y = 0, z = 0;
    let vx = mv * Math.cos(th), vy = mv * Math.sin(th), vz = 0;
    let t = 0;
    let maxY = 0;
    const trace = opts.trace ? [[0, 0, 0]] : null;

    for (let i = 0; i < 20000; i++) {
      const px = x, py = y, pz = z, pvx = vx, pvy = vy, pvz = vz;

      // RK4
      acc(y, vx, vy, vz);
      const k1x = vx, k1y = vy, k1z = vz, k1vx = a[0], k1vy = a[1], k1vz = a[2];
      acc(y + 0.5 * dt * k1y, vx + 0.5 * dt * k1vx, vy + 0.5 * dt * k1vy, vz + 0.5 * dt * k1vz);
      const k2x = vx + 0.5 * dt * k1vx, k2y = vy + 0.5 * dt * k1vy, k2z = vz + 0.5 * dt * k1vz;
      const k2vx = a[0], k2vy = a[1], k2vz = a[2];
      acc(y + 0.5 * dt * k2y, vx + 0.5 * dt * k2vx, vy + 0.5 * dt * k2vy, vz + 0.5 * dt * k2vz);
      const k3x = vx + 0.5 * dt * k2vx, k3y = vy + 0.5 * dt * k2vy, k3z = vz + 0.5 * dt * k2vz;
      const k3vx = a[0], k3vy = a[1], k3vz = a[2];
      acc(y + dt * k3y, vx + dt * k3vx, vy + dt * k3vy, vz + dt * k3vz);
      const k4x = vx + dt * k3vx, k4y = vy + dt * k3vy, k4z = vz + dt * k3vz;
      const k4vx = a[0], k4vy = a[1], k4vz = a[2];

      x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
      y += (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
      z += (dt / 6) * (k1z + 2 * k2z + 2 * k3z + k4z);
      vx += (dt / 6) * (k1vx + 2 * k2vx + 2 * k3vx + k4vx);
      vy += (dt / 6) * (k1vy + 2 * k2vy + 2 * k3vy + k4vy);
      vz += (dt / 6) * (k1vz + 2 * k2vz + 2 * k3vz + k4vz);
      t += dt;
      if (y > maxY) maxY = y;
      if (trace) trace.push([x, y, z]);

      if (vy < 0 && y <= targetY) {
        if (maxY < targetY) return null; // never got that high
        const f = (py - targetY) / (py - y);
        const ivx = pvx + f * (vx - pvx);
        const ivy = pvy + f * (vy - pvy);
        const ivz = pvz + f * (vz - pvz);
        return {
          range: px + f * (x - px),
          cross: pz + f * (z - pz),
          tof: t - dt + f * dt,
          maxOrd: maxY,
          impactAngle: Math.atan2(-ivy, Math.hypot(ivx, ivz)) / GL.Geo.RAD_PER_MIL, // mils below horizontal
          impactVel: Math.sqrt(ivx * ivx + ivy * ivy + ivz * ivz),
          trace,
        };
      }
    }
    return null;
  }

  GL.Ballistics = { simulate, muzzleVelocity };
})((window.GL = window.GL || {}));
