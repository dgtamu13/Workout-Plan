// The lifting program as data: the built-in default, validation, and conversion to the rows the app renders.
// The app prefers the `config/program` document in the sync store whenever one exists and validates; BUILTIN is the
// fallback and the seed. The format is documented in PROGRAM_SCHEMA.md.
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib; else root.ProgramLib = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  const BUILTIN = {
    version: 1,
    source: "built-in",
    sessions: {
      "PUSH A": { exercises: [
        {"name":"Incline DB Press","muscleGroup":["Chest"],"role":"compound","sets":4,"reps":{"low":10,"high":15},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"upper","cue":"30–45° bench, 3 sec eccentric, 1 sec squeeze"},
        {"name":"Cable Lateral Raise","muscleGroup":["Shoulders"],"role":"isolation","sets":4,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","methods":["Drop Set"],"cue":"Lead with the elbow; drop set (−30%) on the last set"},
        {"name":"Pec Deck / Cable Fly","muscleGroup":["Chest"],"role":"isolation","sets":3,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Full stretch, 1 sec peak squeeze"},
        {"name":"Machine Shoulder Press","muscleGroup":["Shoulders"],"role":"compound","sets":3,"reps":{"low":12,"high":15},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"upper","cue":"3 sec eccentric, no shrug"},
        {"name":"Overhead Cable Extension","muscleGroup":["Triceps"],"role":"isolation","sets":3,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Cable overhead extension: full stretch, elbows in"},
        {"name":"Tricep Pushdown","muscleGroup":["Triceps"],"role":"isolation","sets":3,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Rope; flare the handles at the bottom"},
        {"name":"Face Pulls","muscleGroup":["Shoulders"],"role":"isolation","sets":2,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Rope to forehead, external rotation"}
      ] },
      "PULL A": { exercises: [
        {"name":"Lat Pulldown","muscleGroup":["Back"],"role":"compound","sets":4,"reps":{"low":10,"high":15},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Wide overhand grip; full stretch at the top, pull to upper chest"},
        {"name":"Seated Cable Row","muscleGroup":["Back"],"role":"compound","sets":4,"reps":{"low":12,"high":15},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Wide grip, elbows flared, squeeze the scapulae"},
        {"name":"Single-Arm DB Row","muscleGroup":["Back"],"role":"compound","sets":3,"reps":{"low":12,"high":15},"perSide":"arm","rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Full reach at the bottom, row to the hip"},
        {"name":"Cable Rear Delt Fly","muscleGroup":["Shoulders"],"role":"isolation","sets":3,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Single arm at head height, wide arc"},
        {"name":"Face Pulls","muscleGroup":["Shoulders"],"role":"isolation","sets":3,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Two days a week minimum"},
        {"name":"Incline DB Curl","muscleGroup":["Biceps"],"role":"isolation","sets":3,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Full stretch, supinate at the top"},
        {"name":"Cable Curl","muscleGroup":["Biceps"],"role":"isolation","sets":3,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Supinated grip, full ROM, 3 sec eccentric"}
      ] },
      "LEGS A": { exercises: [
        {"name":"Leg Press","muscleGroup":["Quads","Glutes"],"role":"compound","sets":4,"reps":{"low":12,"high":15},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Mid-platform, full ROM, controlled descent"},
        {"name":"Romanian Deadlift","muscleGroup":["Back","Hamstrings"],"role":"compound","sets":3,"reps":{"low":10,"high":12},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Hips back, 3 sec eccentric"},
        {"name":"Walking Lunges","muscleGroup":["Quads","Glutes"],"role":"compound","sets":3,"reps":{"low":15,"high":15},"perSide":"leg","rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Hold dumbbells; long stride, stay upright"},
        {"name":"Leg Curl","muscleGroup":["Hamstrings"],"role":"isolation","sets":4,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Seated; 1 sec peak, 3 sec eccentric"},
        {"name":"Bulgarian Split Squat","muscleGroup":["Quads","Glutes"],"role":"compound","sets":3,"reps":{"low":10,"high":12},"perSide":"leg","rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Hold dumbbells; shin vertical, full depth"},
        {"name":"Standing Calf Raise","muscleGroup":["Calves"],"role":"isolation","sets":4,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Pause 1 sec at the top and bottom"},
        {"name":"Seated Calf Raise","muscleGroup":["Calves"],"role":"isolation","sets":3,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Full stretch, soleus emphasis"}
      ] },
      "PUSH B": { exercises: [
        {"name":"Barbell Bench Press","muscleGroup":["Chest","Triceps"],"role":"primary","sets":5,"reps":{"low":3,"high":5},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Full ROM, bar to chest"},
        {"name":"Standing OHP","muscleGroup":["Shoulders"],"role":"primary","sets":4,"reps":{"low":4,"high":6},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Strict, no leg drive"},
        {"name":"Weighted Dips","muscleGroup":["Chest","Triceps"],"role":"secondary","sets":3,"reps":{"low":5,"high":6},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Forward lean"},
        {"name":"Skull Crushers","muscleGroup":["Triceps"],"role":"secondary","sets":3,"reps":{"low":6,"high":8},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"upper","cue":"EZ bar to the forehead, elbows in"},
        {"name":"DB Shoulder Press","muscleGroup":["Shoulders"],"role":"secondary","sets":3,"reps":{"low":6,"high":8},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Neutral grip is fine"}
      ] },
      "PULL B": { exercises: [
        {"name":"Conventional Deadlift","muscleGroup":["Back","Hamstrings"],"role":"primary","sets":4,"reps":{"low":3,"high":5},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"lower","cue":"Brace hard, bar stays on the legs"},
        {"name":"Barbell Bent-Over Row","muscleGroup":["Back"],"role":"primary","sets":4,"reps":{"low":4,"high":6},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Overhand grip, 45° torso, 2 sec eccentric"},
        {"name":"Weighted Pull-Ups","muscleGroup":["Back"],"role":"primary","sets":4,"reps":{"low":4,"high":6},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Dead hang, full extension"},
        {"name":"Barbell Curl","muscleGroup":["Biceps"],"role":"secondary","sets":3,"reps":{"low":6,"high":8},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Strict, 2 sec eccentric"},
        {"name":"Alternating Hammer Curl","muscleGroup":["Biceps"],"role":"secondary","sets":3,"reps":{"low":8,"high":10},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Neutral grip, full ROM"}
      ] },
      "LEGS B": { exercises: [
        {"name":"Back Squat","muscleGroup":["Quads","Glutes"],"role":"primary","sets":5,"reps":{"low":3,"high":5},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"lower","cue":"High bar, break parallel"},
        {"name":"Front Squat","muscleGroup":["Quads"],"role":"primary","sets":3,"reps":{"low":4,"high":5},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"lower","cue":"Elbows high, stay upright (goblet squat if needed)"},
        {"name":"Hip Thrust","muscleGroup":["Glutes"],"role":"secondary","sets":4,"reps":{"low":6,"high":8},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"lower","cue":"Barbell; 1 sec squeeze at the top"},
        {"name":"Lying Leg Curl","muscleGroup":["Hamstrings"],"role":"secondary","sets":3,"reps":{"low":6,"high":8},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"lower","cue":"3–4 sec eccentric"},
        {"name":"Deficit RDL","muscleGroup":["Hamstrings","Glutes"],"role":"secondary","sets":3,"reps":{"low":5,"high":6},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"lower","cue":"2 in. deficit, deep hinge"}
      ] }
    },
    core: { circuits: {
      A: { sessions: ["PUSH A","PUSH B"], exercises: [
        {"name":"Cable Crunch","sets":3,"target":"15 reps"},
        {"name":"Hanging Leg Raise","sets":3,"target":"15 reps"},
        {"name":"Serratus Punch (cable)","sets":3,"target":"15/side"},
        {"name":"Plank w/ Shoulder Tap","sets":3,"target":"12/side"}
      ] },
      B: { sessions: ["PULL A","PULL B"], exercises: [
        {"name":"Landmine Rotation","sets":3,"target":"12/side"},
        {"name":"Cable Woodchop","sets":3,"target":"12/side"},
        {"name":"Side Plank w/ Hip Dip","sets":3,"target":"10/side"},
        {"name":"Pallof Press","sets":3,"target":"12 reps"}
      ] },
      C: { sessions: ["LEGS A","LEGS B"], exercises: [
        {"name":"Hanging Tuck-to-Straight Leg Raise","sets":3,"target":"12 reps"},
        {"name":"Ab Wheel","sets":3,"target":"12 reps"},
        {"name":"Dead Bug","sets":3,"target":"10/side"},
        {"name":"Dragon Flag Negative","sets":3,"target":"5 reps"}
      ] }
    } },
    cardio: { sessions: {
      "PUSH A": {"type":"HIIT","machine":"Rower","alternatives":["Treadmill","Stationary Bike","Stair Master"],"rounds":10,"workSec":30,"restSec":30,"targetAvgWatts":null},
      "PULL A": {"type":"HIIT","machine":"Treadmill","alternatives":["Rower","Stationary Bike","Stair Master"],"rounds":10,"workSec":40,"restSec":20,"targetAvgWatts":null},
      "LEGS A": {"type":"Zone 2","machine":"Stationary Bike","alternatives":["Treadmill","Rower","Stair Master"],"durationMin":30,"hrLow":136,"hrHigh":148},
      "PUSH B": {"type":"Zone 2","machine":"Treadmill","alternatives":["Stationary Bike","Rower","Stair Master"],"durationMin":25,"hrLow":136,"hrHigh":148},
      "PULL B": {"type":"Zone 2","machine":"Treadmill","alternatives":["Stationary Bike","Rower","Stair Master"],"durationMin":25,"hrLow":136,"hrHigh":148},
      "LEGS B": {"type":"Zone 2","machine":"Stationary Bike","alternatives":["Treadmill","Rower","Stair Master"],"durationMin":25,"hrLow":136,"hrHigh":148}
    } },
  };

  // ── Validation ─────────────────────────────────────────────────────
  const SESSIONS = ['PUSH A', 'PULL A', 'LEGS A', 'PUSH B', 'PULL B', 'LEGS B'];
  const SOURCES = ['built-in', 'agent', 'manual'];
  const ROLES = { compound: 'C', primary: 'P', secondary: 'S', isolation: 'I' };
  const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const range = (v, lo, hi) => isObj(v) && isInt(v.low, lo, hi) && isInt(v.high, lo, hi) && v.low <= v.high;
  const str = v => typeof v === 'string' && v.trim().length > 0;

  // Returns a list of problems (empty when the document is usable).
  function validate(doc) {
    const errs = [], bad = (path, msg) => errs.push(`${path}: ${msg}`);
    if (!isObj(doc)) return ['program: must be an object'];
    if (!isInt(doc.version, 1, 1e9)) bad('version', 'must be a whole number, 1 or more');
    if (!SOURCES.includes(doc.source)) bad('source', 'must be "built-in", "agent" or "manual"');
    if (!isObj(doc.sessions)) bad('sessions', 'must be an object');
    else {
      for (const s of SESSIONS) {
        const sec = doc.sessions[s], p = `sessions["${s}"]`;
        if (!isObj(sec) || !Array.isArray(sec.exercises) || !sec.exercises.length) { bad(p, 'needs a non-empty "exercises" list'); continue; }
        sec.exercises.forEach((e, i) => {
          const q = `${p}.exercises[${i}]`;
          if (!isObj(e)) return bad(q, 'must be an object');
          if (!str(e.name)) bad(q + '.name', 'required');
          if (!(Array.isArray(e.muscleGroup) ? e.muscleGroup.length >= 1 && e.muscleGroup.length <= 2 && e.muscleGroup.every(str) : str(e.muscleGroup))) bad(q + '.muscleGroup', 'one or two group names');
          if (!isInt(e.sets, 1, 20)) bad(q + '.sets', 'whole number 1–20');
          if (!range(e.reps, 1, 100)) bad(q + '.reps', '{ "low", "high" } with low <= high');
          if (!range(e.rir, 0, 10)) bad(q + '.rir', '{ "low", "high" } with low <= high');
          if (!(isInt(e.restSec, 0, 1800) || range(e.restSec, 0, 1800))) bad(q + '.restSec', 'seconds, or { "low", "high" }');
          if (e.progression !== 'upper' && e.progression !== 'lower') bad(q + '.progression', 'must be "upper" or "lower"');
          if (e.methods !== undefined && !(Array.isArray(e.methods) && e.methods.every(str))) bad(q + '.methods', 'must be a list of text tags');
          if (e.role !== undefined && !(e.role in ROLES)) bad(q + '.role', 'must be compound, primary, secondary or isolation');
          if (e.perSide !== undefined && e.perSide !== 'arm' && e.perSide !== 'leg') bad(q + '.perSide', 'must be "arm" or "leg"');
          if (e.cue !== undefined && typeof e.cue !== 'string') bad(q + '.cue', 'must be text');
        });
      }
      for (const s of Object.keys(doc.sessions)) if (!SESSIONS.includes(s)) bad(`sessions["${s}"]`, 'unknown session');
    }
    const circ = doc.core && doc.core.circuits;
    if (!isObj(circ)) bad('core.circuits', 'must be an object with circuits A, B and C');
    else {
      const seen = new Set();
      for (const c of ['A', 'B', 'C']) {
        const x = circ[c], p = `core.circuits.${c}`;
        if (!isObj(x)) { bad(p, 'required'); continue; }
        if (!Array.isArray(x.sessions) || !x.sessions.length || !x.sessions.every(s => SESSIONS.includes(s))) bad(p + '.sessions', 'list of session names');
        else x.sessions.forEach(s => { if (seen.has(s)) bad(p + '.sessions', `${s} is in more than one circuit`); seen.add(s); });
        if (!Array.isArray(x.exercises) || !x.exercises.length) bad(p + '.exercises', 'non-empty list');
        else x.exercises.forEach((e, i) => {
          if (!isObj(e) || !str(e.name) || !isInt(e.sets, 1, 20) || !str(e.target)) bad(`${p}.exercises[${i}]`, 'needs name, sets (whole number) and target (text such as "15 reps" or "12/side")');
        });
      }
      for (const s of SESSIONS) if (!seen.has(s)) bad('core.circuits', `${s} is not assigned to a circuit`);
    }
    const cs = doc.cardio && doc.cardio.sessions;
    if (!isObj(cs)) bad('cardio.sessions', 'must be an object');
    else for (const s of SESSIONS) {
      const c = cs[s], p = `cardio.sessions["${s}"]`;
      if (!isObj(c)) { bad(p, 'required'); continue; }
      if (!str(c.machine)) bad(p + '.machine', 'required');
      if (c.alternatives !== undefined && !(Array.isArray(c.alternatives) && c.alternatives.every(str))) bad(p + '.alternatives', 'list of machine names');
      if (c.type === 'HIIT') {
        if (!isInt(c.rounds, 1, 40)) bad(p + '.rounds', 'whole number 1–40');
        if (!isInt(c.workSec, 5, 600)) bad(p + '.workSec', 'seconds, 5–600');
        if (!isInt(c.restSec, 0, 600)) bad(p + '.restSec', 'seconds, 0–600');
        if (c.targetAvgWatts != null && !(typeof c.targetAvgWatts === 'number' && c.targetAvgWatts > 0 && c.targetAvgWatts < 2000)) bad(p + '.targetAvgWatts', 'watts, or null');
      } else if (c.type === 'Zone 2') {
        if (!isInt(c.durationMin, 5, 240)) bad(p + '.durationMin', 'minutes, 5–240');
        if (!isInt(c.hrLow, 60, 220) || !isInt(c.hrHigh, 60, 220) || c.hrLow > c.hrHigh) bad(p + '.hrLow/hrHigh', 'heart rates in bpm with hrLow <= hrHigh');
      } else bad(p + '.type', 'must be "HIIT" or "Zone 2"');
    }
    return errs;
  }

  // ── Conversion to the row structures the app renders from ──────────
  const fmtRest = r => {
    const lo = isObj(r) ? r.low : r, hi = isObj(r) ? r.high : r;
    const min = n => n >= 120 && n % 60 === 0;
    if (min(lo) && min(hi)) return lo === hi ? `${lo / 60} min` : `${lo / 60}–${hi / 60} min`;
    return lo === hi ? `${lo} sec` : `${lo}–${hi} sec`;
  };
  const fmtRange = (r, suffix) => (r.low === r.high ? `${r.low}` : `${r.low}–${r.high}`) + (suffix ? '/' + suffix : '');
  const groups = e => (Array.isArray(e.muscleGroup) ? e.muscleGroup : [e.muscleGroup]).slice(0, 2);

  // [name, method, sets, reps, rest, cue, kind] per session, as the app has always used them.
  function liftTables(doc) {
    const out = {};
    for (const s of SESSIONS) out[s] = doc.sessions[s].exercises.map(e => [
      e.name,
      e.methods && e.methods.length ? e.methods.join(' + ') : `RIR ${fmtRange(e.rir)}`,
      String(e.sets), fmtRange(e.reps, e.perSide), fmtRest(e.restSec), e.cue || '', ROLES[e.role || 'compound'],
    ]);
    return out;
  }
  // [name, sets, target] per session.
  function coreTables(doc) {
    const out = {};
    for (const c of Object.values(doc.core.circuits)) for (const s of c.sessions) out[s] = c.exercises.map(e => [e.name, String(e.sets), e.target]);
    return out;
  }
  const HIIT_NOTE = 'Work intervals in Zone 4–5 (160–185 bpm); rest intervals back to Zone 2–3 (136–155 bpm).';
  const MACHINES = ['Treadmill', 'Stationary Bike', 'Rower', 'Stair Master'];
  function cardioTables(doc) {
    const out = {};
    for (const s of SESSIONS) {
      const c = doc.cardio.sessions[s], alts = c.alternatives || MACHINES.filter(m => m !== c.machine);
      if (c.type === 'HIIT') {
        out[s] = { type: 'HIIT', duration: c.rounds + 5, rounds: c.rounds, maxRounds: c.rounds, recommended: c.machine, alts, workSec: c.workSec, restSec: c.restSec, targetAvgWatts: c.targetAvgWatts ?? null, protocol: `${c.workSec} sec on / ${c.restSec} sec off`, note: HIIT_NOTE };
      } else {
        out[s] = { type: 'Zone 2', duration: c.durationMin, recommended: c.machine, alts, note: `Full-sentence pace: incline treadmill 3.5–4 mph at 8–10%, or bike. Hold ${c.hrLow}–${c.hrHigh} bpm.` };
      }
    }
    return out;
  }
  function zone2(doc) {
    const z = Object.values(doc.cardio.sessions).find(c => c.type === 'Zone 2');
    return z ? [z.hrLow, z.hrHigh] : [136, 148];
  }
  // name -> { progression, muscleGroup } across every session (first entry wins).
  function exerciseIndex(doc) {
    const idx = {};
    for (const s of SESSIONS) for (const e of doc.sessions[s].exercises) (idx[e.name] ||= { progression: e.progression, muscleGroup: groups(e) });
    return idx;
  }
  const bySession = (doc, s, name) => (doc.sessions[s] || { exercises: [] }).exercises.find(e => e.name === name);

  // A sample document is safe to import: accept it only when it validates, with `built` giving the derived tables.
  function build(doc) {
    const errors = validate(doc);
    if (errors.length) return { ok: false, errors };
    return { ok: true, doc, lifting: liftTables(doc), core: coreTables(doc), cardio: cardioTables(doc), z2: zone2(doc), index: exerciseIndex(doc) };
  }
  // Label stored on workouts and drafts so records say which program built them: "b1" built-in v1, "a3" agent v3, "m2" manual v2.
  const tag = doc => `${doc.source[0]}${doc.version}`;

  return { BUILTIN, SESSIONS, validate, build, tag, liftTables, coreTables, cardioTables, zone2, bySession, fmtRest };
});
