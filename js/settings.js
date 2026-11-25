// Player settings, remembered in this browser (localStorage; falls back to defaults if unavailable).
(function (GL) {
  'use strict';

  const KEY = 'gunlaying.settings.v1';
  const DEFAULTS = {
    hillshade: true, // relief shading on the map
    readout: true, // cursor grid reference and elevation in the status bar
    autoSkip: false, // fast-forward rounds in flight
    showEnemy: false, // debug: true target and enemy unit positions
    showBursts: false, // debug: where rounds land
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      // Older versions had a single "debug" setting covering both.
      if ('debug' in saved) {
        if (!('showEnemy' in saved)) saved.showEnemy = saved.debug;
        if (!('showBursts' in saved)) saved.showBursts = saved.debug;
        delete saved.debug;
      }
      return { ...DEFAULTS, ...saved };
    } catch (err) {
      return { ...DEFAULTS };
    }
  }

  const values = load();
  const listeners = [];

  GL.Settings = {
    get(key) {
      return values[key];
    },
    set(key, value) {
      values[key] = value;
      try {
        localStorage.setItem(KEY, JSON.stringify(values));
      } catch (err) {
        // Storage unavailable (private window, blocked): keep the value for this session.
      }
      for (const fn of listeners) fn(key, value);
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
})((window.GL = window.GL || {}));
