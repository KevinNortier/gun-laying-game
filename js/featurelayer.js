// Map layer for the scenario: sector of fire, known points and unit symbols. Clickable.
(function (GL) {
  'use strict';

  const BLUE = '#1550a6';

  class ScenarioLayer {
    constructor() {
      this.scenario = null;
      this.selected = null; // the selected feature object
      this.showEnemy = true;
      this._hits = [];
    }

    draw(view, ctx) {
      const sc = this.scenario;
      this._hits = [];
      if (!sc) return;
      const dpr = view.dpr;
      const s = 22 * dpr * (view.cssMpp > 25 ? 0.75 : 1);

      this._drawSector(view, ctx, sc);

      for (const kp of sc.knownPoints) {
        const [x, y] = view.worldToScreen(kp.e, kp.n);
        const box = GL.Symbols.drawTarget(ctx, x, y, s, kp.id, '#000', kp === this.selected);
        this._hits.push({ box, feature: kp });
      }

      const units = [];
      if (this.showEnemy) units.push(...sc.hostiles);
      units.push(sc.observer, sc.gun);
      for (const u of units) {
        const [x, y] = view.worldToScreen(u.e, u.n);
        if (x < -100 || y < -100 || x > view.canvas.width + 100 || y > view.canvas.height + 100) continue;
        const box = GL.Symbols.drawSymbolOnStaff(ctx, x, y, s, u, u === this.selected);
        this._hits.push({ box, feature: u });
      }
    }

    _drawSector(view, ctx, sc) {
      const G = GL.Geo;
      const dpr = view.dpr;
      const { gun, sector, weapon } = sc;
      const [gx, gy] = view.worldToScreen(gun.e, gun.n);
      const R = weapon.maxRange / view.mpp;
      const [lx, ly] = view.worldToScreen(...G.polar(gun.e, gun.n, sector.left, weapon.maxRange));
      const [rx, ry] = view.worldToScreen(...G.polar(gun.e, gun.n, sector.right, weapon.maxRange));

      ctx.save();
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([10 * dpr, 6 * dpr]);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(gx, gy);
      ctx.lineTo(rx, ry);
      ctx.arc(gx, gy, R, G.canvasAngle(sector.right), G.canvasAngle(sector.left), true);
      ctx.stroke();

      // Azimuth of fire: short dotted line from the guns.
      const [ax, ay] = view.worldToScreen(...G.polar(gun.e, gun.n, sc.azimuthOfFire, Math.min(1000, weapon.maxRange)));
      ctx.setLineDash([2 * dpr, 5 * dpr]);
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelAt = (az, d, text) => {
        const [x, y] = view.worldToScreen(...G.polar(gun.e, gun.n, az, d));
        GL.Symbols.haloText(ctx, text, x, y, BLUE, 3 * dpr);
      };
      const labelDist = weapon.maxRange + 14 * dpr * view.mpp;
      labelAt(sector.left, labelDist, `L ${G.fmtMils(sector.left)}`);
      labelAt(sector.right, labelDist, `R ${G.fmtMils(sector.right)}`);
      labelAt(sc.azimuthOfFire, labelDist, `AoF ${G.fmtMils(sc.azimuthOfFire)}`);
      ctx.restore();
    }

    // Device-pixel hit test; topmost feature first.
    hitTest(x, y) {
      for (let i = this._hits.length - 1; i >= 0; i--) {
        const { box, feature } = this._hits[i];
        const pad = 3;
        if (x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad) return feature;
      }
      return null;
    }
  }

  GL.ScenarioLayer = ScenarioLayer;
})((window.GL = window.GL || {}));
