// App wiring: map view and layers, mission manager, input, status bar, info card, header controls.
(function (GL) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  let seed = params.get('seed') || '1944';
  let terrain = GL.createTerrain(seed);
  let scenario = GL.createScenario(terrain, seed);

  const canvas = $('map');
  const view = new GL.MapView(canvas, terrain);
  const layer = new GL.ScenarioLayer();
  const missionLayer = new GL.MissionLayer();
  const arm = new GL.RangeArmTool();
  const grid = new GL.TargetGridTool();
  view.layers.push(layer, missionLayer, grid, arm);
  let tool = null; // 'arm' | 'grid' | null: which plotting tool receives map clicks
  layer.showEnemy = missionLayer.showEnemy = $('opt-enemy').checked;

  const missionUI = new GL.MissionUI();
  let manager = null;

  function setupScenario() {
    layer.scenario = scenario;
    arm.pivot = { e: scenario.gun.e, n: scenario.gun.n };
    arm.tip = null;
    arm.locked = false;
    grid.center = null;
    if (manager) manager.destroy();
    manager = new GL.MissionManager(terrain, scenario, {
      onChange: () => {
        missionUI.render();
        view.requestRender();
      },
      onRadio: () => missionUI.renderRadio(),
      onImpact: () => view.requestRender(),
      onTick: () => missionUI.renderClock(),
    });
    missionLayer.manager = manager;
    missionUI.setManager(manager);
    $('seed').textContent = seed;
  }
  setupScenario();

  // Start looking from the guns towards the sector.
  function homeView() {
    const [e, n] = GL.Geo.polar(scenario.gun.e, scenario.gun.n, scenario.azimuthOfFire, 2000);
    view.centerOn(e, n, 7);
  }
  homeView();

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

  // ---- info card for the selected feature ----------------------------------

  function showInfo(f) {
    layer.selected = f;
    view.requestRender();
    const card = $('info');
    if (!f) {
      card.hidden = true;
      return;
    }
    const rows = [];
    const alt = Math.round(terrain.height(f.e, f.n));
    if (f === scenario.gun) {
      rows.push(['Weapon', scenario.weapon.name]);
      rows.push(['Grid', GL.MGRS.format(f.e, f.n, 5)]);
      rows.push(['Altitude', `${alt} m`]);
      rows.push(['Azimuth of fire', `${GL.Geo.fmtMils(scenario.azimuthOfFire)} mils`]);
      rows.push(['Referred deflection', String(scenario.referredDeflection)]);
      rows.push(['Sector', `L ${GL.Geo.fmtMils(scenario.sector.left)} – R ${GL.Geo.fmtMils(scenario.sector.right)}`]);
      rows.push(['Range', `${scenario.weapon.minRange}–${scenario.weapon.maxRange} m`]);
    } else {
      rows.push(['Grid', GL.MGRS.format(f.e, f.n, 4)]);
      rows.push(['Altitude', `${alt} m`]);
      if (f.affiliation === 'hostile') {
        rows.push(['Observed', f.visibleToObserver ? 'Visible to T31' : 'Not visible to T31']);
      }
    }

    const title = f.label
      ? `${f.label} — ${f.description}`
      : f.kind === 'knownPoint'
        ? `${f.id} — ${f.description}`
        : `Enemy — ${f.description}`;
    $('info-title').textContent = title;
    const body = $('info-body');
    body.replaceChildren();
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      body.append(dt, dd);
    }
    $('info-note').hidden = f.affiliation !== 'hostile';
    card.hidden = false;
  }

  $('info-close').addEventListener('click', () => showInfo(null));

  // ---- plotting tools (range arm, target grid) ------------------------------

  function setTool(next) {
    tool = tool === next ? null : next;
    arm.active = tool === 'arm';
    grid.active = tool === 'grid';
    $('arm-toggle').setAttribute('aria-pressed', String(tool === 'arm'));
    $('grid-toggle').setAttribute('aria-pressed', String(tool === 'grid'));
    $('arm-hint').hidden = tool !== 'arm';
    $('grid-ctl').hidden = tool !== 'grid';
    canvas.classList.toggle('tool', !!tool);
    if (tool === 'grid') {
      grid.dir = $('grid-dir').value === '' ? null : Number($('grid-dir').value);
      if (grid.dir === null) $('grid-dir').focus();
    }
    view.requestRender();
  }

  $('arm-toggle').addEventListener('click', () => setTool('arm'));
  $('grid-toggle').addEventListener('click', () => setTool('grid'));
  $('grid-dir').addEventListener('input', (ev) => {
    grid.dir = ev.target.value === '' ? null : Number(ev.target.value);
    view.requestRender();
  });
  $('grid-ctl').addEventListener('submit', (ev) => {
    ev.preventDefault();
    $('grid-dir').blur();
  });
  $('grid-clear').addEventListener('click', () => {
    grid.center = null;
    view.requestRender();
  });

  function armTo(p) {
    const [e, n] = view.clientToWorld(p.x, p.y);
    arm.tip = { e, n };
    view.requestRender();
  }

  // ---- pointer input (mouse drag, wheel, touch pinch, click) ---------------

  const pointers = new Map();
  let pinch = null;
  let tap = null; // start of a potential click

  function pos(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function pinchState() {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (err) {
      // Synthetic events have no active pointer to capture.
    }
    const p = pos(ev);
    pointers.set(ev.pointerId, p);
    tap = pointers.size === 1 ? p : null;
    if (pointers.size === 2) pinch = pinchState();
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('pointermove', (ev) => {
    const p = pos(ev);
    lastCursor = p;
    const prev = pointers.get(ev.pointerId);
    if (prev) {
      pointers.set(ev.pointerId, p);
      if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > 5) tap = null;
      if (pointers.size === 1) {
        view.panByCss(p.x - prev.x, p.y - prev.y);
      } else if (pointers.size === 2 && pinch) {
        const now = pinchState();
        view.panByCss(now.m.x - pinch.m.x, now.m.y - pinch.m.y);
        if (pinch.d > 0) view.zoomAtCss(now.d / pinch.d, now.m.x, now.m.y);
        pinch = now;
      }
    } else if (tool === 'arm') {
      if (!arm.locked) armTo(p);
    } else if (!tool) {
      canvas.classList.toggle('over-feature', !!view.hitTest(p.x, p.y));
    }
    updateReadout();
  });

  function endPointer(ev) {
    pointers.delete(ev.pointerId);
    pinch = pointers.size === 2 ? pinchState() : null;
    if (pointers.size === 0) canvas.classList.remove('dragging');
  }
  canvas.addEventListener('pointerup', (ev) => {
    if (tap && pointers.size === 1) {
      const p = pos(ev);
      if (tool === 'arm') {
        armTo(p);
        arm.locked = !arm.locked;
      } else if (tool === 'grid') {
        const [e, n] = view.clientToWorld(p.x, p.y);
        grid.center = { e, n };
        view.requestRender();
      } else {
        showInfo(view.hitTest(p.x, p.y));
      }
    }
    tap = null;
    endPointer(ev);
  });
  canvas.addEventListener('pointercancel', (ev) => {
    tap = null;
    endPointer(ev);
  });
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

  new ResizeObserver(() => view.resize()).observe($('map-wrap'));

  // ---- firing tables ---------------------------------------------------------

  const ftPanel = new GL.FiringTablePanel($('ft'), scenario.weapon);
  $('ft-toggle').addEventListener('click', () => ftPanel.toggle());

  // ---- keyboard -----------------------------------------------------------

  document.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
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
      case 'Home': homeView(); break;
      case 'f': case 'F': ftPanel.toggle(); break;
      case 'r': case 'R': setTool('arm'); break;
      case 't': case 'T': setTool('grid'); break;
      case 's': case 'S': manager.skip(); break;
      case 'Escape':
        if (ftPanel.visible) ftPanel.hide();
        else if (tool) setTool(tool);
        else showInfo(null);
        break;
      default: return;
    }
    ev.preventDefault();
  });

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

  $('opt-enemy').addEventListener('change', (ev) => {
    layer.showEnemy = missionLayer.showEnemy = ev.target.checked;
    if (!layer.showEnemy && layer.selected && layer.selected.affiliation === 'hostile') showInfo(null);
    view.requestRender();
  });

  $('home').addEventListener('click', homeView);

  $('new-map').addEventListener('click', () => {
    const busy = manager.state === 'receiving' || manager.state === 'ready' || manager.state === 'firing';
    if (busy && !confirm('Abandon the current mission and generate a new map?')) return;
    seed = String(Math.floor(Math.random() * 90000) + 10000);
    params.set('seed', seed);
    history.replaceState(null, '', '?' + params.toString());
    terrain = GL.createTerrain(seed);
    scenario = GL.createScenario(terrain, seed);
    setupScenario();
    showInfo(null);
    view.marker = null;
    view.setTerrain(terrain);
    homeView();
  });

  // Exposed for debugging in the browser console.
  GL.app = {
    view,
    layer,
    arm,
    grid,
    setTool,
    get manager() { return manager; },
    get terrain() { return terrain; },
    get scenario() { return scenario; },
  };
})((window.GL = window.GL || {}));
