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

      this._drawDeclination(view, ctx, sc);
    }

    // Declination diagram in the map margin, as printed on topographic maps.
    _drawDeclination(view, ctx, sc) {
      const decl = sc.declination || 0;
      const dpr = view.dpr;
      const W = view.canvas.width;
      const H = view.canvas.height;
      const pw = 215 * dpr;
      const ph = 112 * dpr;
      const x0 = W - pw - 12 * dpr;
      const y0 = H - ph - 12 * dpr;
      if (x0 < 220 * dpr) return; // no room next to the scale bar
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(x0, y0, pw, ph);

      const bx = x0 + 48 * dpr;
      const by = y0 + ph - 14 * dpr;
      const L = 72 * dpr;
      // Drawn exaggerated when small, as on real maps ("use diagram only to obtain numerical values").
      const shown = (decl < 0 ? -1 : 1) * Math.max(Math.abs(decl) * GL.Geo.RAD_PER_MIL, (24 * Math.PI) / 180);
      const tipGN = [bx, by - L];
      const tipMN = [bx + Math.sin(shown) * L, by - Math.cos(shown) * L];

      ctx.strokeStyle = '#111';
      ctx.fillStyle = '#111';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(...tipGN);
      ctx.moveTo(bx, by);
      ctx.lineTo(...tipMN);
      ctx.stroke();
      // Half arrowhead on magnetic north.
      const ux = Math.sin(shown);
      const uy = -Math.cos(shown);
      ctx.beginPath();
      ctx.moveTo(...tipMN);
      ctx.lineTo(tipMN[0] - ux * 12 * dpr - uy * 5 * dpr * Math.sign(decl || 1),
        tipMN[1] - uy * 12 * dpr + ux * 5 * dpr * Math.sign(decl || 1));
      ctx.lineTo(tipMN[0] - ux * 12 * dpr, tipMN[1] - uy * 12 * dpr);
      ctx.closePath();
      ctx.fill();
      // Angle arc.
      ctx.beginPath();
      const a0 = -Math.PI / 2;
      ctx.arc(bx, by, L * 0.55, Math.min(a0, a0 + shown), Math.max(a0, a0 + shown));
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();

      ctx.font = `600 ${10 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('GN', tipGN[0], tipGN[1] - 3 * dpr);
      ctx.fillText('MN', tipMN[0] + ux * 6 * dpr, tipMN[1] - 3 * dpr);

      const abs = Math.abs(decl);
      const dir = decl >= 0 ? 'E' : 'W';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const tx = x0 + 96 * dpr;
      ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
      ctx.fillText(`G-M angle ${abs} mils ${dir}`, tx, y0 + 12 * dpr);
      ctx.font = `${10 * dpr}px system-ui, sans-serif`;
      const lines = [
        'To convert a magnetic',
        'azimuth to a grid azimuth,',
        `${decl >= 0 ? 'add' : 'subtract'} the G-M angle.`,
      ];
      lines.forEach((t, i) => ctx.fillText(t, tx, y0 + (34 + i * 14) * dpr));
      ctx.restore();
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
