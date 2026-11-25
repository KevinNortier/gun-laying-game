// Map themes (biomes): which features a map can have, how common they are, and how they look.
// Not every theme has every feature: deserts have no marsh or woods, boreal maps few roads, etc.
(function (GL) {
  'use strict';

  const THEMES = {
    temperate: {
      label: 'Temperate',
      ground: [247, 243, 229],
      relief: { scale: 6500, amp: 230, regional: 130, ridged: 0 },
      waterFrac: 0.04, // share of the map below lake level
      wood: { frac: 0.3, color: [205, 228, 178], kind: 'mixed', height: 15 },
      marsh: { frac: 0.45, lowQuantile: 0.2, maxSlope: 0.05 },
      rock: { slope: 0.6 },
      rivers: { minAcc: 28, intermittent: false, ponds: true, lakeFill: 0.35 },
      settlements: { spacing: 4500, prob: 0.75, townFrac: 0.06, hamletFrac: 0.35 },
      roads: { k: 3, maxDist: 9000, trackOnly: false },
      names: 'temperate',
    },
    boreal: {
      label: 'Boreal',
      ground: [246, 244, 236],
      relief: { scale: 5000, amp: 150, regional: 90, ridged: 0 },
      waterFrac: 0.11,
      wood: { frac: 0.62, color: [189, 219, 186], kind: 'conifer', height: 18 },
      observerEye: 14, // raised observation post above the forest
      marsh: { frac: 0.7, lowQuantile: 0.35, maxSlope: 0.06 },
      rock: { slope: 0.5 },
      rivers: { minAcc: 20, intermittent: false, ponds: true, lakeFill: 0.6 },
      settlements: { spacing: 9000, prob: 0.5, townFrac: 0.03, hamletFrac: 0.55 },
      roads: { k: 2, maxDist: 16000, trackOnly: false },
      names: 'boreal',
    },
    arid: {
      label: 'Arid',
      ground: [243, 232, 206],
      relief: { scale: 8000, amp: 200, regional: 160, ridged: 0.25 },
      waterFrac: 0,
      wood: null,
      marsh: null,
      sand: { frac: 0.3, maxSlope: 0.12 },
      scrub: { frac: 0.18 },
      rock: { slope: 0.16 },
      rivers: { minAcc: 45, intermittent: true, ponds: false },
      settlements: { spacing: 12000, prob: 0.45, townFrac: 0.08, hamletFrac: 0.5 },
      roads: { k: 2, maxDist: 22000, trackOnly: true },
      names: 'arid',
    },
    mountain: {
      label: 'Mountain',
      ground: [247, 244, 236],
      relief: { scale: 7000, amp: 900, regional: 450, ridged: 0.6 },
      waterFrac: 0.02,
      wood: { frac: 0.5, color: [196, 224, 184], kind: 'conifer', height: 18, treeline: 0.62 },
      marsh: null,
      rock: { slope: 0.45, aboveTreeline: 70 },
      rivers: { minAcc: 15, intermittent: false, ponds: true, lakeFill: 0.2 },
      settlements: { spacing: 6000, prob: 0.6, townFrac: 0.04, hamletFrac: 0.45, maxQuantile: 0.4 },
      roads: { k: 2, maxDist: 10000, trackOnly: false, slopeCost: 2 },
      names: 'mountain',
    },
  };

  // Fictional place names from syllables, flavoured per theme. Deterministic per seed.
  const SYLLABLES = {
    temperate: {
      a: ['Ald', 'Bern', 'Ebers', 'Hal', 'Kirch', 'Lind', 'Mar', 'Ost', 'Ried', 'Stein', 'Wald', 'Wil', 'Rot', 'Hoh', 'Grün'],
      b: ['', 'en', 'el', 'er', 'ing'],
      c: ['bach', 'berg', 'dorf', 'feld', 'hausen', 'heim', 'stett', 'au', 'brück', 'hof'],
    },
    boreal: {
      a: ['Aur', 'Björ', 'Elk', 'Fjäl', 'Hol', 'Kal', 'Lun', 'Mor', 'Ny', 'Sjö', 'Tall', 'Var', 'Ål', 'Rød', 'Sval'],
      b: ['', 'a', 'e', 'ar', 'is'],
      c: ['by', 'vik', 'myr', 'tjärn', 'mark', 'ås', 'dal', 'näs', 'holm', 'berg'],
    },
    arid: {
      a: ['Al', 'Bir', 'Dar', 'Ham', 'Jab', 'Kas', 'Mar', 'Nah', 'Qar', 'Ras', 'Sab', 'Tel', 'Wad', 'Zar', 'Ain'],
      b: ['', 'a', 'i', 'u', 'el'],
      c: ['ada', 'abad', 'ira', 'oun', 'ash', 'iya', 'tan', 'mir', 'qal', 'ur'],
    },
    mountain: {
      a: ['Ober', 'Unter', 'Alp', 'Fels', 'Gams', 'Hoch', 'Kar', 'Lär', 'Matt', 'Schwarz', 'Sankt ', 'Tann', 'Weiß', 'Zirl', 'Brun'],
      b: ['', 'en', 'el', 'er', 'eck'],
      c: ['alm', 'tal', 'egg', 'joch', 'wand', 'kopf', 'stein', 'grund', 'boden', 'au'],
    },
  };

  function nameGenerator(kind, rand) {
    const s = SYLLABLES[kind] || SYLLABLES.temperate;
    const used = new Set();
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    return function next() {
      for (let i = 0; i < 50; i++) {
        const a = pick(s.a);
        // Two-word prefixes ("Sankt ") take a capitalised second word.
        let name = a.endsWith(' ') ? a + pick(s.a).trim() + pick(s.c) : a + pick(s.b) + pick(s.c);
        name = name.replace(/(.)\1\1/g, '$1$1');
        name = name[0].toUpperCase() + name.slice(1);
        if (!used.has(name)) {
          used.add(name);
          return name;
        }
      }
      return pick(s.a) + pick(s.c) + ' ' + (used.size + 1);
    };
  }

  function pickTheme(seed, requested) {
    if (requested && THEMES[requested]) return requested;
    const keys = Object.keys(THEMES);
    return keys[GL.hashSeed(String(seed) + '/theme') % keys.length];
  }

  GL.THEMES = THEMES;
  GL.pickTheme = pickTheme;
  GL.nameGenerator = nameGenerator;
})((window.GL = window.GL || {}));
