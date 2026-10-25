#!/usr/bin/env node
// Verifies the config/program document: schema validation, equality with the pre-refactor program (golden fixtures),
// the ver stamp, and that the full example in PROGRAM_SCHEMA.md is the built-in program. Run with: npm test
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const ProgramLib = require('../docs/program.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');
const script = html.match(/<script>\n(\/\/ ═══ Program[\s\S]*?)<\/script>/)[1];
const realCode = script.slice(0, script.indexOf('// ═══ Muscle groups'));
// These tests use a fixed calendar (Day 1 = Tue 2026-10-20) so they do not move when the program's real start date does.
// The real START is checked separately (see "The program starts on its real Day 1").
const code = realCode.replace(/const START = new Date\([^)]*\);[^\n]*/, 'const START = new Date(2026, 9, 20);');
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'program-golden.json'), 'utf8'));
const muscles = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'muscle-groups-golden.json'), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));

const ls = {};
const ctx = {
  console, Math, Date, JSON, Object, Array, Set, Map, Number, String, RegExp,
  localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
  location: { hash: '' }, ProgramLib, MachineLib: require('../docs/machines.js'),
};
vm.createContext(ctx);
vm.runInContext(`
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);
${code}
`, ctx);
const run = src => { vm.runInContext('resetCal()', ctx); const v = vm.runInContext(src, ctx); return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
const J = JSON.stringify;

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); }
}
const errs = doc => ProgramLib.validate(doc);
const mutated = fn => { const d = clone(ProgramLib.BUILTIN); fn(d); return d; };
const weekStart = w => run(`addDays('2026-10-20', ${(w - 1) * 7})`);

console.log('Built-in program');
check('The built-in program validates and is version 1, source "built-in"', () => {
  assert.deepStrictEqual(errs(ProgramLib.BUILTIN), []);
  assert.strictEqual(ProgramLib.BUILTIN.version, 1); assert.strictEqual(ProgramLib.BUILTIN.source, 'built-in');
});
check('It has six sessions, 36 exercises, core circuits A/B/C and a cardio prescription per session', () => {
  assert.deepStrictEqual(Object.keys(ProgramLib.BUILTIN.sessions), ProgramLib.SESSIONS);
  assert.strictEqual(Object.values(ProgramLib.BUILTIN.sessions).reduce((n, s) => n + s.exercises.length, 0), 36);
  assert.deepStrictEqual(Object.keys(ProgramLib.BUILTIN.core.circuits), ['A', 'B', 'C']);
  assert.deepStrictEqual(Object.keys(ProgramLib.BUILTIN.cardio.sessions), ProgramLib.SESSIONS);
});
check('Every exercise carries the required fields', () => {
  for (const s of ProgramLib.SESSIONS) for (const e of ProgramLib.BUILTIN.sessions[s].exercises) {
    assert.ok(e.name && e.muscleGroup.length && e.sets && e.reps.low && e.reps.high >= e.reps.low && e.rir && e.restSec && ['upper', 'lower'].includes(e.progression), `${s} ${e.name}`);
  }
});

console.log('Rendering matches the program before the refactor');
check('Base lifting, core and cardio tables are identical to the old ones', () => {
  assert.deepStrictEqual(run('LIFTING'), golden.base.lifting);
  assert.deepStrictEqual(run('CORE'), golden.base.core);
  const c = run('CARDIO');
  for (const s of Object.keys(golden.base.cardio)) for (const [k, v] of Object.entries(golden.base.cardio[s])) assert.deepStrictEqual(c[s][k], v, `${s}.${k}`);
  assert.deepStrictEqual(run('Z2'), golden.z2);
});
// The fixtures were captured with the old deload weeks (6, 13, 20, 27). Rows depend only on the phase and whether it is a deload,
// so each fixture week is checked in the week that now has the same phase and deload status (deloads are weeks 5, 10, 15, 20, 25).
const GOLDEN_WEEK = { 1: 1, 6: 5, 8: 8, 13: 10, 16: 16, 20: 20, 24: 24, 27: 25 };
check('liftRows, coreRows and cardioPlan match for every phase and deload week in every session', () => {
  let n = 0;
  for (const [w, sessions] of Object.entries(golden.phase)) for (const [s, want] of Object.entries(sessions)) {
    const k = weekStart(GOLDEN_WEEK[w]);
    assert.deepStrictEqual(run(`liftRows(${J(s)}, ${J(k)})`), want.lifting, `lifting ${s} w${w}`);
    assert.deepStrictEqual(run(`coreRows(${J(s)}, ${J(k)})`), want.core, `core ${s} w${w}`);
    const c = run(`cardioPlan(${J(s)}, ${J(k)})`);
    for (const [key, v] of Object.entries(want.cardio)) assert.deepStrictEqual(c[key], v, `cardio ${s} w${w} ${key}`);
    n++;
  }
  assert.ok(n >= 48);
});
check('Progression step (+5 upper, +10 lower) matches the old rule for every exercise', () => {
  for (const [key, want] of Object.entries(golden.inc)) {
    const [s, name] = key.split('|');
    assert.strictEqual(run(`liftInc(${J(s)}, ${J(name)})`), want, key);
  }
});
check('Muscle groups match the old derived ones for every planned exercise', () => {
  for (const [name, want] of Object.entries(muscles)) {
    const hit = ProgramLib.BUILTIN.sessions && Object.values(ProgramLib.BUILTIN.sessions).flatMap(s => s.exercises).find(e => e.name === name);
    assert.ok(hit, name); assert.deepStrictEqual(hit.muscleGroup, want, name);
  }
});

console.log('A replacement program');
const custom = () => mutated(d => {
  d.version = 3; d.source = 'agent';
  const e = d.sessions['PUSH A'].exercises[0];
  e.name = 'Flat DB Press'; e.sets = 5; e.reps = { low: 8, high: 10 }; e.rir = { low: 2, high: 2 }; e.restSec = 90; e.progression = 'lower'; e.methods = ['Tempo'];
  d.cardio.sessions['PUSH A'].rounds = 8; d.cardio.sessions['PUSH A'].targetAvgWatts = 180;
  d.cardio.sessions['LEGS A'].hrLow = 130; d.cardio.sessions['LEGS A'].hrHigh = 142;
});
check('The app renders from config/program once applied, and falls back to built-in rows for nothing else', () => {
  vm.runInContext(`applyProgram(${J(custom())})`, ctx);
  const r = run(`liftRows('PUSH A', ${J(weekStart(1))})`)[0];
  assert.deepStrictEqual(r.slice(0, 5), ['Flat DB Press', 'Tempo', '5', '8–10', '90 sec']);
  assert.strictEqual(run(`liftInc('PUSH A', 'Flat DB Press')`), 10);
  assert.strictEqual(run(`liftInc('PUSH A', 'Tricep Pushdown')`), 5);
  const c = run(`cardioPlan('PUSH A', ${J(weekStart(1))})`);
  assert.strictEqual(c.rounds, 8); assert.strictEqual(c.duration, 13); assert.strictEqual(c.targetAvgWatts, 180);
  assert.deepStrictEqual(run('Z2'), [130, 142]);
});
check('Workout and draft ver records the program version that built them', () => {
  assert.ok(/^7:a3$/.test(run('planVer()')), run('planVer()'));
  vm.runInContext(`applyProgram(ProgramLib.BUILTIN)`, ctx);
  assert.ok(/^7:b1$/.test(run('planVer()')), run('planVer()'));
});
check('A pull-forward deload week in the document makes that week a deload week', () => {
  assert.strictEqual(run(`programInfo('2026-11-03').deload`), false);
  vm.runInContext(`applyProgram(${J({ ...clone(ProgramLib.BUILTIN), version: 2, source: 'agent', deloadWeeks: ['2026-11-03'] })})`, ctx);
  assert.strictEqual(run(`programInfo('2026-11-03').deload`), true); assert.strictEqual(run(`programInfo('2026-11-05').deload`), true); assert.strictEqual(run(`programInfo('2026-11-10').deload`), false);
  assert.ok(run(`liftRows('PUSH A', '2026-11-03')`).every(r => r[1] === 'Deload'));
  vm.runInContext(`applyProgram(ProgramLib.BUILTIN)`, ctx);
});
const withTarget = (session, name, lb) => { const d = clone(ProgramLib.BUILTIN); d.version = 2; d.source = 'agent'; d.sessions[session].exercises.find(e => e.name === name).targetLb = lb; return d; };
const recFor = (session, name, k) => run(`liftRec(${J(name)}, liftRows(${J(session)}, ${J(k)}).find(r => r[0] === ${J(name)}), ${J(session)}, ${J(k)})`);
const logSets = (date, name, session, w, reps) => run(`workouts[${J(date + '_lift')}] = { date:${J(date)}, type:'lift', session:${J(session)}, exercises:[{ name:${J(name)}, planned:${J(name)}, skipped:false, sets:${J(reps.map(r => ({ w, r })))} }] }`);
check('Agent target load (targetLb) replaces the computed weight until a session reaches it', () => {
  run('workouts = {}'); run('fatigueLog = {}');
  vm.runInContext(`applyProgram(${J(withTarget('PUSH A', 'Tricep Pushdown', 60))})`, ctx);
  const k = weekStart(2);
  let r = recFor('PUSH A', 'Tricep Pushdown', k); assert.ok(r.targets.every(t => t.w === 60) && /Training agent target: 60 lb/.test(r.why) && /Agent target 60 lb/.test(r.status.text), 'no history yet');
  logSets(weekStart(1), 'Tricep Pushdown', 'PUSH A', 50, [18, 17, 16]);
  r = recFor('PUSH A', 'Tricep Pushdown', k); assert.ok(r.targets.every(t => t.w === 60), 'last session was at 50');
  logSets(weekStart(1), 'Tricep Pushdown', 'PUSH A', 60, [16, 15, 15]);
  r = recFor('PUSH A', 'Tricep Pushdown', k); assert.ok(r.targets.every(t => t.w === 60) && !/Training agent target/.test(r.why), 'reached it: the normal progression takes over (stay at 60)');
  logSets(weekStart(1), 'Tricep Pushdown', 'PUSH A', 65, [16, 15, 15]);
  assert.ok(!/Training agent target/.test(recFor('PUSH A', 'Tricep Pushdown', k).why), 'went past it');
  run('workouts = {}');
  logSets(weekStart(4), 'Tricep Pushdown', 'PUSH A', 50, [18, 17, 16]);
  r = recFor('PUSH A', 'Tricep Pushdown', weekStart(5)); assert.ok(r.targets.every(t => t.w === 50) && !/Training agent target/.test(r.why), 'deload week keeps the weights you last used');
  vm.runInContext(`applyProgram(${J(withTarget('PUSH B', 'Barbell Bench Press', 200))})`, ctx);
  const wk = weekStart(16);
  logSets(run(`addDays(${J(wk)}, -7)`), 'Barbell Bench Press', 'PUSH B', 190, [5, 4, 3, 5, 4, 3]);
  r = recFor('PUSH B', 'Barbell Bench Press', wk); assert.deepStrictEqual(r.targets.map(t => t.w), [180, 190, 200, 180, 190, 200]); assert.ok(/200 lb peak/.test(r.waveTo));
  run('workouts = {}'); vm.runInContext('applyProgram(ProgramLib.BUILTIN)', ctx);
});
check('An invalid document is ignored and the current program stays', () => {
  const before = run('planVer()');
  const ok = run(`applyProgram(${J(mutated(d => { d.sessions['PUSH A'].exercises[0].sets = 0; }))})`);
  assert.strictEqual(ok, false); assert.strictEqual(run('planVer()'), before);
  assert.ok(run('programError').length > 0);
});

console.log('Validation');
const bad = (name, fn, re) => check(`Rejects ${name}`, () => { const e = errs(mutated(fn)); assert.ok(e.length && (!re || e.some(x => re.test(x))), J(e)); });
bad('a missing version', d => { delete d.version; }, /version/);
bad('an unknown source', d => { d.source = 'bot'; }, /source/);
bad('a missing session', d => { delete d.sessions['LEGS B']; }, /LEGS B/);
bad('an unknown session', d => { d.sessions['ARMS'] = d.sessions['PUSH A']; }, /ARMS/);
bad('an empty exercise list', d => { d.sessions['PULL A'].exercises = []; }, /PULL A/);
bad('a bad rep range', d => { d.sessions['PUSH A'].exercises[0].reps = { low: 12, high: 8 }; }, /reps/);
bad('a bad progression type', d => { d.sessions['PUSH A'].exercises[0].progression = 'middle'; }, /progression/);
bad('a missing muscle group', d => { delete d.sessions['PUSH A'].exercises[0].muscleGroup; }, /muscleGroup/);
bad('a missing circuit', d => { delete d.core.circuits.C; }, /circuits\.C/);
bad('a session in two circuits', d => { d.core.circuits.B.sessions.push('PUSH A'); }, /more than one/);
bad('HIIT with no workSec', d => { delete d.cardio.sessions['PUSH A'].workSec; }, /workSec/);
bad('Zone 2 with hrLow above hrHigh', d => { d.cardio.sessions['LEGS A'].hrLow = 150; }, /hrLow/);
bad('an unknown cardio type', d => { d.cardio.sessions['LEGS A'].type = 'Sprint'; }, /type/);
check('Rejects a non-object', () => { assert.ok(errs(null).length && errs([]).length && errs('x').length); });

console.log('Documentation');
check('PROGRAM_SCHEMA.md has a full example that is exactly the built-in program', () => {
  const md = fs.readFileSync(path.join(root, 'PROGRAM_SCHEMA.md'), 'utf8');
  const m = md.match(/<!-- example:start -->\s*```json\n([\s\S]*?)```\s*<!-- example:end -->/);
  assert.ok(m, 'example block not found');
  assert.deepStrictEqual(JSON.parse(m[1]), ProgramLib.BUILTIN);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
