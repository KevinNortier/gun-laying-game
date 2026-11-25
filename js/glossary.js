// Glossary of gunnery, procedure and map terms used in the game, and the glossary panel.
// Elements with data-term="<id>" become links: hover shows the short definition, click opens
// the glossary at that entry.
(function (GL) {
  'use strict';

  // id, term, short (one line, used as tooltip), body (paragraphs), see (related ids)
  const TERMS = [
    {
      id: 'adjust-fire', term: 'Adjust fire',
      short: 'Method of engagement: single rounds are fired and corrected onto the target before fire for effect.',
      body: ['The observer requests adjust fire when the target location is not accurate enough to hit with the first rounds. The FDC fires one round at a time; after each burst the observer sends corrections until the target is bracketed closely enough, then calls fire for effect.'],
      see: ['bracket', 'correction', 'fire-for-effect'],
    },
    {
      id: 'aiming-posts', term: 'Aiming posts',
      short: 'Posts set out in front of the mortar as a fixed reference for the sight.',
      body: ['When the mortar is laid on the azimuth of fire, the sight is set to the referred deflection and aiming posts are placed along its line of sight. To lay on a new deflection the gunner sets it on the sight and traverses the mortar until the sight is back on the posts.'],
      see: ['referred-deflection', 'deflection'],
    },
    {
      id: 'air-density', term: 'Air density',
      short: 'Mass of air per volume, given in the met message as a percentage of standard.',
      body: ['Denser air means more drag and shorter range. Standard density is 1.225 kg/m³ (100 %). The firing table gives the effect on range of +1 % density; multiply by the deviation from 100 %. Warm air and low pressure are thinner.'],
      see: ['met-message', 'standard-conditions'],
    },
    {
      id: 'air-temperature', term: 'Air temperature',
      short: 'Temperature of the air the round flies through; standard is 15 °C.',
      body: ['For subsonic mortar bombs the direct effect of air temperature is small (it changes the speed of sound and so the drag); its effect on density is reported separately as air density. The firing table gives the effect on range per +1 °C.'],
      see: ['air-density', 'met-message'],
    },
    {
      id: 'azimuth', term: 'Azimuth',
      short: 'Direction measured clockwise from north, here in mils (0–6400).',
      body: ['A grid azimuth is measured from grid north (the vertical grid lines), a magnetic azimuth from magnetic north (a compass). Convert between them with the G-M angle.'],
      see: ['mil', 'grid-north', 'magnetic-north', 'gm-angle'],
    },
    {
      id: 'azimuth-of-fire', term: 'Azimuth of fire (AoF)',
      short: 'The grid azimuth the mortar is laid on, usually the centre of its sector.',
      body: ['When the mortar is set up it is pointed along the azimuth of fire with the referred deflection on the sight. Targets on other azimuths are engaged by changing the deflection.'],
      see: ['deflection', 'referred-deflection', 'sector-of-fire'],
    },
    {
      id: 'bracket', term: 'Bracket (successive bracketing)',
      short: 'Getting one round over and one short of the target, then halving the gap.',
      body: ['The observer corrects in range with a step big enough to put the next round on the other side of the target (400, 200 or 100 m). Each time the rounds cross the target the step is halved. When the 100 m bracket is split (a 50 m correction) the observer calls fire for effect.'],
      see: ['adjust-fire', 'correction', 'fire-for-effect'],
    },
    {
      id: 'call-for-fire', term: 'Call for fire (CFF)',
      short: 'The observer\'s request for fire: who, how, where the target is and what it is.',
      body: ['Sent in parts, each read back by the FDC: observer identification and warning order (e.g. "adjust fire, polar"), target location (grid, polar or shift), and target description. The FDC then assigns a target number.'],
      see: ['grid-mission', 'polar-mission', 'shift', 'target-number'],
    },
    {
      id: 'charge', term: 'Charge',
      short: 'The number of propellant increments on the bomb; more charge, higher muzzle velocity and range.',
      body: ['Each charge (0–4 here) has its own firing table. Several charges can often reach the same range. In high-angle fire the lowest charge that reaches comfortably gives the lowest elevation, the shortest time of flight and the lowest max ord, so the wind has less time to act. Avoid the last rows of a table, near the charge\'s maximum range, where the elevation changes quickly.'],
      see: ['firing-table', 'muzzle-velocity'],
    },
    {
      id: 'check-firing', term: 'Check firing',
      short: 'Command to stop firing at once, e.g. for a safety problem.',
      body: ['In the game a fire command that would lay the mortar outside its sector of fire is refused with a check firing and recorded as a safety violation.'],
      see: ['sector-of-fire'],
    },
    {
      id: 'contour', term: 'Contour line',
      short: 'Line joining points of equal height; the contour interval is the height step between lines.',
      body: ['Every fifth contour is drawn thicker (index contour). Contours close together mean steep ground. The contour interval is printed under the scale bar and depends on the map scale.'],
      see: ['spot-height', 'vi'],
    },
    {
      id: 'correction', term: 'Corrections (left/right, add/drop)',
      short: 'Observer\'s instructions to move the next burst, along and across the OT line.',
      body: ['"Right 40" moves the aim point 40 m to the right as seen by the observer; "add 200" moves it 200 m further from the observer, "drop" closer. Corrections apply to the previous aim point, not to where the burst actually was. The FDC converts them to the gun–target line, e.g. with the target grid.'],
      see: ['ot-line', 'gt-line', 'target-grid', 'bracket'],
    },
    {
      id: 'cross-wind', term: 'Cross wind',
      short: 'Wind component across the line of fire; it drifts the round sideways.',
      body: ['Cross wind from the left (θ = wind direction − target azimuth; cross wind from the left = speed × sin(−θ)) drifts the round right. The firing table gives the drift in mils per 1 m/s. Correct the other way: drift right → add the mils to the deflection.'],
      see: ['head-wind', 'met-message', 'lars'],
    },
    {
      id: 'deflection', term: 'Deflection',
      short: 'The horizontal angle set on the mortar sight, in mils. Not the same as azimuth.',
      body: ['Deflection = referred deflection + (azimuth of fire − target azimuth). The sight scale is numbered anticlockwise, so a target left of the azimuth of fire needs a larger deflection (left add, right subtract).', 'Example: AoF 1000, referred deflection 2800, target azimuth 750 → 2800 + 250 = 3050.'],
      see: ['referred-deflection', 'azimuth-of-fire', 'lars'],
    },
    {
      id: 'direction', term: 'Direction (OT direction)',
      short: 'The azimuth from the observer to the target, sent so the FDC knows the observer\'s corrections axis.',
      body: ['Sent with the first correction (grid missions) or in the call for fire (polar and shift). "Direction magnetic 4520" is a compass reading and must be converted to grid with the G-M angle.'],
      see: ['ot-line', 'gm-angle', 'correction'],
    },
    {
      id: 'dispersion', term: 'Dispersion',
      short: 'Natural scatter of rounds fired with identical data.',
      body: ['Small differences in muzzle velocity, laying and wind spread the bursts around the aim point, more at long range. Even perfect data leaves some miss distance, which is why fire for effect uses several rounds.'],
      see: ['fire-for-effect', 'muzzle-velocity'],
    },
    {
      id: 'echelon', term: 'Echelon marker',
      short: 'Symbol above a NATO unit frame giving its size (team Ø, squad •, section ••, platoon •••, company |…).',
      body: ['From small to large: team (Ø), squad (•), section (••), platoon (•••), company (|), battalion (||), regiment (|||), brigade (X).'],
      see: ['nato-symbols'],
    },
    {
      id: 'elevation', term: 'Elevation',
      short: 'The angle of the barrel above horizontal, in mils (800–1511 for this mortar).',
      body: ['Read from the firing table for the charge and the (corrected) range. Mortars fire above 800 mils (45°): higher elevation gives shorter range. Not to be confused with the altitude of a point on the map.'],
      see: ['firing-table', 'charge'],
    },
    {
      id: 'end-of-mission', term: 'End of mission',
      short: 'The observer ends the fire mission, usually with an assessment of the effect.',
      body: ['E.g. "End of mission, target number AB1001. Estimate 6 casualties, target neutralized."'],
      see: ['fire-for-effect'],
    },
    {
      id: 'fdc', term: 'Fire direction centre (FDC)',
      short: 'The cell that turns calls for fire into firing data for the guns: your role in this game.',
      body: ['The FDC plots the target, works out deflection, charge and elevation (with corrections for height, weather and the observer\'s adjustments) and sends fire commands to the mortars.'],
      see: ['call-for-fire', 'forward-observer'],
    },
    {
      id: 'fire-for-effect', term: 'Fire for effect (FFE)',
      short: 'Several rounds fired to engage the target once the data is good enough.',
      body: ['Called by the observer at the end of adjustment, or straight away when the target location is accurate (e.g. laser). Fire 3–4 rounds. If effect is insufficient the observer sends a small correction and "repeat".'],
      see: ['adjust-fire', 'repeat', 'bracket'],
    },
    {
      id: 'firing-table', term: 'Firing table',
      short: 'Tabulated firing data per charge: elevation, time of flight, max ord and correction factors by range.',
      body: ['Valid for standard conditions. Correction columns give the effect on the fall of the round of height difference, wind, temperature, density and propellant temperature; apply the opposite to compensate. Interpolate between the 50 m rows.'],
      see: ['charge', 'standard-conditions', 'max-ord', 'time-of-flight'],
    },
    {
      id: 'forward-observer', term: 'Forward observer (FO)',
      short: 'The soldier who sees the target, calls for fire and corrects it (T31 in the game).',
      body: ['The observer locates the target (grid, polar or shift), describes it, and spots each burst. Their position is known precisely to the FDC.'],
      see: ['call-for-fire', 'correction'],
    },
    {
      id: 'gm-angle', term: 'G-M angle (declination)',
      short: 'Angle between grid north and magnetic north, shown in the declination diagram.',
      body: ['If magnetic north is east of grid north, grid azimuth = magnetic azimuth + G-M angle; if west, subtract it. The diagram in the map corner states which applies on this map.'],
      see: ['grid-north', 'magnetic-north', 'azimuth'],
    },
    {
      id: 'grid-mission', term: 'Grid mission',
      short: 'A call for fire that locates the target by grid reference.',
      body: ['The FDC plots the grid, then measures azimuth and range from the mortar. A map-plotted grid can be 100 m or more off; a laser-located 10-digit grid is accurate to a few metres.'],
      see: ['grid-reference', 'call-for-fire'],
    },
    {
      id: 'grid-north', term: 'Grid north',
      short: 'The direction of the vertical grid lines on the map; all plotting is done in grid azimuths.',
      body: ['It differs slightly from true north (the geographic pole) and from magnetic north (where a compass points).'],
      see: ['magnetic-north', 'gm-angle'],
    },
    {
      id: 'grid-reference', term: 'Grid reference (MGRS)',
      short: 'Position as easting then northing digits, e.g. 3846 7219 (8 digits = 10 m).',
      body: ['Read right first (easting), then up (northing). 4 digits give the 1 km square, 6 digits 100 m, 8 digits 10 m and 10 digits 1 m. A reference names the square the point lies in (truncated, not rounded). Full form: grid zone, 100 km square, digits, e.g. 33U VP 3846 7219.'],
      see: ['grid-north'],
    },
    {
      id: 'gt-line', term: 'Gun–target line (GT)',
      short: 'The line from the mortar to the target; range and deflection are worked out along it.',
      body: ['The observer\'s corrections are along the OT line; the FDC must convert them to the GT line. When the two lines are close in direction, add/drop is mostly range and left/right mostly deflection.'],
      see: ['ot-line', 'correction'],
    },
    {
      id: 'head-wind', term: 'Head wind / tail wind',
      short: 'Wind component along the line of fire: head wind shortens the range, tail wind lengthens it.',
      body: ['With θ = wind direction (from) − target azimuth: head wind = speed × cos θ (negative = tail wind). Multiply by the firing table value for head or tail wind.'],
      see: ['cross-wind', 'met-message'],
    },
    {
      id: 'known-point', term: 'Known point',
      short: 'A surveyed point known to both observer and FDC, used for shift missions (AB0001…).',
      body: ['Hilltops, bridges, churches and other features visible to the observer. Shown on the map as a target cross with its number.'],
      see: ['shift'],
    },
    {
      id: 'lars', term: 'LARS (left add, right subtract)',
      short: 'Rule for changing deflection: to move the strike left, add; to move it right, subtract.',
      body: ['Follows from the anticlockwise numbering of the sight\'s deflection scale.'],
      see: ['deflection'],
    },
    {
      id: 'lost', term: 'Lost',
      short: 'The observer could not see the burst.',
      body: ['Usually because the round fell far off or behind cover. The observer asks to repeat; check your data before firing again.'],
      see: ['repeat'],
    },
    {
      id: 'magnetic-north', term: 'Magnetic north',
      short: 'Where a compass points; differs from grid north by the G-M angle.',
      body: ['Observers measure directions with a compass, so polar and shift missions give magnetic directions.'],
      see: ['gm-angle', 'grid-north'],
    },
    {
      id: 'max-ord', term: 'Max ord (maximum ordinate)',
      short: 'The highest point of the trajectory, in metres above the mortar\'s altitude.',
      body: ['For that charge and elevation under standard conditions. Used for airspace coordination (aircraft must keep clear up to it), for checking that a round can reach a high target (it cannot hit above its max ord), for choosing between charges (lower max ord = shorter time of flight, less wind effect) and, less so for mortars, crest clearance.'],
      see: ['firing-table', 'time-of-flight'],
    },
    {
      id: 'met-message', term: 'Met message',
      short: 'Report of the weather affecting the rounds: ballistic wind, air temperature, density, propellant temperature.',
      body: ['The ballistic wind is a weighted average over the trajectory, given as the direction it blows from and its speed. Work out the effect of each deviation from standard with the firing table, add them up, and correct range and deflection the other way. The message is rounded and a little stale, so some error remains.'],
      see: ['standard-conditions', 'head-wind', 'cross-wind', 'air-density'],
    },
    {
      id: 'mil', term: 'Mil',
      short: 'Angle unit: 6400 mils in a circle. 1 mil subtends about 1 m at 1 km.',
      body: ['The "mil relation" makes quick estimates easy: width (m) ≈ mils × distance (km). E.g. 20 mils at 3 km ≈ 60 m.'],
      see: ['azimuth', 'deflection'],
    },
    {
      id: 'muzzle-velocity', term: 'Muzzle velocity',
      short: 'Speed of the bomb as it leaves the barrel; set by the charge and the propellant temperature.',
      body: ['Warm propellant burns faster and gives a higher muzzle velocity and longer range; the firing table gives the effect per °C from the standard 21 °C.'],
      see: ['charge', 'propellant-temperature'],
    },
    {
      id: 'nato-symbols', term: 'NATO symbols (APP-6)',
      short: 'Map symbols for units: blue rectangle friendly, red diamond hostile, green square neutral, yellow quatrefoil unknown.',
      body: ['The icon inside the frame gives the unit type (crossed lines = infantry, oval = armour, arrow on a circle = mortar, triangle = observer…) and the marker above the frame its size.'],
      see: ['echelon'],
    },
    {
      id: 'ot-line', term: 'Observer–target line (OT)',
      short: 'The line from the observer to the target; corrections are given along and across it.',
      body: ['Its direction is the OT direction. Use the target grid oriented to it to plot corrections.'],
      see: ['direction', 'correction', 'gt-line', 'target-grid'],
    },
    {
      id: 'polar-mission', term: 'Polar mission',
      short: 'Target located by direction and distance from the observer\'s known position.',
      body: ['E.g. "direction magnetic 4520, distance 2300, down 40". Convert the direction to grid, plot it from the observer (range arm pivot T31), then measure from the mortar. Up/down is the target\'s height relative to the observer.'],
      see: ['direction', 'gm-angle', 'vi'],
    },
    {
      id: 'propellant-temperature', term: 'Propellant temperature',
      short: 'Temperature of the charges at the mortar; standard is 21 °C.',
      body: ['Ammunition left in the sun or cold overnight fires long or short. The firing table gives the effect on range per +1 °C.'],
      see: ['muzzle-velocity', 'met-message'],
    },
    {
      id: 'range-arm', term: 'Range arm',
      short: 'Plotting tool: a ruled arm pivoting on a known point, with a mil scale at its tip.',
      body: ['Pivot on the mortar to read azimuth and range to a target, or on the observer to plot a polar mission. It gives no numbers: read the scales, zooming in for precision.'],
      see: ['target-grid', 'azimuth'],
    },
    {
      id: 'referred-deflection', term: 'Referred deflection',
      short: 'The deflection set on the sight when the mortar is laid on the azimuth of fire (2800 here).',
      body: ['It is the reference from which all other deflections are computed.'],
      see: ['deflection', 'azimuth-of-fire', 'aiming-posts'],
    },
    {
      id: 'repeat', term: 'Repeat',
      short: 'Fire the same number of rounds again (with any corrections given).',
      body: ['Used during fire for effect when the effect was insufficient, or after a lost round.'],
      see: ['fire-for-effect', 'lost'],
    },
    {
      id: 'sector-of-fire', term: 'Sector of fire',
      short: 'The arc (left and right limits) the mortar is allowed to fire into.',
      body: ['Drawn as dashed blue lines from the mortar. Firing outside it is a safety violation.'],
      see: ['azimuth-of-fire', 'check-firing'],
    },
    {
      id: 'shift', term: 'Shift from a known point',
      short: 'Target located as a shift (left/right, add/drop, up/down) from a known point, along the observer\'s direction.',
      body: ['Centre the target grid on the known point, orient it to the (grid) direction and count off the shift; then measure the new point from the mortar.'],
      see: ['known-point', 'target-grid', 'correction'],
    },
    {
      id: 'shot-splash', term: 'Shot / Splash',
      short: '"Shot": rounds fired. "Splash": impact in about 5 seconds — the observer watches for the burst.',
      body: [],
      see: ['time-of-flight'],
    },
    {
      id: 'spot-height', term: 'Spot height',
      short: 'A dot with a height in metres, usually on a hilltop.',
      body: [],
      see: ['contour'],
    },
    {
      id: 'standard-conditions', term: 'Standard conditions',
      short: 'The conditions the firing table is computed for: no wind, air 15 °C, density 100 %, propellant 21 °C, target at the mortar\'s height.',
      body: ['Any deviation changes where the round falls; correct with the firing table\'s correction columns.'],
      see: ['firing-table', 'met-message', 'vi'],
    },
    {
      id: 'target-grid', term: 'Target grid',
      short: 'Plotting tool: a 100 m grid oriented to the OT direction, centred on the previous aim point.',
      body: ['Lets you count the observer\'s corrections (or a shift) directly in the observer\'s frame, then measure the new point with the range arm.'],
      see: ['ot-line', 'correction', 'range-arm'],
    },
    {
      id: 'target-number', term: 'Target number',
      short: 'Identifier the FDC assigns to a target (e.g. AB1001) for reference in later messages.',
      body: [],
      see: ['call-for-fire'],
    },
    {
      id: 'time-of-flight', term: 'Time of flight (TOF)',
      short: 'Seconds from firing to impact.',
      body: ['High-angle mortar rounds take 10–50 s. "Splash" is sent about 5 seconds before impact.'],
      see: ['shot-splash', 'max-ord'],
    },
    {
      id: 'vi', term: 'VI (vertical interval)',
      short: 'Target altitude minus mortar altitude.',
      body: ['The firing table assumes VI = 0. A higher target meets the descending round earlier, so it falls short. Corrected range = map range − (VI ÷ 10) × the table\'s "target 10 m higher" value; then look up the elevation for the corrected range.', 'Example: range 2400 m, VI +80 m, table value −4.0 → 2400 − 8 × (−4.0) = 2432 m.'],
      see: ['firing-table', 'contour', 'standard-conditions'],
    },
  ];

  const byId = new Map(TERMS.map((t) => [t.id, t]));

  class GlossaryPanel {
    constructor(root) {
      this.root = root;
      this.list = root.querySelector('#glossary-list');
      this.search = root.querySelector('#glossary-search');
      this.search.addEventListener('input', () => this.render());
      root.querySelector('#glossary-close').addEventListener('click', () => this.hide());
      this.render();

      // Any [data-term] element in the page: hover = short definition, click = open the entry.
      document.addEventListener('mouseover', (ev) => {
        const el = ev.target.closest && ev.target.closest('[data-term]');
        if (el && !el.title) {
          const t = byId.get(el.dataset.term);
          if (t) el.title = `${t.term}: ${t.short} (click for more)`;
        }
      });
      document.addEventListener('click', (ev) => {
        const el = ev.target.closest && ev.target.closest('[data-term]');
        if (!el || el.closest('#glossary')) return;
        if (!byId.has(el.dataset.term)) return;
        ev.preventDefault();
        this.open(el.dataset.term);
      });
    }

    get visible() {
      return !this.root.hidden;
    }

    show() {
      this.root.hidden = false;
      if (this.onToggle) this.onToggle(true);
    }

    hide() {
      this.root.hidden = true;
      if (this.onToggle) this.onToggle(false);
    }

    toggle() {
      if (this.visible) this.hide();
      else {
        this.show();
        this.search.focus();
      }
    }

    // Opens the panel with one entry expanded and in view.
    open(id) {
      this.search.value = '';
      this.render();
      this.show();
      const d = this.list.querySelector(`details[data-id="${id}"]`);
      if (d) {
        d.open = true;
        d.scrollIntoView({ block: 'start' });
        d.classList.add('flash');
        setTimeout(() => d.classList.remove('flash'), 1200);
      }
    }

    render() {
      const q = this.search.value.trim().toLowerCase();
      const items = TERMS
        .filter((t) => !q || t.term.toLowerCase().includes(q) || t.short.toLowerCase().includes(q))
        .sort((a, b) => a.term.localeCompare(b.term));
      this.list.replaceChildren();
      for (const t of items) {
        const d = document.createElement('details');
        d.dataset.id = t.id;
        const s = document.createElement('summary');
        s.textContent = t.term;
        const short = document.createElement('p');
        short.className = 'gl-short';
        short.textContent = t.short;
        d.append(s, short);
        for (const para of t.body) {
          const p = document.createElement('p');
          p.textContent = para;
          d.append(p);
        }
        if (t.see.length) {
          const p = document.createElement('p');
          p.className = 'gl-see';
          p.append('See also: ');
          t.see.forEach((id, i) => {
            const ref = byId.get(id);
            if (!ref) return;
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = ref.term;
            a.addEventListener('click', (ev) => {
              ev.preventDefault();
              this.open(id);
            });
            if (i) p.append(', ');
            p.append(a);
          });
          d.append(p);
        }
        this.list.append(d);
      }
      if (!items.length) {
        const p = document.createElement('p');
        p.className = 'muted small';
        p.textContent = 'No matching terms.';
        this.list.append(p);
      }
    }
  }

  // Radio procedure words linked to glossary entries.
  const RADIO_TERMS = [
    [/adjust fire/i, 'adjust-fire'],
    [/fire for effect/i, 'fire-for-effect'],
    [/\bpolar\b/i, 'polar-mission'],
    [/\bshift\b/i, 'shift'],
    [/direction( magnetic)?/i, 'direction'],
    [/\b(shot|splash)\b/i, 'shot-splash'],
    [/\brepeat\b/i, 'repeat'],
    [/\blost\b/i, 'lost'],
    [/end of mission/i, 'end-of-mission'],
    [/target number/i, 'target-number'],
    [/check firing/i, 'check-firing'],
  ];

  // Appends `text` to `parent`, wrapping procedure words in glossary links.
  function linkRadioText(parent, text) {
    let rest = text;
    while (rest) {
      let best = null;
      for (const [re, id] of RADIO_TERMS) {
        const m = re.exec(rest);
        if (m && (!best || m.index < best.index)) best = { index: m.index, len: m[0].length, id };
      }
      if (!best) {
        parent.append(rest);
        break;
      }
      if (best.index) parent.append(rest.slice(0, best.index));
      const span = document.createElement('span');
      span.className = 'term';
      span.dataset.term = best.id;
      span.textContent = rest.slice(best.index, best.index + best.len);
      parent.append(span);
      rest = rest.slice(best.index + best.len);
    }
  }

  GL.GLOSSARY = TERMS;
  GL.GlossaryPanel = GlossaryPanel;
  GL.linkRadioText = linkRadioText;
})((window.GL = window.GL || {}));
