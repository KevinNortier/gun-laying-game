// Sidebar UI: mission status and clock, radio log, fire command form, score card.
(function (GL) {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function mmss(sec) {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  class MissionUI {
    constructor() {
      this.manager = null;
      this._radioCount = 0;

      const typeSel = $('mission-type');
      for (const [key, t] of Object.entries(GL.MISSION_TYPES)) {
        const o = document.createElement('option');
        o.value = key;
        o.textContent = t.label;
        typeSel.append(o);
      }

      $('btn-mission').addEventListener('click', () => {
        const mm = this.manager;
        if (!mm) return;
        if (mm.state === 'idle' || mm.state === 'complete') mm.start(typeSel.value, { met: $('opt-met').checked });
        else if (confirm('End this mission without effect on target?')) mm.end();
      });
      $('btn-skip').addEventListener('click', () => this.manager && this.manager.skip());

      $('fire-form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const mm = this.manager;
        if (!mm) return;
        const res = mm.fire({
          charge: $('f-charge').value,
          deflection: $('f-defl').value === '' ? NaN : $('f-defl').value,
          elevation: $('f-elev').value === '' ? NaN : $('f-elev').value,
          rounds: $('f-rounds').value,
        });
        const msg = $('fire-msg');
        msg.textContent = res.error || '';
        msg.classList.toggle('error', !!res.error);
      });
    }

    setManager(mm) {
      this.manager = mm;
      this._radioCount = 0;
      $('radio-log').replaceChildren();
      const sc = mm.scenario;
      const G = GL.Geo;
      $('laid-info').textContent =
        `Laid on azimuth of fire ${G.fmtMils(sc.azimuthOfFire)} with referred deflection ${sc.referredDeflection}. ` +
        `Sector L ${G.fmtMils(sc.sector.left)} – R ${G.fmtMils(sc.sector.right)}.`;
      const sel = $('f-charge');
      sel.replaceChildren();
      for (const c of sc.weapon.charges) {
        const o = document.createElement('option');
        o.value = String(c.charge);
        o.textContent = String(c.charge);
        sel.append(o);
      }
      this.render();
    }

    render() {
      const mm = this.manager;
      if (!mm) return;
      const m = mm.mission;
      const btn = $('btn-mission');
      const status = $('mission-status');
      const busy = mm.state === 'receiving' || mm.state === 'ready' || mm.state === 'firing';
      btn.textContent = busy ? 'End mission' : 'New mission';
      $('mission-type').disabled = busy;
      $('opt-met').disabled = busy;
      this.renderMet();
      if (!m) status.textContent = 'No mission. Press New mission to receive a call for fire.';
      else if (mm.state === 'receiving') status.textContent = `Receiving call for fire…`;
      else if (mm.state === 'ready') {
        status.textContent = m.phase === 'ffe'
          ? `Target ${m.number}: FIRE FOR EFFECT — fire 3–4 rounds.`
          : `Target ${m.number}: adjusting — fire one round.`;
      }
      else if (mm.state === 'firing') status.textContent = `Target ${m.number}: rounds in flight.`;
      else status.textContent = `Target ${m.number}: mission ${m.result === 'effective' ? 'complete' : 'ended'}.`;

      $('btn-fire').disabled = mm.state !== 'ready';
      this.renderRadio();
      this.renderClock();
      this.renderScore();
      // The score card can shrink the radio panel; keep the latest message in view.
      const log = $('radio-log');
      log.scrollTop = log.scrollHeight;
    }

    renderMet() {
      const mm = this.manager;
      const wx = mm.mission && mm.mission.weather;
      $('met-panel').hidden = !wx;
      if (!wx) return;
      const met = wx.met;
      const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
      const rows = [
        ['Wind from', `${GL.Geo.fmtMils(met.windFrom)} mils (grid)`],
        ['Wind speed', `${met.windSpeed} m/s`],
        ['Air temperature', `${signed(met.airTemp)} °C`],
        ['Air density', `${met.density.toFixed(1)} %`],
        ['Propellant temp', `${signed(met.propTemp)} °C`],
      ];
      const dl = $('met-body');
      dl.replaceChildren();
      for (const [k, v] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        dl.append(dt, dd);
      }
    }

    renderClock() {
      const mm = this.manager;
      if (!mm) return;
      const m = mm.mission;
      const clock = $('mission-clock');
      if (m && m.startTime !== null) {
        const end = mm.state === 'complete' ? m.effectTime || m.endTime : mm.time;
        clock.textContent = mmss(end - m.startTime);
      } else {
        clock.textContent = '--:--';
      }
      const skip = $('btn-skip');
      const next = mm.nextEventIn();
      const inFlight = mm.state === 'firing' && next !== null;
      skip.hidden = !inFlight;
      if (inFlight) skip.textContent = `Skip ${Math.ceil(next)} s ⏩`;
    }

    renderRadio() {
      const mm = this.manager;
      const log = $('radio-log');
      while (this._radioCount < mm.radio.length) {
        const r = mm.radio[this._radioCount++];
        const li = document.createElement('li');
        li.className = r.from === 'SYS' ? 'sys' : r.from === mm.scenario.gun.label ? 'fdc' : 'fo';
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = r.from === 'SYS' ? '!' : r.from;
        const text = document.createElement('span');
        text.textContent = r.text;
        li.append(who, text);
        log.append(li);
        log.scrollTop = log.scrollHeight;
      }
    }

    renderScore() {
      const mm = this.manager;
      const card = $('score');
      const s = mm.mission && mm.mission.score;
      if (!s || mm.state !== 'complete') {
        card.hidden = true;
        return;
      }
      card.hidden = false;
      const rows = [
        ['Result', s.effective ? 'Effect on target' : 'Ended without effect'],
        ['Time', mmss(s.time)],
        ['Adjusting rounds', String(s.adjustRounds)],
        ['Fire for effect rounds', String(s.ffeRounds)],
        ['First round miss', s.firstMiss === null ? '—' : `${Math.round(s.firstMiss)} m`],
        ['FFE mean miss', s.meanFFE === null ? '—' : `${Math.round(s.meanFFE)} m`],
        ['Target altitude', `${Math.round(s.targetAlt)} m (VI ${s.vi >= 0 ? '+' : '−'}${Math.abs(Math.round(s.vi))} m)`],
        ['Accuracy', String(s.accuracy)],
        ['Economy', String(s.economy)],
        ['Speed', String(s.speed)],
      ];
      if (s.met) {
        const r = Math.round(s.met.rangeCorrection);
        const d = Math.round(s.met.deflCorrection);
        rows.push(['Met correction (range)', `${r >= 0 ? 'add' : 'drop'} ${Math.abs(r)} m`]);
        rows.push(['Met correction (defl)', `${d >= 0 ? 'left' : 'right'} ${Math.abs(d)} mils (${d >= 0 ? '+' : '−'}${Math.abs(d)})`]);
      }
      if (s.penalty) rows.push(['Safety violations', `−${s.penalty}`]);
      rows.push(['Score', String(s.total)]);
      const dl = $('score-body');
      dl.replaceChildren();
      for (const [k, v] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        if (k === 'Score') {
          dt.className = 'total';
          dd.className = 'total';
        }
        dl.append(dt, dd);
      }
    }
  }

  GL.MissionUI = MissionUI;
})((window.GL = window.GL || {}));
