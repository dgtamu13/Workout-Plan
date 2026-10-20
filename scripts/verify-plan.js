#!/usr/bin/env node
// Verifies the 28-week plan logic in docs/index.html without a browser.
// Loads the program/plan section of the app's script into a VM with a stubbed environment, then checks dates,
// phases, deloads, plan tables and progression. Run with: npm test
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const script = html.match(/<script>\n(\/\/ ═══ Program[\s\S]*?)<\/script>/)[1];
const code = script.slice(0, script.indexOf('// ═══ Muscle groups'));

const ls = {};
const ctx = {
  console, Math, Date, JSON, Object, Array, Set, Map, Number, String, RegExp,
  localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
  location: { hash: '' },
};
vm.createContext(ctx);
vm.runInContext(`
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);
${code}
`, ctx);
// Round-trip through JSON so arrays from the VM compare equal to local ones.
const run = src => { const v = vm.runInContext(src, ctx); return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
const J = v => JSON.stringify(v);

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); }
}
const info = k => run(`programInfo(${J(k)})`);
const addDays = (k, n) => run(`addDays(${J(k)}, ${n})`);
const rows = (s, k) => run(`liftRows(${J(s)}, ${J(k)})`);
const D = n => addDays(weekStart(1), n);
const weekStart = w => addDays('2026-10-14', (w - 1) * 7);
const logLift = (date, name, sets, session = 'PULL B') => run(`workouts[${J(date + '_lift')}] = { date:${J(date)}, type:'lift', session:${J(session)}, exercises:[{ name:${J(name)}, planned:${J(name)}, skipped:false, sets:${J(sets)} }] };`);
const clearLogs = () => run('workouts = {}');
const sets = (w, reps) => reps.map(r => ({ w, r }));

console.log('Dates, rotation, phases');
check('2026-10-14 is Week 1, Day 1, PUSH A, Phase 1', () => {
  const i = info('2026-10-14');
  assert.deepStrictEqual([i.status, i.week, i.day, i.session, i.phase.n, i.deload], ['active', 1, 1, 'PUSH A', 1, false]);
});
check('2026-10-20 is REST; 2026-10-21 is PUSH A in Week 2', () => {
  assert.strictEqual(info('2026-10-20').session, 'REST');
  const i = info('2026-10-21'); assert.strictEqual(i.session, 'PUSH A'); assert.strictEqual(i.week, 2);
});
check('Week 1 rotation matches the table', () => {
  const want = ['PUSH A', 'PULL A', 'LEGS A', 'PUSH B', 'PULL B', 'LEGS B', 'REST'];
  want.forEach((s, d) => assert.strictEqual(info(addDays('2026-10-14', d)).session, s));
});
check('Before Day 1 is not-started; after Week 28 is complete', () => {
  assert.strictEqual(info('2026-10-13').status, 'not-started');
  assert.strictEqual(info('2027-04-27').status, 'active');
  assert.strictEqual(info('2027-04-28').status, 'complete');
  assert.strictEqual(run('plannedSession(new Date(2027, 3, 28))'), null);
  assert.strictEqual(run('plannedSession(new Date(2026, 9, 13))'), null);
});
check('Program ends 2027-04-27 (196 days)', () => {
  assert.strictEqual(run('programEnd()'), '2027-04-27');
  assert.strictEqual(run('PROGRAM_WEEKS * 7'), 196);
});
const PH = [[1, 'Reclaim', '2026-10-14', '2026-11-24'], [2, 'Build', '2026-11-25', '2027-01-19'], [3, 'Lean', '2027-01-20', '2027-03-16'], [4, 'Peak', '2027-03-17', '2027-04-27']];
check('Phase boundaries fall on the table dates', () => {
  PH.forEach(([n, name, from, to]) => {
    assert.strictEqual(info(from).phase.n, n); assert.strictEqual(info(from).phase.name, name);
    assert.strictEqual(info(to).phase.n, n);
    assert.strictEqual(info(addDays(to, 1)).phase.n, n === 4 ? 4 : n + 1);
    assert.strictEqual(info(addDays(from, -1)).phase.n, n === 1 ? 1 : n - 1);
  });
});
const DL = { 6: ['2026-11-18', '2026-11-24'], 13: ['2027-01-06', '2027-01-12'], 20: ['2027-02-24', '2027-03-02'], 27: ['2027-04-14', '2027-04-20'] };
check('Weeks 6 / 13 / 20 / 27 are deloads with the exact date ranges', () => {
  const seen = {};
  for (let d = 0; d < 196; d++) { const k = addDays('2026-10-14', d), i = info(k); if (i.deload) (seen[i.week] ||= []).push(k); }
  assert.deepStrictEqual(Object.keys(seen).map(Number), [6, 13, 20, 27]);
  for (const [w, [a, b]] of Object.entries(DL)) { assert.strictEqual(seen[w][0], a); assert.strictEqual(seen[w][seen[w].length - 1], b); assert.strictEqual(seen[w].length, 7); }
});

console.log('Plan tables');
const SESS = ['PUSH A', 'PULL A', 'LEGS A', 'PUSH B', 'PULL B', 'LEGS B'];
check('Every exercise has sets, rep range, rest and a cue in every week', () => {
  for (let w = 1; w <= 28; w++) for (const s of SESS) {
    rows(s, weekStart(w)).forEach(r => { assert.ok(+r[2] >= 1, `${s} w${w} ${r[0]} sets`); assert.ok(/\d/.test(r[3]), `${r[0]} reps`); assert.ok(r[4], `${r[0]} rest`); assert.ok(r[5], `${r[0]} cue`); });
    run(`coreRows(${J(s)}, ${J(weekStart(w))})`).forEach(r => assert.ok(+r[1] >= 1 && r[2]));
    const c = run(`cardioPlan(${J(s)}, ${J(weekStart(w))})`); assert.ok(c.duration > 0 && c.note);
  }
});
check('Phase 1 tables match the plan (set counts)', () => {
  const want = { 'PUSH A': [4, 4, 3, 3, 3, 3, 2], 'PULL A': [4, 4, 3, 3, 3, 3, 3], 'LEGS A': [4, 3, 3, 4, 3, 4, 3], 'PUSH B': [5, 4, 3, 3, 3], 'PULL B': [4, 4, 4, 3, 3], 'LEGS B': [5, 3, 4, 3, 3] };
  for (const s of SESS) assert.deepStrictEqual(rows(s, '2026-10-14').map(r => +r[2]), want[s], s);
});
check('Phase 1 strength primaries run at RIR 2 (clean 5, no grinding)', () => {
  assert.strictEqual(rows('PUSH B', '2026-10-18')[0][1], 'RIR 2');
});
check('Phase 2: +1 set on the first two compounds per hypertrophy day, supersets begin', () => {
  const k = weekStart(8);
  assert.deepStrictEqual(rows('PUSH A', k).map(r => +r[2]), [5, 4, 3, 4, 3, 3, 2]);
  assert.deepStrictEqual(rows('PULL A', k).map(r => +r[2]), [5, 5, 3, 3, 3, 3, 3]);
  assert.deepStrictEqual(rows('LEGS A', k).map(r => +r[2]), [5, 4, 3, 4, 3, 4, 3]);
  assert.deepStrictEqual(rows('PULL A', k).filter(r => r[1] === 'Superset').map(r => r[0]), ['Single-Arm DB Row', 'Cable Rear Delt Fly']);
  assert.deepStrictEqual(rows('PUSH B', k).map(r => +r[2]), [5, 4, 3, 3, 3], 'strength days unchanged');
});
check('Phase 3: rest-pause on isolations, wave loading (6 sets) on primary compounds, Phase 2 volume kept', () => {
  const k = weekStart(16);
  rows('PUSH A', k).forEach(r => assert.strictEqual(r[1] === 'Rest-Pause', r[6] === 'I', r[0]));
  assert.deepStrictEqual(rows('PUSH A', k).map(r => +r[2]), [5, 4, 3, 4, 3, 3, 2]);
  assert.deepStrictEqual(rows('PUSH B', k).map(r => [r[1], +r[2]]), [['Wave 5/4/3', 6], ['Wave 5/4/3', 6], ['RIR 2', 3], ['RIR 2', 3], ['RIR 2', 3]]);
  assert.ok(rows('PULL B', k).slice(0, 3).every(r => r[1] === 'Wave 5/4/3' && r[2] === '6'));
});
check('Phase 4: three working sets per hypertrophy exercise, no techniques, standard strength sets', () => {
  const k = weekStart(24);
  for (const s of ['PUSH A', 'PULL A', 'LEGS A']) rows(s, k).forEach(r => { assert.ok(+r[2] <= 3, r[0]); assert.ok(!['Rest-Pause', 'Superset', 'Wave 5/4/3'].includes(r[1]), r[0]); });
  assert.deepStrictEqual(rows('PUSH B', k).map(r => +r[2]), [5, 4, 3, 3, 3]);
});
check('Phase techniques never leak outside their weeks', () => {
  for (let w = 1; w <= 28; w++) {
    const ph = info(weekStart(w)).phase.n, dl = info(weekStart(w)).deload;
    const all = SESS.flatMap(s => rows(s, weekStart(w)));
    assert.strictEqual(all.some(r => r[1] === 'Rest-Pause'), ph === 3 && !dl, `rest-pause w${w}`);
    assert.strictEqual(all.some(r => r[1] === 'Wave 5/4/3'), ph === 3 && !dl, `wave w${w}`);
    assert.strictEqual(all.some(r => r[1] === 'Superset'), (ph === 2 || ph === 3) && !dl, `superset w${w}`);
    assert.strictEqual(all.every(r => r[1] === 'Deload'), dl, `deload flag w${w}`);
  }
});
check('Deload weeks cut sets about 40% (5→3, 4→2, 3→2, 2→1) in every phase', () => {
  const cut = { 6: 4, 5: 3, 4: 2, 3: 2, 2: 1 };
  const base = run('LIFTING');
  for (const w of [6, 13, 20, 27]) {
    const ph = info(weekStart(w)).phase.n;
    for (const s of SESS) {
      let compounds = 0;
      rows(s, weekStart(w)).forEach((r, i) => {
        const [, , sets, , , , kind] = base[s][i];
        let n = +sets;
        if (!/B$/.test(s)) { if ((ph === 2 || ph === 3) && kind === 'C' && compounds++ < 2) n += 1; if (ph === 4) n = Math.min(n, 3); }
        assert.strictEqual(+r[2], cut[n], `${s} week ${w} ${r[0]}: ${n} sets should become ${cut[n]}`);
        assert.strictEqual(r[1], 'Deload');
      });
    }
  }
});
check('Deload weeks cut HIIT rounds, Zone 2 minutes and core sets about 40%', () => {
  const dl = weekStart(6), n = weekStart(5);
  assert.strictEqual(run(`cardioPlan('PUSH A', ${J(dl)})`).rounds, 6);
  assert.strictEqual(run(`cardioPlan('LEGS A', ${J(dl)})`).duration, 18);
  assert.strictEqual(run(`cardioPlan('PUSH B', ${J(dl)})`).duration, 15);
  run(`coreRows('PUSH A', ${J(dl)})`).forEach(r => assert.strictEqual(r[1], '2'));
  run(`coreRows('PUSH A', ${J(n)})`).forEach(r => assert.strictEqual(r[1], '3'));
});
check('Cardio by phase: HIIT rounds, Zone 2 minutes', () => {
  const c = (s, w) => run(`cardioPlan(${J(s)}, ${J(weekStart(w))})`);
  assert.deepStrictEqual([c('PUSH A', 2).type, c('PUSH A', 2).rounds, c('PUSH A', 2).maxRounds, c('PUSH A', 2).protocol], ['HIIT', 10, 10, '30 sec on / 30 sec off']);
  assert.strictEqual(c('PULL A', 2).protocol, '40 sec on / 20 sec off');
  assert.strictEqual(c('PUSH A', 8).maxRounds, 12); assert.strictEqual(c('PUSH A', 16).maxRounds, 12);
  assert.strictEqual(c('PULL A', 8).maxRounds, 10); assert.strictEqual(c('PUSH A', 24).maxRounds, 10);
  assert.deepStrictEqual([c('LEGS A', 2).duration, c('LEGS A', 8).duration, c('LEGS A', 16).duration, c('LEGS A', 24).duration], [30, 30, 35, 30]);
  assert.deepStrictEqual([c('PUSH B', 2).duration, c('PUSH B', 16).duration, c('PUSH B', 24).duration], [25, 25, 30]);
});
check('Core circuits match the plan', () => {
  const names = s => run(`coreRows(${J(s)}, '2026-10-14')`).map(r => r[0]);
  assert.deepStrictEqual(names('PUSH A'), ['Cable Crunch', 'Hanging Leg Raise', 'Serratus Punch (cable)', 'Plank w/ Shoulder Tap']);
  assert.deepStrictEqual(names('PULL B'), ['Landmine Rotation', 'Cable Woodchop', 'Side Plank w/ Hip Dip', 'Pallof Press']);
  assert.deepStrictEqual(names('LEGS B'), ['Hanging Tuck-to-Straight Leg Raise', 'Ab Wheel', 'Dead Bug', 'Dragon Flag Negative']);
});

console.log('Progression');
const rec = (name, p, session, k) => run(`liftRec(${J(name)}, ${J(p)}, ${J(session)}, ${J(k)})`);
const ROW = ['Barbell Bent-Over Row', 'RIR 1', '4', '6–8', '2–3 min'];
check('Example: Row 135×8 ×4 (range 6–8) predicts 140 × 4 sets at 8, 8, 7, 6', () => {
  clearLogs(); logLift('2026-10-22', ROW[0], sets(135, [8, 8, 8, 8]));
  const r = rec(ROW[0], ROW, 'PULL B', '2026-10-29');
  assert.deepStrictEqual(r.targets, [{ w: 140, r: 8 }, { w: 140, r: 8 }, { w: 140, r: 7 }, { w: 140, r: 6 }]);
  assert.strictEqual(r.status.cls, 'up');
});
check('Not all sets at the top: hold the weight, +1 rep per set capped at the top', () => {
  clearLogs(); logLift('2026-10-22', ROW[0], sets(135, [8, 7, 7, 6]));
  assert.deepStrictEqual(rec(ROW[0], ROW, 'PULL B', '2026-10-29').targets.map(t => [t.w, t.r]), [[135, 8], [135, 8], [135, 8], [135, 7]]);
});
check('Increments: +5 lb upper body, +10 lb lower body', () => {
  assert.strictEqual(run("liftInc('PUSH A', 'Cable Lateral Raise')"), 5);
  assert.strictEqual(run("liftInc('PULL B', 'Barbell Curl')"), 5);
  assert.strictEqual(run("liftInc('PULL B', 'Conventional Deadlift')"), 10);
  assert.strictEqual(run("liftInc('LEGS A', 'Leg Curl')"), 10);
  assert.strictEqual(run("liftInc('LEGS B', 'Deficit RDL')"), 10);
});
check('Stalled for two sessions: +0.5 lb micro-load', () => {
  clearLogs(); logLift('2026-10-15', ROW[0], sets(135, [7, 7, 6, 6])); logLift('2026-10-22', ROW[0], sets(135, [7, 7, 6, 6]));
  const r = rec(ROW[0], ROW, 'PULL B', '2026-10-29');
  assert.strictEqual(r.micro, true); assert.deepStrictEqual(r.targets.map(t => t.w), [135.5, 135.5, 135.5, 135.5]);
});
check('All targets stay on 0.5 lb steps', () => {
  clearLogs(); logLift('2026-10-22', ROW[0], sets(135.5, [8, 8, 8, 8]));
  rec(ROW[0], ROW, 'PULL B', '2026-10-29').targets.forEach(t => assert.strictEqual((t.w * 2) % 1, 0));
});
check('Weight inputs accept 0.5 lb steps', () => {
  assert.ok(!/id="lw-[^>]*step="2\.5"/.test(html) && /id="lw-[^>]*step="0\.5"/.test(html));
  assert.ok(!/id="cw-[^>]*step="2\.5"/.test(html) && /id="cw-[^>]*step="0\.5"/.test(html));
});
check('First session: hypertrophy aims for ~3–4 RIR; strength a clean 5 at ~2 RIR; old bests are rebuild targets', () => {
  clearLogs();
  const h = rec('Incline DB Press', ['Incline DB Press', 'RIR 1–2', '4', '10–15', '60–90 sec'], 'PUSH A', '2026-10-14');
  assert.ok(/3–4 reps in the tank/.test(h.why)); assert.strictEqual(h.last, null); assert.ok(h.targets.every(t => t.w === null && t.r === 10));
  const s = rec('Barbell Bench Press', rows('PUSH B', '2026-10-17')[0], 'PUSH B', '2026-10-17');
  assert.ok(/clean 5 reps/.test(s.why) && /200 lb/.test(s.why) && /rebuild target/.test(s.why) && /155 lb/.test(s.why));
  assert.ok(s.targets.every(t => t.r === 5));
});
check('Deload week: same weight as the prior normal week, fewer sets', () => {
  clearLogs(); logLift(weekStart(5), 'Barbell Bench Press', sets(150, [5, 5, 5, 5, 5]), 'PUSH B');
  const k = addDays(weekStart(6), 3), p = rows('PUSH B', k)[0], r = rec('Barbell Bench Press', p, 'PUSH B', k);
  assert.strictEqual(+p[2], 3); assert.deepStrictEqual(r.targets.map(t => t.w), [150, 150, 150]);
});
check('Week after a deload resumes from the last normal week (deload logs are skipped)', () => {
  clearLogs();
  const bench = ['Barbell Bench Press', 'RIR 1', '5', '3–5', '2–3 min'];
  logLift(addDays(weekStart(5), 3), bench[0], sets(150, [5, 5, 5, 5, 5]), 'PUSH B');
  logLift(addDays(weekStart(6), 3), bench[0], sets(150, [3, 3, 3]), 'PUSH B');
  const r = rec(bench[0], bench, 'PUSH B', addDays(weekStart(7), 3));
  assert.strictEqual(r.targets[0].w, 155, 'all 5 sets hit the top at 150 before the deload, so +5 lb upper body');
});
check('Wave loading (Phase 3): peak sets 5/4/3 ×2 at ascending weights', () => {
  clearLogs();
  const k = addDays(weekStart(16), 3), p = rows('PUSH B', k)[0];
  logLift(addDays(weekStart(14), 3), p[0], sets(190, [5, 5, 5, 5, 5]), 'PUSH B');
  const r = rec(p[0], p, 'PUSH B', k); // all 5 sets hit the top at 190, so the peak goes to 195 (+5 lb upper body)
  assert.deepStrictEqual(r.targets.map(t => [t.w, t.r]), [[175, 5], [185, 4], [195, 3], [175, 5], [185, 4], [195, 3]]);
});
check('Strength-day weights are not dropped in Phase 3', () => {
  clearLogs();
  const k = addDays(weekStart(18), 3), p = ['Weighted Dips', 'RIR 2', '3', '5–6', '2–3 min'];
  logLift(addDays(weekStart(17), 3), p[0], sets(45, [3, 3, 3]), 'PUSH B');
  const r = rec(p[0], p, 'PUSH B', k);
  assert.ok(r.targets.every(t => t.w === 45)); assert.strictEqual(r.status.cls, 'build');
});
check('Weights drop when stuck below the bracket outside the Lean/Peak strength days', () => {
  clearLogs();
  const k = addDays(weekStart(3), 0), p = ['Incline DB Press', 'RIR 1–2', '4', '10–15', '60–90 sec'];
  logLift(addDays(weekStart(2), 0), p[0], sets(60, [8, 8, 8, 8]), 'PUSH A');
  assert.ok(rec(p[0], p, 'PUSH A', k).targets.every(t => t.w === 55));
});
check('HIIT progression: +1 round per session up to the phase cap', () => {
  clearLogs();
  const w = (date, rounds) => run(`workouts[${J(date + '_cardio')}] = { date:${J(date)}, type:'cardio', session:'PUSH A', exercises:[{ planned:'HIIT', name:'HIIT', skipped:false, duration:15, rounds:${rounds} }] };`);
  w(weekStart(8), 10); assert.strictEqual(run(`cardioRec('PUSH A', ${J(weekStart(9))})`).rounds, 11);
  w(weekStart(9), 12); assert.strictEqual(run(`cardioRec('PUSH A', ${J(weekStart(10))})`).rounds, 12);
  assert.strictEqual(run(`cardioRec('PUSH A', ${J(weekStart(24))})`).rounds, 10);
});

console.log('Readiness check-in');
const checkin = (k, sleep, soreness, energy) => run(`fatigueLog[${J(k)}] = { sleep:${sleep}, soreness:${soreness}, energy:${energy}, done:true }`);
check('Low readiness (avg 2 or below): today\'s weights drop 10%, rounded to 2.5 lb', () => {
  clearLogs(); run('fatigueLog = {}'); logLift('2026-10-22', ROW[0], sets(135, [7, 7, 6, 6]));
  checkin('2026-10-29', 2, 4, 2); // soreness 4 counts as 2, so the average is 2
  const r = rec(ROW[0], ROW, 'PULL B', '2026-10-29');
  assert.strictEqual(r.fatigue, 'low'); assert.ok(r.targets.every(t => t.w === 122.5), J(r.targets));
});
check('High readiness (avg 4+): weights unchanged, push note added', () => {
  clearLogs(); run('fatigueLog = {}'); logLift('2026-10-22', ROW[0], sets(135, [7, 7, 6, 6]));
  checkin('2026-10-29', 5, 1, 4);
  const r = rec(ROW[0], ROW, 'PULL B', '2026-10-29');
  assert.strictEqual(r.fatigue, 'high'); assert.ok(r.targets.every(t => t.w === 135)); assert.ok(/push for the top/.test(r.why));
});
check('Soreness counts against readiness (5 = very sore)', () => {
  run('fatigueLog = {}'); checkin('2026-10-29', 3, 5, 2); // (3 + 1 + 2) / 3 = 2
  assert.strictEqual(run("readiness('2026-10-29').low"), true);
  checkin('2026-10-29', 3, 1, 2); // (3 + 5 + 2) / 3 = 3.3
  assert.strictEqual(run("readiness('2026-10-29').low"), false);
});
check('No check-in: targets unchanged', () => {
  clearLogs(); run('fatigueLog = {}'); logLift('2026-10-22', ROW[0], sets(135, [7, 7, 6, 6]));
  const r = rec(ROW[0], ROW, 'PULL B', '2026-10-29');
  assert.strictEqual(r.fatigue, undefined); assert.ok(r.targets.every(t => t.w === 135));
});
check('A low-readiness session is ignored when setting the next targets', () => {
  clearLogs(); run('fatigueLog = {}');
  logLift('2026-10-22', ROW[0], sets(135, [8, 8, 8, 8]));
  checkin('2026-10-29', 1, 5, 1); logLift('2026-10-29', ROW[0], sets(122.5, [8, 8, 8, 8]));
  const r = rec(ROW[0], ROW, 'PULL B', '2026-11-05');
  assert.deepStrictEqual(r.targets.map(t => t.w), [140, 140, 140, 140]);
  run('fatigueLog = {}');
});

console.log('Lifting banner');
const banner = k => run(`phaseBanner(${J(k)})`);
check('Banner shows week, phase and name, with the next deload', () => {
  const b = banner(weekStart(1));
  assert.ok(/Week 1 of 28 · Phase 1 Reclaim/.test(b) && /Next deload: week 6/.test(b) && /Nov 18 to Nov 24/.test(b) && /65–70% 1RM/.test(b), b);
  assert.ok(/Week 9 of 28 · Phase 2 Build/.test(banner(weekStart(9))) && /Next deload: week 13 \(Jan 6 to Jan 12\)/.test(banner(weekStart(9))));
  assert.ok(/Phase 3 Lean/.test(banner(weekStart(16))) && /Rest-pause/.test(banner(weekStart(16))) && /wave loading/.test(banner(weekStart(16))));
  assert.ok(/Week 24 of 28 · Phase 4 Peak/.test(banner(weekStart(24))) && /Next deload: week 27 \(Apr 14 to Apr 20\)/.test(banner(weekStart(24))));
});
check('Deload weeks are flagged in the banner and styled as deloads', () => {
  for (const w of [6, 13, 20, 27]) { const b = banner(weekStart(w)); assert.ok(/class="phase deload"/.test(b) && /Deload week/.test(b) && !/Next deload/.test(b), 'week ' + w); }
  assert.ok(!/class="phase deload"/.test(banner(weekStart(5))));
});
check('Core and Cardio banners show the same week/phase title and next deload', () => {
  for (const type of ['core', 'cardio']) {
    const b = run(`phaseBanner(${J(weekStart(9))}, ${J(type)})`);
    assert.ok(/Week 9 of 28 · Phase 2 Build/.test(b) && /Next deload: week 13 \(Jan 6 to Jan 12\)/.test(b), type + ': ' + b);
    assert.ok(!/Intensity:/.test(b) && !/1RM/.test(b), type + ' should not show lifting intensity');
  }
});
check('Cardio banner numbers match the cardio plan in every phase', () => {
  const cb = w => run(`phaseBanner(${J(weekStart(w))}, 'cardio')`), cp = (s, w) => run(`cardioPlan(${J(s)}, ${J(weekStart(w))})`);
  assert.ok(/10 rounds/.test(cb(2)) && cp('PUSH A', 2).maxRounds === 10 && cp('LEGS A', 2).duration === 30 && cp('PUSH B', 2).duration === 25 && /25–30 minutes/.test(cb(2)));
  assert.ok(/12 rounds on Push A/.test(cb(8)) && cp('PUSH A', 8).maxRounds === 12 && cp('PULL A', 8).maxRounds === 10);
  assert.ok(/35 minutes/.test(cb(16)) && cp('LEGS A', 16).duration === 35 && cp('PUSH A', 16).maxRounds === 12);
  assert.ok(/10 rounds/.test(cb(24)) && /30 minutes/.test(cb(24)) && cp('LEGS A', 24).duration === 30 && cp('PUSH B', 24).duration === 30 && cp('PUSH A', 24).maxRounds === 10);
});
check('Deload banners on Core and Cardio match the deload numbers', () => {
  const dl = weekStart(6);
  assert.ok(/class="phase deload"/.test(run(`phaseBanner(${J(dl)}, 'core')`)) && /2 per exercise/.test(run(`phaseBanner(${J(dl)}, 'core')`)));
  assert.ok(run(`coreRows('PUSH A', ${J(dl)})`).every(r => r[1] === '2'));
  const c = run(`phaseBanner(${J(dl)}, 'cardio')`);
  assert.ok(/class="phase deload"/.test(c) && /6 rounds/.test(c) && /18 minutes/.test(c));
  assert.strictEqual(run(`cardioPlan('PUSH A', ${J(dl)})`).rounds, 6); assert.strictEqual(run(`cardioPlan('LEGS A', ${J(dl)})`).duration, 18);
});
check('After the last deload there is no "next deload" line', () => assert.ok(!/Next deload/.test(banner(weekStart(28)))));
check('No banner outside the program (before Day 1 or after week 28)', () => {
  assert.strictEqual(banner(D(-1)), ''); assert.strictEqual(banner(D(196)), '');
});
check('Obsolete code is gone (calibration, MACHINES, unused tab key, newfile.js)', () => {
  assert.ok(!/CAL_WEEKS|isDeloadWeek|const MACHINES|derek-tc-tab/.test(html));
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'newfile.js')));
  assert.ok(!('main' in JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))));
});

console.log('Progress ranges');
const RB = (r, t) => run(`rangeBounds(${J(r)}, ${J(t)})`);
const RO = (d, t) => run(`rangeOptions(${J(d)}, ${J(t)})`);
check('Month to date and year to date run from the 1st to today', () => {
  assert.deepStrictEqual(RB('mtd', '2026-10-09'), { lo: '2026-10-01', hi: '2026-10-09' });
  assert.deepStrictEqual(RB('ytd', '2027-03-15'), { lo: '2027-01-01', hi: '2027-03-15' });
});
check('A chosen month runs from its 1st to today ("since then")', () => {
  assert.deepStrictEqual(RB('m:2026-09', '2026-10-09'), { lo: '2026-09-01', hi: '2026-10-09' });
  assert.deepStrictEqual(RB('m:2026-10', '2026-10-09'), { lo: '2026-10-01', hi: '2026-10-09' });
});
check('A previous year is that whole calendar year', () => {
  assert.deepStrictEqual(RB('y:2026', '2027-03-15'), { lo: '2026-01-01', hi: '2026-12-31' });
  assert.deepStrictEqual(RB('y:2027', '2027-03-15'), { lo: '2027-01-01', hi: '2027-03-15' });
});
check('Bad or future ranges fall back to month to date', () => {
  for (const r of ['', undefined, 'junk', '4w', 'm:2099-01', 'y:2099']) assert.deepStrictEqual(RB(r, '2026-10-09'), { lo: '2026-10-01', hi: '2026-10-09' }, String(r));
});
check('Month list: every month from the first data through now, newest first', () => {
  const o = RO(['2026-09-26', '2026-10-03'], '2026-10-09');
  assert.deepStrictEqual(o.months.map(m => m.label), ['October 2026', 'September 2026']);
  assert.deepStrictEqual(o.months.map(m => m.value), ['m:2026-10', 'm:2026-09']);
  assert.deepStrictEqual(o.years, []);
  const p = RO(['2026-11-20'], '2027-02-03');
  assert.deepStrictEqual(p.months.map(m => m.label), ['February 2027', 'January 2027', 'December 2026', 'November 2026']);
});
check('Year list: only earlier years that have data', () => {
  const o = RO(['2025-02-01', '2026-10-03', '2027-01-04'], '2027-03-01');
  assert.deepStrictEqual(o.years, [{ value: 'y:2026', label: '2026' }, { value: 'y:2025', label: '2025' }]);
  assert.deepStrictEqual(RO([], '2026-10-09').months.map(m => m.label), ['October 2026']);
});
check('Progress is the first tab and the default on open', () => {
  assert.ok(html.indexOf('data-tab="progress"') < html.indexOf('data-tab="lift"'));
  assert.ok(/\nlet tab = 'progress';/.test(html));
});

console.log('Milestones');
check('Milestone table matches the plan', () => {
  assert.deepStrictEqual(run('MILESTONES').map(m => [m['Barbell Bench Press'], m['Back Squat'], m['Conventional Deadlift'], m['Standing OHP']]),
    [[155, 200, 290, 85], [200, 250, 365, 110], [215, 275, 390, 120], [220, 285, 405, 125]]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
