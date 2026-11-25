// Map layer for the current fire mission: bursts (impacts) and, once the mission is over
// (or in debug view), the true target position.
(function (GL) {
  'use strict';

  class MissionLayer {
    constructor() {
      this.manager = null;
      this.showEnemy = false;
    }

    draw(view, ctx) {
      const mm = this.manager;
      if (!mm || !mm.mission) return;
      const dpr = view.dpr;
      const m = mm.mission;
      const reveal = this.showEnemy || mm.state === 'complete';

      if (reveal) {
        const t = m.target;
        const [x, y] = view.worldToScreen(t.e, t.n);
        if (mm.state === 'complete') {
          // Effective radius around the true target.
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, GL.MISSION_EFFECT_RADIUS / view.mpp, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(200, 0, 0, 0.6)';
          ctx.setLineDash([4 * dpr, 4 * dpr]);
          ctx.lineWidth = 1.2 * dpr;
          ctx.stroke();
          ctx.restore();
        }
        const s = 22 * dpr * (view.cssMpp > 25 ? 0.75 : 1);
        GL.Symbols.drawTarget(ctx, x, y, s * 0.8, m.number, '#b00000');
        GL.Symbols.drawSymbolOnStaff(ctx, x, y, s, m.target, false);
      }

      // The FDC only learns where rounds land from the observer; bursts are shown in debug view
      // and in the debrief once the mission is over.
      if (reveal) {
        const last = mm.impacts.length - 1;
        mm.impacts.forEach((imp, i) => this._burst(view, ctx, imp, i === last));
      }
    }

    _burst(view, ctx, imp, latest) {
      const dpr = view.dpr;
      const [x, y] = view.worldToScreen(imp.e, imp.n);
      const r = (latest ? 8 : 6) * dpr;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        const rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = latest ? '#ff7a00' : 'rgba(255, 140, 40, 0.75)';
      ctx.fill();
      ctx.strokeStyle = '#3a1a00';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
      ctx.font = `600 ${10 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      GL.Symbols.haloText(ctx, String(imp.roundNo), x + r + 2 * dpr, y - r * 0.6, '#3a1a00', 3 * dpr);
      ctx.restore();
    }
  }

  GL.MissionLayer = MissionLayer;
})((window.GL = window.GL || {}));
