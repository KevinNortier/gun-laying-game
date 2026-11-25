// NATO (APP-6 / MIL-STD-2525 style) land unit symbols and fire support graphics, drawn on canvas.
//
// Sizes are in device pixels. `s` is the height of a friendly frame; other frames are sized
// relative to it, as in APP-6 (hostile diamond and unknown quatrefoil are larger).
(function (GL) {
  'use strict';

  const FILL = {
    friend: '#80e0ff',
    hostile: '#ff8080',
    neutral: '#aaffaa',
    unknown: '#ffff80',
  };

  // Frame extents (in units of s) and the box that "corner to corner" icons such as the
  // infantry X span. k scales the small central icons to fit the frame.
  const GEOMETRY = {
    friend: { top: -0.5, bottom: 0.5, left: -0.75, right: 0.75, hx: 0.75, hy: 0.5, k: 1 },
    hostile: { top: -0.72, bottom: 0.72, left: -0.72, right: 0.72, hx: 0.36, hy: 0.36, k: 0.8 },
    neutral: { top: -0.55, bottom: 0.55, left: -0.55, right: 0.55, hx: 0.55, hy: 0.55, k: 0.85 },
    unknown: { top: -0.67, bottom: 0.67, left: -0.67, right: 0.67, hx: 0.318, hy: 0.318, k: 0.8 },
  };

  // Quatrefoil: four circular lobes of radius R centred D from the middle.
  const QF_D = 0.35;
  const QF_R = 0.32;
  const QF_DELTA = (() => {
    // Outer intersection of the top and right lobes lies on the diagonal.
    const t = (Math.SQRT2 * QF_D + Math.sqrt(2 * QF_D * QF_D - 4 * (QF_D * QF_D - QF_R * QF_R))) / 2;
    const px = t / Math.SQRT2;
    const py = -t / Math.SQRT2;
    return Math.atan2(py + QF_D, px); // angle of that point seen from the top lobe's centre
  })();

  function framePath(ctx, affiliation, s) {
    ctx.beginPath();
    switch (affiliation) {
      case 'friend':
        ctx.rect(-0.75 * s, -0.5 * s, 1.5 * s, s);
        break;
      case 'hostile': {
        const r = 0.72 * s;
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        break;
      }
      case 'neutral':
        ctx.rect(-0.55 * s, -0.55 * s, 1.1 * s, 1.1 * s);
        break;
      default: {
        const d = QF_D * s;
        const r = QF_R * s;
        for (let q = 0; q < 4; q++) {
          const rot = (q * Math.PI) / 2;
          ctx.arc(d * Math.sin(rot), -d * Math.cos(rot), r, Math.PI - QF_DELTA + rot, 2 * Math.PI + QF_DELTA + rot);
        }
        ctx.closePath();
      }
    }
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }

  function pill(ctx, hw, hh) {
    ctx.moveTo(-hw + hh, -hh);
    ctx.lineTo(hw - hh, -hh);
    ctx.arc(hw - hh, 0, hh, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-hw + hh, hh);
    ctx.arc(-hw + hh, 0, hh, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.closePath();
  }

  // Unit function icons, drawn in black inside the frame.
  function drawIcon(ctx, icon, s, g) {
    const hx = g.hx * s;
    const hy = g.hy * s;
    const k = g.k * s;
    ctx.beginPath();
    switch (icon) {
      case 'infantry':
        line(ctx, -hx, -hy, hx, hy);
        line(ctx, -hx, hy, hx, -hy);
        ctx.stroke();
        break;
      case 'mechinf':
        line(ctx, -hx, -hy, hx, hy);
        line(ctx, -hx, hy, hx, -hy);
        ctx.stroke();
        ctx.beginPath();
        pill(ctx, 0.42 * k, 0.2 * k);
        ctx.stroke();
        break;
      case 'armour':
        pill(ctx, 0.42 * k, 0.2 * k);
        ctx.stroke();
        break;
      case 'recon':
        line(ctx, -hx, hy, hx, -hy);
        ctx.stroke();
        break;
      case 'antitank':
        ctx.moveTo(-hx, hy);
        ctx.lineTo(0, -hy);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        break;
      case 'artillery':
        ctx.arc(0, 0, 0.14 * k, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'mortar': {
        // Upward arrow standing on a small circle.
        const cy = 0.26 * k;
        const r = 0.09 * k;
        ctx.arc(0, cy, r, 0, Math.PI * 2);
        ctx.moveTo(0, cy - r);
        ctx.lineTo(0, -0.32 * k);
        ctx.moveTo(-0.12 * k, -0.19 * k);
        ctx.lineTo(0, -0.33 * k);
        ctx.lineTo(0.12 * k, -0.19 * k);
        ctx.stroke();
        break;
      }
      case 'observer':
        // Observation triangle with a dot (field artillery observer).
        ctx.moveTo(0, -0.3 * k);
        ctx.lineTo(0.3 * k, 0.24 * k);
        ctx.lineTo(-0.3 * k, 0.24 * k);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0.07 * k, 0.065 * k, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }

  // Echelon (size) marker above the frame. Returns its height.
  function drawEchelon(ctx, echelon, s, baseY) {
    const dot = (x) => {
      ctx.beginPath();
      ctx.arc(x, baseY - 0.11 * s, 0.075 * s, 0, Math.PI * 2);
      ctx.fill();
    };
    const bars = (count) => {
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const x = (i - (count - 1) / 2) * 0.2 * s;
        line(ctx, x, baseY, x, baseY - 0.3 * s);
      }
      ctx.stroke();
    };
    switch (echelon) {
      case 'team':
        ctx.beginPath();
        ctx.arc(0, baseY - 0.14 * s, 0.12 * s, 0, Math.PI * 2);
        line(ctx, -0.18 * s, baseY + 0.02 * s, 0.18 * s, baseY - 0.3 * s);
        ctx.stroke();
        return 0.32 * s;
      case 'squad':
        dot(0);
        return 0.2 * s;
      case 'section':
        dot(-0.12 * s);
        dot(0.12 * s);
        return 0.2 * s;
      case 'platoon':
        dot(-0.24 * s);
        dot(0);
        dot(0.24 * s);
        return 0.2 * s;
      case 'company':
        bars(1);
        return 0.3 * s;
      case 'battalion':
        bars(2);
        return 0.3 * s;
      case 'regiment':
        bars(3);
        return 0.3 * s;
      case 'brigade':
        ctx.beginPath();
        line(ctx, -0.13 * s, baseY, 0.13 * s, baseY - 0.3 * s);
        line(ctx, -0.13 * s, baseY - 0.3 * s, 0.13 * s, baseY);
        ctx.stroke();
        return 0.3 * s;
      default:
        return 0;
    }
  }

  function haloText(ctx, text, x, y, color, haloWidth) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = haloWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // Draws a unit symbol with its frame centred on (x, y).
  // spec: { affiliation, icon, echelon, label }. Returns the bounding box.
  function drawSymbol(ctx, x, y, s, spec, highlight) {
    const aff = GEOMETRY[spec.affiliation] ? spec.affiliation : 'unknown';
    const g = GEOMETRY[aff];
    const lw = Math.max(1, 0.06 * s);
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (highlight) {
      framePath(ctx, aff, s);
      ctx.strokeStyle = 'rgba(255, 196, 0, 0.95)';
      ctx.lineWidth = lw + 0.3 * s;
      ctx.stroke();
    }

    framePath(ctx, aff, s);
    ctx.fillStyle = FILL[aff];
    ctx.fill();

    ctx.save();
    framePath(ctx, aff, s);
    ctx.clip();
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    ctx.lineWidth = lw;
    drawIcon(ctx, spec.icon, s, g);
    ctx.restore();

    framePath(ctx, aff, s);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = lw;
    ctx.stroke();

    ctx.fillStyle = '#000';
    const echelonH = drawEchelon(ctx, spec.echelon, s, g.top * s - 0.08 * s);

    let labelW = 0;
    if (spec.label) {
      ctx.font = `600 ${Math.round(0.5 * s)}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      haloText(ctx, spec.label, g.right * s + 0.2 * s, 0, '#000', 0.18 * s);
      labelW = ctx.measureText(spec.label).width + 0.2 * s;
    }
    ctx.restore();

    return {
      x0: x + g.left * s,
      x1: x + g.right * s + labelW,
      y0: y + g.top * s - (echelonH ? echelonH + 0.08 * s : 0),
      y1: y + g.bottom * s,
    };
  }

  // Unit symbol raised on a short staff so the exact position (a dot) stays visible.
  function drawSymbolOnStaff(ctx, x, y, s, spec, highlight) {
    const aff = GEOMETRY[spec.affiliation] ? spec.affiliation : 'unknown';
    const g = GEOMETRY[aff];
    const staff = 0.7 * s;
    const cy = y - staff - g.bottom * s;
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    ctx.lineWidth = Math.max(1, 0.06 * s);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, cy + g.bottom * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, 0.09 * s), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const box = drawSymbol(ctx, x, cy, s, spec, highlight);
    box.y1 = y + 0.1 * s;
    return box;
  }

  // Fire support point target / known point: a cross with the target number at top right.
  function drawTarget(ctx, x, y, s, label, color = '#000', highlight = false) {
    const arm = 0.45 * s;
    ctx.save();
    ctx.lineCap = 'butt';
    if (highlight) {
      ctx.strokeStyle = 'rgba(255, 196, 0, 0.95)';
      ctx.lineWidth = 0.3 * s;
      ctx.beginPath();
      line(ctx, x - arm, y, x + arm, y);
      line(ctx, x, y - arm, x, y + arm);
      ctx.stroke();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, 0.08 * s);
    ctx.beginPath();
    line(ctx, x - arm, y, x + arm, y);
    line(ctx, x, y - arm, x, y + arm);
    ctx.stroke();
    let w = 0;
    if (label) {
      ctx.font = `600 ${Math.round(0.45 * s)}px system-ui, sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      haloText(ctx, label, x + 0.15 * s, y - 0.3 * s, color, 0.16 * s);
      w = ctx.measureText(label).width + 0.15 * s;
    }
    ctx.restore();
    return { x0: x - arm, x1: x + Math.max(arm, w), y0: y - arm - 0.5 * s, y1: y + arm };
  }

  GL.Symbols = { FILL, drawSymbol, drawSymbolOnStaff, drawTarget, haloText };
})((window.GL = window.GL || {}));
