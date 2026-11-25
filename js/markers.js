// Player markers: labelled points to keep track of plotted targets and aim points.
// MarkerLayer draws them on the map; MarkerPanel is the floating list/editor.
(function (GL) {
  'use strict';

  const COLOR = '#6a1b9a';

  class MarkerLayer {
    constructor() {
      this.markers = [];
      this.selected = null;
      this.nextId = 1;
      this.onChange = null;
    }

    add(e, n, label) {
      const id = this.nextId++;
      const m = { id, e, n, label: label || `M${id}` };
      this.markers.push(m);
      this.selected = m;
      this._changed();
      return m;
    }

    move(m, e, n) {
      m.e = e;
      m.n = n;
      this._changed();
    }

    rename(m, label) {
      m.label = label;
      this._changed();
    }

    remove(m) {
      this.markers = this.markers.filter((x) => x !== m);
      if (this.selected === m) this.selected = null;
      this._changed();
    }

    clear() {
      this.markers = [];
      this.selected = null;
      this.nextId = 1;
      this._changed();
    }

    select(m) {
      this.selected = m;
      this._changed();
    }

    _changed() {
      if (this.onChange) this.onChange();
    }

    draw(view, ctx) {
      const dpr = view.dpr;
      const W = view.canvas.width;
      const H = view.canvas.height;
      ctx.save();
      ctx.font = `700 ${11 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const m of this.markers) {
        const [x, y] = view.worldToScreen(m.e, m.n);
        if (x < -100 || y < -100 || x > W + 100 || y > H + 100) continue;
        const r = 7 * dpr;
        if (m === this.selected) {
          ctx.beginPath();
          ctx.arc(x, y, r + 4 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 196, 0, 0.7)';
          ctx.fill();
        }
        // Ring with a centre dot and short ticks: the exact point stays visible.
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 4 * dpr;
        ctx.stroke();
        ctx.strokeStyle = COLOR;
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - r - 4 * dpr, y);
        ctx.lineTo(x - r + 2 * dpr, y);
        ctx.moveTo(x + r - 2 * dpr, y);
        ctx.lineTo(x + r + 4 * dpr, y);
        ctx.moveTo(x, y - r - 4 * dpr);
        ctx.lineTo(x, y - r + 2 * dpr);
        ctx.moveTo(x, y + r - 2 * dpr);
        ctx.lineTo(x, y + r + 4 * dpr);
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 1.6 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = COLOR;
        ctx.fill();
        GL.Symbols.haloText(ctx, m.label, x + r + 6 * dpr, y - r, COLOR, 3 * dpr);
      }
      ctx.restore();
    }

    // Device-pixel hit test on the marker ring (topmost = last added). Markers are picked up
    // only through the marker tool (see main.js), not the generic feature hit test, so the
    // info card keeps working for units underneath.
    hitMarker(x, y, dpr, view) {
      for (let i = this.markers.length - 1; i >= 0; i--) {
        const m = this.markers[i];
        const [mx, my] = view.worldToScreen(m.e, m.n);
        if (Math.hypot(mx - x, my - y) <= 12 * dpr) return m;
      }
      return null;
    }
  }

  class MarkerPanel {
    constructor(root, layer, view) {
      this.root = root;
      this.layer = layer;
      this.view = view;
      this.keep = root.querySelector('#marker-keep');
      this.list = root.querySelector('#marker-list');
      this.editor = root.querySelector('#marker-editor');
      this.label = root.querySelector('#marker-label');
      this.grid = root.querySelector('#marker-grid');

      this.label.addEventListener('input', () => {
        if (this.layer.selected) {
          this.layer.selected.label = this.label.value;
          this.view.requestRender();
          this._renderList();
        }
      });
      this.label.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') this.label.blur();
      });
      root.querySelector('#marker-delete').addEventListener('click', () => {
        if (this.layer.selected) this.layer.remove(this.layer.selected);
      });
      root.querySelector('#marker-clear').addEventListener('click', () => {
        if (!this.layer.markers.length || confirm('Delete all markers?')) this.layer.clear();
      });
      root.addEventListener('submit', (ev) => ev.preventDefault());
    }

    render() {
      const sel = this.layer.selected;
      this.editor.hidden = !sel;
      if (sel) {
        if (document.activeElement !== this.label) this.label.value = sel.label;
        this.grid.textContent = GL.MGRS.format(sel.e, sel.n, 5);
      }
      this._renderList();
    }

    _renderList() {
      const ul = this.list;
      ul.replaceChildren();
      if (!this.layer.markers.length) {
        const li = document.createElement('li');
        li.className = 'muted';
        li.textContent = 'No markers yet.';
        ul.append(li);
        return;
      }
      for (const m of this.layer.markers) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = m === this.layer.selected ? 'selected' : '';
        const name = document.createElement('span');
        name.textContent = m.label || '(no label)';
        const grid = document.createElement('span');
        grid.className = 'mono muted';
        grid.textContent = GL.MGRS.format(m.e, m.n, 4, false);
        b.append(name, grid);
        b.addEventListener('click', () => {
          this.layer.select(m);
          this.view.centerOn(m.e, m.n);
        });
        li.append(b);
        ul.append(li);
      }
    }
  }

  GL.MarkerLayer = MarkerLayer;
  GL.MarkerPanel = MarkerPanel;
})((window.GL = window.GL || {}));
