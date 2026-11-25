// Manual plotting tool: a range arm pivoting on a point (normally the mortar), with a range
// scale along the arm and a mil scale arc at its tip. Deliberately gives no numeric readout:
// the player reads azimuth and range off the scales, zooming in for precision.
(function (GL) {
  'use strict';

  const COLOR = '#c0003c';
  const RANGE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
  const MIL_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

  // Smallest step giving at least minPx spacing (and a multiple of `of`, if given).
  function pickStep(steps, pxPerUnit, minPx, of) {
    for (const s of steps) {
      if (s * pxPerUnit >= minPx && (!of || s % of === 0)) return s;
    }
    return steps[steps.length - 1];
  }

  function haloStroke(ctx, width, dpr) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = width + 3 * dpr;
    ctx.stroke();
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  class RangeArmTool {
    constructor() {
      this.active = false;
      this.pivot = null; // { e, n }
      this.tip = null; // { e, n }
      this.locked = false;
    }

    draw(view, ctx) {
      // A locked arm stays on the map as a plot while other tools are used.
      if (!(this.active || this.locked) || !this.pivot || !this.tip) return;
      const G = GL.Geo;
      const dpr = view.dpr;
      const [px, py] = view.worldToScreen(this.pivot.e, this.pivot.n);
      const [tx, ty] = view.worldToScreen(this.tip.e, this.tip.n);
      const L = Math.hypot(tx - px, ty - py);
      if (L < 4) return;
      const ux = (tx - px) / L;
      const uy = (ty - py) / L;
      const nx = uy; // perpendicular (to the left of the arm when looking along it... on screen)
      const ny = -ux;
      const dist = G.distance(this.pivot.e, this.pivot.n, this.tip.e, this.tip.n);
      const pxPerM = L / dist;
      const ext = 60 * dpr; // arm continues a little past the tip

      ctx.save();
      ctx.lineCap = 'butt';

      // Arm.
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tx + ux * ext, ty + uy * ext);
      haloStroke(ctx, 1.5 * dpr, dpr);

      // Range scale along the arm.
      const minor = pickStep(RANGE_STEPS, pxPerM, 5 * dpr);
      const major = pickStep(RANGE_STEPS, pxPerM, 60 * dpr, minor);
      const maxD = dist + ext / pxPerM;
      const W = view.canvas.width;
      const H = view.canvas.height;
      const onScreen = (x, y) => x > -50 && y > -50 && x < W + 50 && y < H + 50;
      ctx.beginPath();
      const labels = [];
      for (let d = minor; d <= maxD; d += minor) {
        const x = px + ux * d * pxPerM;
        const y = py + uy * d * pxPerM;
        if (!onScreen(x, y)) continue;
        const isMajor = d % major === 0;
        const len = (isMajor ? 10 : d % (minor * 5) === 0 ? 7 : 4) * dpr;
        ctx.moveTo(x, y);
        ctx.lineTo(x + nx * len, y + ny * len);
        if (isMajor && d <= dist) labels.push([d, x + nx * 20 * dpr, y + ny * 20 * dpr]);
      }
      ctx.strokeStyle = COLOR;
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();

      ctx.font = `600 ${10 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [d, x, y] of labels) GL.Symbols.haloText(ctx, String(d), x, y, COLOR, 3 * dpr);

      // Mil scale arc at the tip.
      const az = G.azimuthMils(this.pivot.e, this.pivot.n, this.tip.e, this.tip.n);
      const pxPerMil = L * G.RAD_PER_MIL;
      const mMinor = pickStep(MIL_STEPS, pxPerMil, 5 * dpr);
      const mMajor = pickStep(MIL_STEPS, pxPerMil, 60 * dpr, mMinor);
      const span = Math.min(3200, (380 * dpr) / pxPerMil);
      ctx.beginPath();
      ctx.arc(px, py, L, G.canvasAngle(az - span), G.canvasAngle(az + span));
      haloStroke(ctx, 1.2 * dpr, dpr);

      ctx.beginPath();
      const milLabels = [];
      const start = Math.ceil((az - span) / mMinor) * mMinor;
      for (let m = start; m <= az + span; m += mMinor) {
        const a = G.canvasAngle(m);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const isMajor = G.normMils(m) % mMajor === 0;
        const len = (isMajor ? 11 : G.normMils(m) % (mMinor * 5) === 0 ? 7 : 4) * dpr;
        const x0 = px + ca * L;
        const y0 = py + sa * L;
        if (!onScreen(x0, y0)) continue;
        ctx.moveTo(x0, y0);
        ctx.lineTo(px + ca * (L + len), py + sa * (L + len));
        if (isMajor) milLabels.push([m, px + ca * (L + 22 * dpr), py + sa * (L + 22 * dpr)]);
      }
      ctx.strokeStyle = COLOR;
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
      for (const [m, x, y] of milLabels) GL.Symbols.haloText(ctx, G.fmtMils(m), x, y, COLOR, 3 * dpr);

      // Tip.
      ctx.beginPath();
      ctx.arc(tx, ty, 3.5 * dpr, 0, Math.PI * 2);
      if (this.locked) {
        ctx.fillStyle = COLOR;
        ctx.fill();
      } else {
        ctx.strokeStyle = COLOR;
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Target grid, as on a plotting board: a square grid oriented to the observer-target direction
  // and centred on the previous aim point. Observer corrections (left/right, add/drop) are
  // plotted by counting squares; the new aim point is then measured with the range arm.
  const GRID_COLOR = 'rgba(0, 70, 190, 0.85)';
  const GRID_EXTENT = 1000; // metres either side of the centre

  class TargetGridTool {
    constructor() {
      this.active = false;
      this.center = null; // { e, n }
      this.dir = null; // OT direction, mils
    }

    draw(view, ctx) {
      if (!this.center || this.dir === null || !Number.isFinite(this.dir)) return;
      const G = GL.Geo;
      const dpr = view.dpr;
      const r = this.dir * G.RAD_PER_MIL;
      const al = [Math.sin(r), Math.cos(r)]; // along the OT line (add)
      const rt = [Math.cos(r), -Math.sin(r)]; // to the right of the OT line
      const pt = (a, l) => view.worldToScreen(
        this.center.e + a * al[0] + l * rt[0],
        this.center.n + a * al[1] + l * rt[1]
      );
      const pxPer100 = 100 / view.mpp;
      const X = GRID_EXTENT;

      ctx.save();
      const seg = (a0, l0, a1, l1) => {
        const [x0, y0] = pt(a0, l0);
        const [x1, y1] = pt(a1, l1);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      };

      // 50 m lines when there is room.
      if (pxPer100 >= 60 * dpr) {
        ctx.beginPath();
        for (let v = -X + 50; v < X; v += 100) {
          seg(v, -X, v, X);
          seg(-X, v, X, v);
        }
        ctx.setLineDash([3 * dpr, 4 * dpr]);
        ctx.strokeStyle = 'rgba(0, 70, 190, 0.35)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 100 m squares.
      ctx.beginPath();
      for (let v = -X; v <= X; v += 100) {
        if (v === 0) continue;
        seg(v, -X, v, X);
        seg(-X, v, X, v);
      }
      ctx.strokeStyle = 'rgba(0, 70, 190, 0.5)';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();

      // Axes.
      ctx.beginPath();
      seg(-X, 0, X + 150, 0);
      seg(0, -X, 0, X);
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();

      // 10 m ticks along the axes when zoomed in.
      if (pxPer100 >= 150 * dpr) {
        ctx.beginPath();
        const t = 4 * view.mpp * dpr;
        for (let v = -X; v <= X; v += 10) {
          if (v % 100 === 0) continue;
          seg(v, -t, v, t);
          seg(-t, v, t, v);
        }
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
      }

      // OT arrow and labels.
      const [hx, hy] = pt(X + 150, 0);
      const [bx, by] = pt(X + 100, 0);
      const ux = (hx - bx) / Math.hypot(hx - bx, hy - by);
      const uy = (hy - by) / Math.hypot(hx - bx, hy - by);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - ux * 12 * dpr - uy * 6 * dpr, hy - uy * 12 * dpr + ux * 6 * dpr);
      ctx.lineTo(hx - ux * 12 * dpr + uy * 6 * dpr, hy - uy * 12 * dpr - ux * 6 * dpr);
      ctx.closePath();
      ctx.fillStyle = GRID_COLOR;
      ctx.fill();

      ctx.font = `600 ${10 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const [lx, ly] = pt(X + 150, 0);
      GL.Symbols.haloText(ctx, `OT ${G.fmtMils(this.dir)}`, lx + ux * 22 * dpr, ly + uy * 22 * dpr, GRID_COLOR, 3 * dpr);
      const every = pxPer100 >= 35 * dpr ? 100 : pxPer100 >= 14 * dpr ? 500 : 1000;
      const off = 10 * view.mpp * dpr; // label offset from the axis, in metres
      for (let v = every; v <= X; v += every) {
        let [x, y] = pt(v, -off * 2.2);
        GL.Symbols.haloText(ctx, `+${v}`, x, y, GRID_COLOR, 3 * dpr);
        [x, y] = pt(-v, -off * 2.2);
        GL.Symbols.haloText(ctx, `−${v}`, x, y, GRID_COLOR, 3 * dpr);
        [x, y] = pt(off * 1.4, v);
        GL.Symbols.haloText(ctx, `R${v}`, x, y, GRID_COLOR, 3 * dpr);
        [x, y] = pt(off * 1.4, -v);
        GL.Symbols.haloText(ctx, `L${v}`, x, y, GRID_COLOR, 3 * dpr);
      }

      const [cx, cy] = pt(0, 0);
      ctx.beginPath();
      ctx.arc(cx, cy, 5 * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
      ctx.restore();
    }
  }

  GL.RangeArmTool = RangeArmTool;
  GL.TargetGridTool = TargetGridTool;
})((window.GL = window.GL || {}));
