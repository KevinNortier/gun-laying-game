// App wiring: map view, mouse/touch/keyboard input, status bar and header controls.
(function (GL) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  let seed = params.get('seed') || '1944';
  let terrain = GL.createTerrain(seed);

  const canvas = $('map');
  const view = new GL.MapView(canvas, terrain);
  $('seed').textContent = seed;

  // ---- status bar ---------------------------------------------------------

  let lastCursor = null;

  function formatScale(d) {
    const rounded = d > 10000 ? Math.round(d / 500) * 500 : Math.round(d / 50) * 50;
    return '1:' + rounded.toLocaleString('en-US').replace(/,/g, ' ');
  }

  function updateReadout() {
    $('st-scale').textContent = formatScale(view.scaleDenominator());
    const set = (grid, grid8, elev) => {
      $('st-grid').textContent = grid;
      $('st-grid8').textContent = grid8;
      $('st-elev').textContent = elev;
    };
    if (!lastCursor) return set('—', '—', '—');
    const [e, n] = view.clientToWorld(lastCursor.x, lastCursor.y);
    if (e < 0 || n < 0 || e >= terrain.size || n >= terrain.size) return set('off map', '—', '—');
    const h = terrain.height(e, n);
    let elev;
    if (terrain.isWater(h)) elev = 'water';
    else elev = `${Math.round(h)} m` + (terrain.isWood(e, n, h) ? ' (woods)' : '');
    set(GL.MGRS.format(e, n, 5), GL.MGRS.format(e, n, 4, false), elev);
  }

  view.onRender = updateReadout;
  updateReadout();

  // ---- pointer input (mouse drag, wheel, touch pinch) ----------------------

  const pointers = new Map();
  let pinch = null;

  function pos(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function pinchState() {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, pos(ev));
    if (pointers.size === 2) pinch = pinchState();
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('pointermove', (ev) => {
    const p = pos(ev);
    lastCursor = p;
    const prev = pointers.get(ev.pointerId);
    if (prev) {
      pointers.set(ev.pointerId, p);
      if (pointers.size === 1) {
        view.panByCss(p.x - prev.x, p.y - prev.y);
      } else if (pointers.size === 2 && pinch) {
        const now = pinchState();
        view.panByCss(now.m.x - pinch.m.x, now.m.y - pinch.m.y);
        if (pinch.d > 0) view.zoomAtCss(now.d / pinch.d, now.m.x, now.m.y);
        pinch = now;
      }
    }
    updateReadout();
  });

  function endPointer(ev) {
    pointers.delete(ev.pointerId);
    pinch = pointers.size === 2 ? pinchState() : null;
    if (pointers.size === 0) canvas.classList.remove('dragging');
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => {
    if (pointers.size === 0) {
      lastCursor = null;
      updateReadout();
    }
  });

  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const unit = ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 400 : 1;
      const p = pos(ev);
      view.zoomAtCss(Math.exp(-ev.deltaY * unit * 0.0015), p.x, p.y);
    },
    { passive: false }
  );

  canvas.addEventListener('dblclick', (ev) => {
    const p = pos(ev);
    view.zoomAtCss(ev.shiftKey ? 0.5 : 2, p.x, p.y);
  });

  // ---- keyboard -----------------------------------------------------------

  document.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement) return;
    const cx = view.cssW / 2;
    const cy = view.cssH / 2;
    const step = 120;
    switch (ev.key) {
      case '+': case '=': view.zoomAtCss(1.5, cx, cy); break;
      case '-': case '_': view.zoomAtCss(1 / 1.5, cx, cy); break;
      case 'ArrowLeft': view.panByCss(step, 0); break;
      case 'ArrowRight': view.panByCss(-step, 0); break;
      case 'ArrowUp': view.panByCss(0, step); break;
      case 'ArrowDown': view.panByCss(0, -step); break;
      default: return;
    }
    ev.preventDefault();
  });

  window.addEventListener('resize', () => view.resize());

  // ---- header controls ----------------------------------------------------

  $('goto-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = $('goto-input').value;
    const r = GL.MGRS.parse(input);
    if (r.error) {
      $('goto-error').textContent = r.error;
      return;
    }
    $('goto-error').textContent = '';
    view.marker = { e: r.e, n: r.n, label: GL.MGRS.format(r.e, r.n, r.digits, false) };
    view.centerOn(r.e, r.n, view.cssMpp > 8 ? 4 : undefined);
  });

  $('opt-hillshade').addEventListener('change', (ev) => view.setOption('hillshade', ev.target.checked));

  $('new-map').addEventListener('click', () => {
    seed = String(Math.floor(Math.random() * 90000) + 10000);
    params.set('seed', seed);
    history.replaceState(null, '', '?' + params.toString());
    terrain = GL.createTerrain(seed);
    view.marker = null;
    view.setTerrain(terrain);
    $('seed').textContent = seed;
  });

  // Exposed for debugging in the browser console.
  GL.app = { view, get terrain() { return terrain; } };
})((window.GL = window.GL || {}));
