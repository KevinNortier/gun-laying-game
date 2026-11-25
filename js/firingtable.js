// Tabular firing tables, generated from the ballistic model under standard conditions.
// One table per charge, one row per 50 m of range. Correction columns are the *effect* of a
// unit change in a condition (the FDC applies the opposite to compensate).
(function (GL) {
  'use strict';

  const RANGE_STEP = 50;
  const SAMPLE_STEP = 4; // mils between coarse samples
  const cache = new WeakMap(); // weapon -> array of tables by charge

  function generate(weapon, charge) {
    const B = GL.Ballistics;
    const sim = (e, cond) => B.simulate(weapon, charge, e, cond || {});

    // Coarse samples from max to min elevation: range increases as elevation decreases.
    const samples = [];
    for (let e = weapon.maxElev; e > weapon.minElev; e -= SAMPLE_STEP) samples.push({ e, r: sim(e).range });
    samples.push({ e: weapon.minElev, r: sim(weapon.minElev).range });
    const rMin = samples[0].r;
    const rMax = samples[samples.length - 1].r;

    // Elevation that gives range R: interpolate the samples, then refine with Newton steps.
    function elevationFor(R) {
      let i = 1;
      while (i < samples.length - 1 && samples[i].r < R) i++;
      const a = samples[i - 1];
      const b = samples[i];
      let e = a.e + ((R - a.r) * (b.e - a.e)) / (b.r - a.r);
      for (let iter = 0; iter < 6; iter++) {
        const r0 = sim(e).range;
        const err = r0 - R;
        if (Math.abs(err) < 0.02) break;
        const slope = sim(e + 0.5).range - r0; // metres per half mil (negative)
        e -= (err / slope) * 0.5;
      }
      return e;
    }

    const rows = [];
    for (let R = Math.ceil(rMin / RANGE_STEP) * RANGE_STEP; R <= rMax; R += RANGE_STEP) {
      const e = elevationFor(R);
      const base = sim(e);
      const perMil = base.range - sim(e + 1).range; // metres of range per mil
      const effect = (cond, unit) => (sim(e, cond).range - base.range) / unit;
      const crossM = sim(e, { windCross: 5 }).cross / 5;
      rows.push({
        range: R,
        elev: e,
        dElev100: 100 / perMil,
        tof: base.tof,
        maxOrd: base.maxOrd,
        vi10: effect({ targetHeight: 10 }, 1),
        headWind: effect({ windRange: -5 }, 5),
        tailWind: effect({ windRange: 5 }, 5),
        crossWind: Math.atan2(crossM, R) / GL.Geo.RAD_PER_MIL,
        airTemp: effect({ airTempDev: 10 }, 10),
        density: effect({ densityDev: 5 }, 5),
        propTemp: effect({ propTempDev: 10 }, 10),
      });
    }

    return {
      weapon,
      charge,
      mv: weapon.charges[charge].mv,
      minRange: rMin,
      maxRange: rMax,
      rows,
    };
  }

  function getTable(weapon, charge) {
    let tables = cache.get(weapon);
    if (!tables) {
      tables = [];
      cache.set(weapon, tables);
    }
    if (!tables[charge]) tables[charge] = generate(weapon, charge);
    return tables[charge];
  }

  // Linear interpolation of a column at range R (clamped to the table).
  function interp(table, R, key) {
    const rows = table.rows;
    if (R <= rows[0].range) return rows[0][key];
    if (R >= rows[rows.length - 1].range) return rows[rows.length - 1][key];
    let i = 1;
    while (rows[i].range < R) i++;
    const a = rows[i - 1];
    const b = rows[i];
    return a[key] + ((R - a.range) / (b.range - a.range)) * (b[key] - a[key]);
  }

  const STANDARD_CONDITIONS = [
    'Air temperature 15 °C and density 1.225 kg/m³ (100 %) at the mortar position',
    'Propellant temperature 21 °C',
    'No wind',
    'Target at the same altitude as the mortar',
  ];

  GL.FiringTables = { getTable, interp, RANGE_STEP, STANDARD_CONDITIONS };
})((window.GL = window.GL || {}));
