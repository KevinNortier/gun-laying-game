// Flat-grid geometry helpers. Angles are NATO mils (6400 per circle), measured
// clockwise from grid north. Positions are metres (easting e, northing n).
(function (GL) {
  'use strict';

  const MILS = 6400;
  const RAD_PER_MIL = (2 * Math.PI) / MILS;

  function normMils(a) {
    return ((a % MILS) + MILS) % MILS;
  }

  // Signed difference a - b, in (-3200, 3200].
  function diffMils(a, b) {
    let d = normMils(a - b);
    if (d > MILS / 2) d -= MILS;
    return d;
  }

  function azimuthMils(e1, n1, e2, n2) {
    return normMils(Math.atan2(e2 - e1, n2 - n1) / RAD_PER_MIL);
  }

  function distance(e1, n1, e2, n2) {
    return Math.hypot(e2 - e1, n2 - n1);
  }

  // Point at azimuth az (mils) and distance d from (e, n).
  function polar(e, n, az, d) {
    const r = az * RAD_PER_MIL;
    return [e + d * Math.sin(r), n + d * Math.cos(r)];
  }

  // Canvas angle (radians, 0 = +x, clockwise because y points down) for a grid azimuth.
  function canvasAngle(az) {
    return az * RAD_PER_MIL - Math.PI / 2;
  }

  // Formats mils as four digits, e.g. 0800.
  function fmtMils(a) {
    return String(Math.round(normMils(a)) % MILS).padStart(4, '0');
  }

  // True if nothing along the line rises above the sight line.
  // surfaceFn(e, n) should include obstacles such as tree canopy.
  // z1, z2 are absolute heights of the eye and the target.
  function lineOfSight(surfaceFn, e1, n1, z1, e2, n2, z2, step = 20) {
    const steps = Math.max(1, Math.ceil(distance(e1, n1, e2, n2) / step));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (surfaceFn(e1 + t * (e2 - e1), n1 + t * (n2 - n1)) > z1 + t * (z2 - z1)) return false;
    }
    return true;
  }

  GL.Geo = {
    MILS,
    RAD_PER_MIL,
    normMils,
    diffMils,
    azimuthMils,
    distance,
    polar,
    canvasAngle,
    fmtMils,
    lineOfSight,
  };
})((window.GL = window.GL || {}));
