// MGRS grid references inside the game's single 100 km square.
// The map is treated as a flat grid (no real geodesy); eastings/northings are metres 0..99999.
(function (GL) {
  'use strict';

  const GZD = '33U'; // grid zone designator (fictional theatre)
  const SQUARE_ID = 'VP'; // 100 km square identifier

  function pad(v, len) {
    return String(v).padStart(len, '0');
  }

  // digits = digits per axis: 2 (1 km), 3 (100 m), 4 (10 m), 5 (1 m).
  // MGRS truncates rather than rounds: a reference names the cell the point lies in.
  function format(e, n, digits = 5, withPrefix = true) {
    const unit = Math.pow(10, 5 - digits);
    const ee = Math.floor(Math.min(Math.max(e, 0), 99999.999) / unit);
    const nn = Math.floor(Math.min(Math.max(n, 0), 99999.999) / unit);
    const body = pad(ee, digits) + ' ' + pad(nn, digits);
    return withPrefix ? `${GZD} ${SQUARE_ID} ${body}` : body;
  }

  // Accepts e.g. "3846 7219", "38467219", "VP 384 721", "33U VP 38462 72190".
  // Returns { e, n, digits, precision } (centre of the referenced cell) or { error }.
  function parse(input) {
    const s = String(input).toUpperCase().trim();
    const m = s.match(/^(?:(\d{1,2}[C-HJ-NP-X])\s*)?(?:([A-HJ-NP-Z]{2})\s*)?([\d\s]+)$/);
    if (!m) return { error: 'Not a valid grid reference' };
    if (m[1] && m[1] !== GZD) return { error: `Grid zone ${m[1]} is not on this map (${GZD})` };
    if (m[2] && m[2] !== SQUARE_ID) return { error: `Square ${m[2]} is not on this map (${SQUARE_ID})` };

    const parts = m[3].trim().split(/\s+/);
    let es;
    let ns;
    if (parts.length === 2) {
      [es, ns] = parts;
      if (es.length !== ns.length) return { error: 'Easting and northing must have the same number of digits' };
    } else if (parts.length === 1) {
      const d = parts[0];
      if (d.length % 2) return { error: 'A grid reference needs an even number of digits' };
      es = d.slice(0, d.length / 2);
      ns = d.slice(d.length / 2);
    } else {
      return { error: 'Not a valid grid reference' };
    }
    const digits = es.length;
    if (digits < 1 || digits > 5) return { error: 'Use 2 to 10 digits' };
    const unit = Math.pow(10, 5 - digits);
    return {
      e: parseInt(es, 10) * unit + unit / 2,
      n: parseInt(ns, 10) * unit + unit / 2,
      digits,
      precision: unit,
    };
  }

  GL.MGRS = { GZD, SQUARE_ID, format, parse };
})((window.GL = window.GL || {}));
