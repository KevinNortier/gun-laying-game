// Firing table "booklet" panel: one tab per charge, tabular data in a scrolling table.
(function (GL) {
  'use strict';

  const COLUMNS = [
    { key: 'range', head: 'Range', unit: 'm', fmt: (v) => v.toFixed(0) },
    { key: 'elev', head: 'Elev', unit: 'mil', fmt: (v) => v.toFixed(0), strong: true },
    { key: 'dElev100', head: 'ΔElev per 100 m', unit: 'mil', fmt: (v) => v.toFixed(0) },
    { key: 'tof', head: 'Time of flight', unit: 's', fmt: (v) => v.toFixed(1) },
    { key: 'maxOrd', head: 'Max ord', unit: 'm', fmt: (v) => v.toFixed(0) },
    { key: 'vi10', head: 'Target 10 m higher', unit: 'm', fmt: signed, group: 'range' },
    { key: 'headWind', head: 'Head wind 1 m/s', unit: 'm', fmt: signed, group: 'range' },
    { key: 'tailWind', head: 'Tail wind 1 m/s', unit: 'm', fmt: signed, group: 'range' },
    { key: 'airTemp', head: 'Air temp +1 °C', unit: 'm', fmt: signed, group: 'range' },
    { key: 'density', head: 'Density +1 %', unit: 'm', fmt: signed, group: 'range' },
    { key: 'propTemp', head: 'Prop temp +1 °C', unit: 'm', fmt: signed, group: 'range' },
    { key: 'crossWind', head: 'Cross wind 1 m/s (L→R)', unit: 'mil R', fmt: (v) => v.toFixed(1), group: 'defl' },
  ];

  function signed(v) {
    const r = Math.round(v * 10) / 10;
    if (r === 0) return '0.0';
    return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(1);
  }

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    for (const c of children) e.append(c);
    return e;
  }

  class FiringTablePanel {
    constructor(root, weapon) {
      this.root = root;
      this.weapon = weapon;
      this.charge = 0;
      this.tabs = root.querySelector('.tabs');
      this.meta = root.querySelector('.ft-meta');
      this.table = root.querySelector('table');
      this.wrap = root.querySelector('.table-wrap');
      root.querySelector('.ft-title').textContent = `Firing table — ${weapon.name}, ${weapon.ammunition}`;
      root.querySelector('.ft-close').addEventListener('click', () => this.hide());

      weapon.charges.forEach((c, i) => {
        const b = el('button', { type: 'button', role: 'tab', 'data-charge': String(i) }, `Charge ${c.charge}`);
        b.addEventListener('click', () => this.showCharge(i));
        this.tabs.append(b);
      });

      const std = root.querySelector('.ft-standard');
      for (const s of GL.FiringTables.STANDARD_CONDITIONS) std.append(el('li', null, s));
    }

    get visible() {
      return !this.root.hidden;
    }

    show() {
      this.root.hidden = false;
      this.showCharge(this.charge);
    }

    hide() {
      this.root.hidden = true;
    }

    toggle() {
      if (this.visible) this.hide();
      else this.show();
    }

    showCharge(i) {
      this.charge = i;
      for (const b of this.tabs.children) b.setAttribute('aria-selected', String(Number(b.dataset.charge) === i));
      const t = GL.FiringTables.getTable(this.weapon, i);

      this.meta.textContent =
        `Charge ${i} · muzzle velocity ${t.mv.toFixed(0)} m/s · ` +
        `range ${Math.ceil(t.minRange)}–${Math.floor(t.maxRange)} m · ` +
        `elevation ${this.weapon.minElev}–${this.weapon.maxElev} mils`;

      const thead = el('thead');
      const groupRow = el('tr');
      groupRow.append(el('th', { colspan: '5', class: 'grp' }, ''));
      groupRow.append(el('th', { colspan: '6', class: 'grp' }, 'Effect on range (m) of'));
      groupRow.append(el('th', { colspan: '1', class: 'grp' }, 'Deflection effect'));
      const headRow = el('tr');
      for (const c of COLUMNS) {
        headRow.append(el('th', null, c.head, el('span', { class: 'unit' }, c.unit)));
      }
      thead.append(groupRow, headRow);

      const tbody = el('tbody');
      for (const r of t.rows) {
        const tr = el('tr', r.range % 500 === 0 ? { class: 'major' } : null);
        for (const c of COLUMNS) {
          const td = el('td', c.strong ? { class: 'strong' } : null, c.fmt(r[c.key]));
          tr.append(td);
        }
        tbody.append(tr);
      }
      this.table.replaceChildren(thead, tbody);
      this.wrap.scrollTop = 0;
    }
  }

  GL.FiringTablePanel = FiringTablePanel;
})((window.GL = window.GL || {}));
