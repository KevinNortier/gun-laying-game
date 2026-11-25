// Training course: stages of increasing difficulty. Each stage is a run of missions; an average
// score at or above the pass mark passes it and unlocks the next. Progress is kept in this browser.
(function (GL) {
  'use strict';

  const KEY = 'gunlaying.course.v1';
  const PER_STAGE = 3;
  const PASS = 700;

  const STAGES = [
    {
      id: 'grid',
      title: 'Grid mission',
      type: 'level',
      met: false,
      brief: 'Adjust fire onto a grid target on level ground: plot, lay, bracket, then fire for effect.',
    },
    {
      id: 'height',
      title: 'Height difference',
      type: 'height',
      met: false,
      brief: 'Laser-located targets above or below the mortar. Correct for VI and get effect with the first volley.',
    },
    {
      id: 'polar',
      title: 'Polar mission',
      type: 'polar',
      met: false,
      brief: 'Magnetic direction and distance from the observer. Convert to grid and plot from T31.',
    },
    {
      id: 'shift',
      title: 'Shift from known point',
      type: 'shift',
      met: false,
      brief: 'Shifts from a known point along the observer\'s magnetic direction. Plot them with the target grid.',
    },
    {
      id: 'met',
      title: 'Met corrections',
      type: 'height',
      met: true,
      brief: 'Fire for effect in non-standard weather. Apply the met message with the firing table.',
    },
    {
      id: 'final',
      title: 'Final qualification',
      type: 'random',
      met: true,
      brief: 'Any mission type, in non-standard weather.',
    },
  ];

  function stars(avg) {
    return avg >= 900 ? 3 : avg >= 800 ? 2 : avg >= PASS ? 1 : 0;
  }

  class Course {
    constructor() {
      this.data = { stages: {}, run: null, selected: 0, mode: 'course' };
      try {
        Object.assign(this.data, JSON.parse(localStorage.getItem(KEY) || '{}'));
      } catch (err) {
        // Storage unavailable: progress lasts for this session only.
      }
    }

    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (err) {
        // Ignore: see constructor.
      }
    }

    get mode() {
      return this.data.mode;
    }

    set mode(m) {
      this.data.mode = m;
      this.save();
    }

    result(i) {
      return this.data.stages[STAGES[i].id] || null; // { best, stars, passed }
    }

    unlocked(i) {
      return i === 0 || !!(this.result(i - 1) && this.result(i - 1).passed);
    }

    get selected() {
      const i = Math.min(this.data.selected || 0, STAGES.length - 1);
      return this.unlocked(i) ? i : 0;
    }

    select(i) {
      if (!this.unlocked(i)) return;
      this.data.selected = i;
      if (this.data.run && this.data.run.stage !== STAGES[i].id) this.data.run = null;
      this.save();
    }

    // Scores so far in the current run of the selected stage.
    get runScores() {
      const run = this.data.run;
      return run && run.stage === STAGES[this.selected].id ? run.scores : [];
    }

    // Mission type and weather for the next mission of the selected stage.
    missionParams(rand = Math.random) {
      const st = STAGES[this.selected];
      let type = st.type;
      if (type === 'random') {
        const types = ['level', 'height', 'polar', 'shift'];
        type = types[Math.floor(rand() * types.length)];
      }
      return { type, met: st.met, stage: st.id };
    }

    // Records a finished mission's score. Returns the stage outcome when the run is complete.
    record(stageId, score) {
      const i = STAGES.findIndex((s) => s.id === stageId);
      if (i < 0) return null;
      if (!this.data.run || this.data.run.stage !== stageId) this.data.run = { stage: stageId, scores: [] };
      this.data.run.scores.push(score);
      const scores = this.data.run.scores;
      if (scores.length < PER_STAGE) {
        this.save();
        return { done: false, count: scores.length, of: PER_STAGE };
      }
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const prev = this.data.stages[stageId];
      const passed = avg >= PASS;
      const unlockedNext = passed && !(prev && prev.passed) && i + 1 < STAGES.length;
      this.data.stages[stageId] = {
        best: Math.max(avg, prev ? prev.best : 0),
        stars: Math.max(stars(avg), prev ? prev.stars : 0),
        passed: passed || !!(prev && prev.passed),
      };
      this.data.run = null;
      if (unlockedNext) this.data.selected = i + 1;
      this.save();
      return { done: true, avg, stars: stars(avg), passed, unlockedNext, next: unlockedNext ? STAGES[i + 1] : null };
    }

    reset() {
      this.data = { stages: {}, run: null, selected: 0, mode: this.data.mode };
      this.save();
    }
  }

  GL.Course = Course;
  GL.COURSE = { STAGES, PER_STAGE, PASS, stars };
})((window.GL = window.GL || {}));
