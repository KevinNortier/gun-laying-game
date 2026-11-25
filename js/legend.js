// Map legend: the symbols used on the current map (depends on its theme and features).
(function (GL) {
  'use strict';

  const W = 46;
  const H = 18;

  function swatch(draw) {
    const dpr = window.devicePixelRatio || 1;
    const c = document.createElement('canvas');
    c.width = W * dpr;
    c.height = H * dpr;
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    draw(g, dpr);
    return c;
  }

  const rgb = (a) => `rgb(${a.join(',')})`;

  function areaSwatch(fillRgb, pattern) {
    return swatch((g) => {
      g.fillStyle = rgb(fillRgb);
      g.fillRect(0, 0, W, H);
      if (pattern) {
        g.save();
        g.scale(1 / (window.devicePixelRatio || 1), 1 / (window.devicePixelRatio || 1));
        g.fillStyle = g.createPattern(pattern, 'repeat');
        g.fillRect(0, 0, W * (window.devicePixelRatio || 1), H * (window.devicePixelRatio || 1));
        g.restore();
      }
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.strokeRect(0.5, 0.5, W - 1, H - 1);
    });
  }

  function lineSwatch(strokes) {
    return swatch((g) => {
      g.fillStyle = '#f7f3e5';
      g.fillRect(0, 0, W, H);
      g.lineCap = 'round';
      for (const s of strokes) {
        g.setLineDash(s.dash || []);
        g.strokeStyle = s.color;
        g.lineWidth = s.width;
        g.beginPath();
        g.moveTo(4, H / 2);
        g.lineTo(W - 4, H / 2);
        g.stroke();
      }
    });
  }

  function render(container, terrain) {
    const C = GL.COVER;
    const theme = terrain.theme;
    const f = terrain.features;
    const patterns = GL.mapPatterns(window.devicePixelRatio || 1);
    const MC = GL.MAP_COLORS;
    const rows = [];
    const add = (canvas, label) => rows.push([canvas, label]);

    if (theme.waterFrac > 0 || theme.rivers.ponds) add(areaSwatch(MC.water, null), 'Lake');
    if (theme.rivers.intermittent) {
      add(lineSwatch([{ color: 'rgba(70,120,175,0.85)', width: 2, dash: [5, 2, 1, 2] }]), 'Dry riverbed (wadi)');
    } else {
      add(lineSwatch([{ color: '#2f7fc1', width: 2.5 }]), 'River / stream');
    }
    if (theme.wood) add(areaSwatch(theme.wood.color), theme.wood.kind === 'conifer' ? 'Coniferous forest' : 'Woods');
    if (theme.marsh) add(areaSwatch([234, 241, 234], patterns[C.MARSH]), theme.wood && theme.wood.kind === 'conifer' ? 'Bog / marsh' : 'Marsh');
    if (theme.sand) add(areaSwatch([238, 222, 182], patterns[C.SAND]), 'Sand');
    if (theme.scrub) add(areaSwatch(theme.ground, patterns[C.SCRUB]), 'Scrub');
    add(areaSwatch([224, 220, 212], patterns[C.ROCK]), 'Rock / bare slope');

    if (f) {
      add(swatch((g) => {
        g.fillStyle = 'rgb(222,206,198)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#2f2a28';
        for (const [x, y] of [[8, 5], [20, 9], [32, 4], [36, 11]]) g.fillRect(x, y, 6, 4);
      }), 'Built-up area / buildings');
      const present = new Set(f.roads.map((r) => r.cls));
      const RS = GL.ROAD_STYLE;
      if (present.has('main')) {
        add(lineSwatch([{ color: RS.main.casing, width: RS.main.casingW }, { color: RS.main.fill, width: RS.main.fillW }]), 'Main road');
      }
      if (present.has('secondary')) {
        add(lineSwatch([{ color: RS.secondary.casing, width: RS.secondary.casingW }, { color: RS.secondary.fill, width: RS.secondary.fillW }]), 'Secondary road');
      }
      if (present.has('track')) add(lineSwatch([{ color: RS.track.fill, width: RS.track.fillW, dash: RS.track.dash }]), 'Track');
      if (f.bridges.length) {
        add(swatch((g) => {
          g.fillStyle = '#f7f3e5';
          g.fillRect(0, 0, W, H);
          g.strokeStyle = '#2f7fc1';
          g.lineWidth = 2.5;
          g.beginPath();
          g.moveTo(W / 2, 0);
          g.lineTo(W / 2, H);
          g.stroke();
          g.strokeStyle = RS.secondary.casing;
          g.lineWidth = RS.secondary.casingW;
          g.beginPath();
          g.moveTo(4, H / 2);
          g.lineTo(W - 4, H / 2);
          g.stroke();
          g.strokeStyle = RS.secondary.fill;
          g.lineWidth = RS.secondary.fillW;
          g.stroke();
          g.strokeStyle = '#111';
          g.lineWidth = 1.2;
          g.beginPath();
          for (const s of [-1, 1]) {
            g.moveTo(W / 2 - 7, H / 2 + s * 4.5);
            g.lineTo(W / 2 + 7, H / 2 + s * 4.5);
          }
          g.stroke();
        }), 'Bridge');
      }
    }

    add(swatch((g) => {
      g.fillStyle = '#f7f3e5';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = MC.contour;
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(2, 5);
      g.bezierCurveTo(15, 2, 30, 8, W - 2, 4);
      g.stroke();
      g.strokeStyle = MC.contourIndex;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(2, 13);
      g.bezierCurveTo(15, 10, 30, 16, W - 2, 12);
      g.stroke();
    }), 'Contour / index contour');
    add(swatch((g) => {
      g.fillStyle = '#f7f3e5';
      g.fillRect(0, 0, W, H);
      g.fillStyle = MC.spot;
      g.beginPath();
      g.arc(10, H / 2, 1.8, 0, Math.PI * 2);
      g.fill();
      g.font = '10px system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.fillText('245', 15, H / 2);
    }), 'Spot height (m)');
    add(swatch((g) => {
      g.fillStyle = '#f7f3e5';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#1550a6';
      g.lineWidth = 1.5;
      g.setLineDash([6, 4]);
      g.beginPath();
      g.moveTo(4, H / 2);
      g.lineTo(W - 4, H / 2);
      g.stroke();
    }), 'Sector of fire');
    add(swatch((g) => {
      g.fillStyle = '#f7f3e5';
      g.fillRect(0, 0, W, H);
      GL.Symbols.drawTarget(g, 12, H / 2 + 2, 16, '', '#000');
    }), 'Known point / target');

    const list = document.createElement('ul');
    list.className = 'legend-list';
    for (const [canvas, label] of rows) {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = label;
      li.append(canvas, span);
      list.append(li);
    }
    const head = document.createElement('p');
    head.className = 'small muted';
    head.textContent = `${theme.label} terrain`;
    container.replaceChildren(head, list);
  }

  GL.Legend = { render };
})((window.GL = window.GL || {}));
