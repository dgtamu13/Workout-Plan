#!/usr/bin/env node
// Verifies machine normalization: units (lb, kg, plate numbers), calibration from machine switches, manual factors, and that
// the app's progression, targets and PRs compare loads only after converting them to the exercise's reference machine.
// Run with: npm test
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const M = require('../docs/machines.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const script = html.match(/<script>\n(\/\/ ═══ Program[\s\S]*?)<\/script>/)[1];
const code = script.slice(0, script.indexOf('// ═══ Rest timer')).replace(/const START = new Date\([^)]*\);[^\n]*/, 'const START = new Date(2026, 9, 20);');
const ls = {};
const ctx = {
  console, Math, Date, JSON, Object, Array, Set, Map, Number, String, RegExp,
  localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
  location: { hash: '' }, ProgramLib: require('../docs/program.js'), MachineLib: M,
};
vm.createContext(ctx);
vm.runInContext(`
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);
${code}
this.setReg = r => { machineReg = MachineLib.normalize(r); };
`, ctx);
const run = src => { vm.runInContext('resetCal()', ctx); const v = vm.runInContext(src, ctx); return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
const J = JSON.stringify;

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); }
}
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ≈ ${b}`);

const REG = {
  machines: {
    precor: { name: 'Precor cable', unit: 'lb' },
    lf: { name: 'Life Fitness cable', unit: 'lb' },
    kgs: { name: 'Hoist kg stack', unit: 'kg' },
    pl: { name: 'Old plate stack', unit: 'plate', plateLb: 10 },
    pl0: { name: 'Mystery stack', unit: 'plate' },
  },
  byExercise: {},
};

console.log('Units and the registry');
check('lb, kg and plate numbers convert to pounds', () => {
  const r = M.normalize(REG);
  assert.strictEqual(M.toLb(M.get(r, 'precor'), 50), 50);
  near(M.toLb(M.get(r, 'kgs'), 20), 44.09);
  assert.strictEqual(M.toLb(M.get(r, 'pl'), 7), 70);
  assert.strictEqual(M.toLb(M.get(r, 'pl0'), 7), 7, 'no plate weight: plate numbers stay as numbers until calibrated');
  assert.strictEqual(M.toLb(M.get(r, ''), 50), 50, "'' (not set) is pounds");
  assert.deepStrictEqual(['precor', 'kgs', 'pl'].map(id => M.label(M.get(r, id))), ['lb', 'kg', 'pl']);
});
check('Targets round to the machine step (2.5 lb, 2.5 kg, whole plates, or the step you set)', () => {
  const r = M.normalize({ machines: { ...REG.machines, five: { name: 'Five', unit: 'lb', step: 5 } } });
  assert.strictEqual(M.rounder(M.get(r, 'precor'))(51.4), 52.5);
  assert.strictEqual(M.rounder(M.get(r, 'kgs'))(21.4), 22.5);
  assert.strictEqual(M.rounder(M.get(r, 'pl'))(6.6), 7);
  assert.strictEqual(M.rounder(M.get(r, 'five'))(52), 50);
});
check('normalize drops bad machines and factors; ids are unique slugs', () => {
  const r = M.normalize({ machines: { a: { name: ' A ', unit: 'stone' }, b: { name: '' }, c: null },
    byExercise: { X: { legacy: 'nope', ref: 'a', manual: { a: 2, zz: 3, '': -1 } } } });
  assert.deepStrictEqual(Object.keys(r.machines), ['a']); assert.strictEqual(r.machines.a.unit, 'lb'); assert.strictEqual(r.machines.a.name, 'A');
  assert.deepStrictEqual(r.byExercise.X, { legacy: null, ref: 'a', manual: { a: 2 } });
  const r2 = M.normalize(REG); assert.strictEqual(M.newId(r2, 'Precor!'), 'precor-2'); assert.strictEqual(M.newId(r2, 'New One'), 'new-one');
});
check("Unlabeled history resolves to the exercise's legacy machine", () => {
  const r = M.normalize({ ...REG, byExercise: { Lat: { legacy: 'precor' } } });
  assert.strictEqual(M.resolve(r, 'Lat', ''), 'precor'); assert.strictEqual(M.resolve(r, 'Lat', 'lf'), 'lf'); assert.strictEqual(M.resolve(r, 'Other', ''), '');
});

console.log('Calibration');
const S = (date, machine, e1) => ({ date, machine, e1 });
check('The first machine is the reference; a switch calibrates the new one from the two sessions around it', () => {
  const r = M.normalize(REG);
  const c = M.calibrate(r, 'X', [S('2026-10-01', 'precor', 60), S('2026-10-08', 'precor', 62), S('2026-10-15', 'lf', 50)]);
  assert.strictEqual(c.ref, 'precor'); assert.strictEqual(c.k.precor.k, 1); near(c.k.lf.k, 1.24); assert.strictEqual(c.k.lf.src, 'auto'); assert.strictEqual(c.k.lf.n, 1);
});
check('Progress after a permanent switch is not normalized away', () => {
  const r = M.normalize(REG);
  const c = M.calibrate(r, 'X', [S('2026-10-01', 'precor', 60), S('2026-10-08', 'lf', 50), S('2026-10-15', 'lf', 55), S('2026-10-22', 'lf', 60)]);
  near(c.k.lf.k, 1.2);
});
check('Switching back and forth uses the median of the last five switches', () => {
  const r = M.normalize(REG);
  const ss = [['precor', 60], ['lf', 50], ['precor', 61], ['lf', 40], ['precor', 62], ['lf', 52]].map(([m, e], i) => S(`2026-10-${String(i + 1).padStart(2, '0')}`, m, e));
  const c = M.calibrate(r, 'X', ss);
  // estimates for lf: 60/50, 61/50, 61/40, 62/40, 62/52 → last five median = 61/50
  near(c.k.lf.k, 1.22); assert.strictEqual(c.k.lf.n, 5);
});
check('Unlabeled history is the reference; a manual factor wins; an explicit reference is kept', () => {
  let r = M.normalize(REG);
  let c = M.calibrate(r, 'X', [S('2026-10-01', '', 60), S('2026-10-08', 'lf', 40)]);
  assert.strictEqual(c.ref, ''); near(c.k.lf.k, 1.5);
  r = M.normalize({ ...REG, byExercise: { X: { manual: { lf: 1.1 } } } });
  c = M.calibrate(r, 'X', [S('2026-10-01', '', 60), S('2026-10-08', 'lf', 40)]);
  assert.deepStrictEqual(c.k.lf, { k: 1.1, src: 'manual', n: 0 });
  r = M.normalize({ ...REG, byExercise: { X: { ref: 'lf' } } });
  c = M.calibrate(r, 'X', [S('2026-10-01', '', 60), S('2026-10-08', 'lf', 40)]);
  assert.strictEqual(c.ref, 'lf'); assert.strictEqual(c.k.lf.k, 1); near(c.k[''].k, 0.667, 0.001);
});
check('Chains calibrate through a machine in between; kg and plate machines get factors per displayed unit', () => {
  const r = M.normalize(REG);
  const c = M.calibrate(r, 'X', [S('2026-10-01', 'precor', 66), S('2026-10-08', 'kgs', 44.09), S('2026-10-15', 'pl', 70)]);
  near(c.k.kgs.k, 1.497, 0.002); near(c.k.pl.k, 0.943, 0.002);
  near(M.scale(r, c, 'kgs'), 3.3, 0.01); near(M.scale(r, c, 'pl'), 9.43, 0.01);
  assert.strictEqual(M.scale(r, c, 'lf'), null, 'never used: no factor');
});

console.log('In the app');
// Cable Lateral Raise is PUSH A, 4 × 12–15, +5 lb (upper). Week 1 of the fixed calendar starts Tue 2026-10-20 (PUSH A).
const EX = 'Cable Lateral Raise';
const day = w => run(`addDays('2026-10-20', ${(w - 1) * 7})`);
const log = (date, sets, machine) => run(`workouts[${J(date + '_lift')}] = { date:${J(date)}, type:'lift', session:'PUSH A', exercises:[{ name:${J(EX)}, planned:${J(EX)}, skipped:false, ${machine === undefined ? '' : `machine:${J(machine)}, `}sets:${J(sets)} }] };`);
const sets = (w, reps) => reps.map(r => ({ w, r }));
const rec = (k, machine) => run(`(() => { const p = liftRows('PUSH A', ${J(k)}).find(r => r[0] === ${J(EX)}); return liftRec(${J(EX)}, p, 'PUSH A', ${J(k)}, ${machine === undefined ? 'undefined' : J(machine)}); })()`);
const reset = (reg = REG) => { run('workouts = {}; fatigueLog = {}'); ctx.setReg(reg); };

check('Without machines nothing changes: lb targets from the last session', () => {
  reset({ machines: {}, byExercise: {} });
  log(day(1), sets(20, [15, 15, 15, 15]));
  const r = rec(day(2));
  assert.deepStrictEqual(r.targets.map(t => t.w), [25, 25, 25, 25]); assert.strictEqual(r.U, 'lb'); assert.ok(/Add 5 lb/.test(r.status.text));
});
check('A new machine gets a calibration session: reps planned, weight left to you', () => {
  reset();
  log(day(1), sets(20, [13, 13, 12, 12]), 'precor');
  const r = rec(day(2), 'lf');
  assert.ok(r.calib); assert.ok(r.targets.every(t => t.w === null && t.r >= 12)); assert.strictEqual(r.status.text, 'Calibrate');
  assert.ok(/First time on Life Fitness cable/.test(r.why) && /against Precor cable/.test(r.why));
  assert.strictEqual(run(`overload(${J(r)}, ['${EX}','RIR 0–1','4','12–15','60–90 sec'], ${J(day(2))}).act`), 'Calibrate');
});
check('After the calibration session, targets on each machine are in its own numbers', () => {
  reset();
  log(day(1), sets(20, [13, 13, 12, 12]), 'precor');
  log(day(2), sets(15, [13, 13, 12, 12]), 'lf');           // same effort, lighter number: 1 lb on LF ≈ 1.33 lb on Precor
  near(run(`calFor(${J(EX)}).k.lf.k`), 1.333, 0.002);
  let r = rec(day(3), 'lf');
  assert.deepStrictEqual(r.targets.map(t => t.w), [15, 15, 15, 15], 'stay at 15 on LF, build reps');
  r = rec(day(3), 'precor');
  assert.deepStrictEqual(r.targets.map(t => t.w), [20, 20, 20, 20], "LF's 15 converts back to 20 on the Precor");
  assert.strictEqual(r.last.machine, 'lf'); assert.deepStrictEqual(r.last.raw.map(s => s.w), [15, 15, 15, 15]);
});
check('The default machine is the one the lift was last logged on', () => {
  reset();
  log(day(1), sets(20, [13, 13, 12, 12]), 'precor');
  log(day(2), sets(15, [15, 15, 15, 15]), 'lf');
  assert.strictEqual(run(`lastMachine(${J(EX)}, ${J(day(3))})`), 'lf');
  assert.deepStrictEqual(rec(day(3)).targets.map(t => t.w), [20, 20, 20, 20], 'top of the range on LF: +5 lb in LF numbers');
});
check('A kg stack shows kg targets, rounded to 2.5 kg, with the increment converted', () => {
  reset();
  log(day(1), sets(44, [13, 13, 12, 12]), 'precor');
  log(day(2), sets(20, [15, 15, 15, 15]), 'kgs');
  const r = rec(day(3), 'kgs');
  assert.strictEqual(r.U, 'kg'); assert.deepStrictEqual(r.targets.map(t => t.w), [22.5, 22.5, 22.5, 22.5]); assert.ok(/kg/.test(r.status.text) && !/lb/.test(r.why));
});
check('A plate-number stack uses whole plates', () => {
  reset();
  log(day(1), sets(60, [13, 13, 12, 12]), 'precor');
  log(day(2), sets(6, [15, 15, 15, 15]), 'pl0');
  const r = rec(day(3), 'pl0');
  assert.strictEqual(r.U, 'pl'); assert.ok(r.targets.every(t => Number.isInteger(t.w) && t.w >= 7), J(r.targets));
});
check('Switching to a machine with bigger numbers is not a PR; a real gain on it is', () => {
  reset();
  log(day(1), sets(20, [13, 13, 12, 12]), 'precor');
  log(day(2), sets(30, [13, 13, 12, 12]), 'lf');
  assert.deepStrictEqual(run(`sessionPRs(workouts[${J(day(2) + '_lift')}])`), [], 'same effort on a heavier-reading stack');
  log(day(3), sets(32.5, [15, 15, 15, 15]), 'lf');
  const prs = run(`sessionPRs(workouts[${J(day(3) + '_lift')}])`);
  assert.strictEqual(prs.length, 1); assert.ok(prs[0].v > prs[0].prev);
});
check('Legacy: unlabeled sessions are treated as the machine you name for them', () => {
  reset({ ...REG, byExercise: { [EX]: { legacy: 'precor' } } });
  log(day(1), sets(20, [15, 15, 15, 15]));
  const r = rec(day(2), 'precor');
  assert.ok(!r.calib); assert.deepStrictEqual(r.targets.map(t => t.w), [25, 25, 25, 25]);
  assert.ok(rec(day(2), 'lf').calib, 'a different machine still calibrates');
});
check('A manual factor converts immediately, no calibration session', () => {
  reset({ ...REG, byExercise: { [EX]: { manual: { lf: 0.8 } } } });
  log(day(1), sets(20, [15, 15, 15, 15]), 'precor');
  const r = rec(day(2), 'lf');
  assert.ok(!r.calib); assert.deepStrictEqual(r.targets.map(t => t.w), [32.5, 32.5, 32.5, 32.5], '25 lb on Precor ≈ 31.25 → 32.5 on LF');
});
check('Agent targetLb is in reference pounds and converts to the machine', () => {
  reset({ ...REG, byExercise: { [EX]: { manual: { kgs: 1.5 } } } });
  const prog = JSON.parse(JSON.stringify(ctx.ProgramLib.BUILTIN));
  prog.sessions['PUSH A'].exercises.find(e => e.name === EX).targetLb = 66;
  vm.runInContext(`applyProgram(${J(prog)})`, ctx);
  log(day(1), sets(20, [12, 12, 12, 12]), 'precor');
  const r = rec(day(2), 'kgs');   // 1 kg ≈ 1.5 × 2.2 = 3.3 lb on Precor; 66 lb ≈ 20 kg
  assert.ok(r.targets.every(t => t.w === 20), J(r.targets)); assert.ok(/Agent target 20 kg/.test(r.status.text) && /66 lb on the reference machine/.test(r.why));
  vm.runInContext('applyProgram(ProgramLib.BUILTIN)', ctx);
});
check('Volume uses reference pounds', () => {
  reset({ ...REG, byExercise: { [EX]: { manual: { kgs: 1.5 } } } });
  log(day(1), sets(20, [10]), 'precor');
  log(day(2), sets(20, [10]), 'kgs');
  near(run(`exVol(workouts[${J(day(2) + '_lift')}].exercises[0])`), 20 * 3.307 * 10, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
