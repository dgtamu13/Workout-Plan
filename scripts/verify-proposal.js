#!/usr/bin/env node
// Tests for docs/plan-proposal.js: validating next-week-plan.json, the per-change review (reasons, auto/approval tags),
// and applying the accepted changes to config/program and config/plan. Run with: npm test
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ProgramLib = require('../docs/program.js');
globalThis.ProgramLib = ProgramLib;
const P = require('../docs/plan-proposal.js');

const root = path.join(__dirname, '..');
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(root, 'docs/examples/next-week-plan.example.json'), 'utf8'));
const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/meal-plan-sample.json'), 'utf8'));
const clone = v => JSON.parse(JSON.stringify(v));
const ctx = () => ({ program: clone(ProgramLib.BUILTIN), plan: clone(SAMPLE.plan), foods: clone(SAMPLE.foods) });
const mut = fn => { const f = clone(EXAMPLE); fn(f); return f; };
const review = (f, c = ctx()) => P.review(f, c);

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); }
}
const rejects = (name, fn, re) => check(`Rejects ${name}`, () => {
  const r = review(mut(fn)); assert.strictEqual(r.ok, false, 'should be rejected');
  assert.ok(r.errors.some(e => re.test(e)), `no error matched ${re}: ${JSON.stringify(r.errors)}`);
});
const byRef = (r, ref) => r.changes.find(c => c.id === ref);

console.log('The example file');
check('Validates and every change carries a reason from the changeLog', () => {
  const r = review(EXAMPLE); assert.deepStrictEqual(r.errors, []); assert.ok(r.ok);
  assert.ok(r.changes.length > 10); assert.ok(r.changes.every(c => c.reason && c.logId && c.tag && c.id));
});
check('Changes are grouped lifting, core, cardio and meals with old and new values', () => {
  const r = review(EXAMPLE);
  assert.deepStrictEqual([...new Set(r.changes.map(c => c.group))].sort(), ['cardio', 'core', 'lifting', 'meals']);
  const inc = byRef(r, 'lifting/PUSH A/Incline DB Press/targetLb'); assert.deepStrictEqual([inc.from, inc.to], ['(none)', '55 lb']);
  const rounds = byRef(r, 'cardio/PUSH A/rounds'); assert.deepStrictEqual([rounds.from, rounds.to], ['10', '12']);
  const watts = byRef(r, 'cardio/PUSH A/targetAvgWatts'); assert.deepStrictEqual([watts.from, watts.to], ['(none)', '210 W']);
  const z2 = byRef(r, 'cardio/LEGS A/durationMin'); assert.deepStrictEqual([z2.from, z2.to], ['30 min', '35 min']);
  const kcal = byRef(r, 'meals/targets/training/kcal'); assert.deepStrictEqual([kcal.from, kcal.to], ['2500 kcal', '2600 kcal']);
  const core = byRef(r, 'core/A/Cable Crunch/target'); assert.deepStrictEqual([core.from, core.to], ['15 reps', '18 reps']);
  assert.ok(byRef(r, 'lifting/PUSH A/Pec Deck / Cable Fly').kind === 'remove' && byRef(r, 'lifting/PUSH A/Cable Crossover').kind === 'add');
  assert.ok(/Hit 15 reps/.test(inc.reason) && /7-day average/.test(kcal.reason));
});
check('Auto changes (including a stall swap) start accepted; approval changes (calories) start unaccepted', () => {
  const r = review(EXAMPLE), d = P.defaults(r.changes);
  for (const c of r.changes) assert.strictEqual(d[c.id], c.tag === 'auto', c.id);
  assert.strictEqual(byRef(r, 'lifting/PUSH A/Incline DB Press/targetLb').tag, 'auto');
  assert.strictEqual(byRef(r, 'cardio/PUSH A/rounds').tag, 'auto');
  const out = byRef(r, 'lifting/PUSH A/Pec Deck / Cable Fly'), inn = byRef(r, 'lifting/PUSH A/Cable Crossover');
  assert.ok(out.tag === 'auto' && inn.tag === 'auto' && out.swap && inn.swap && !out.forced, 'a swap tagged auto is automatic');
  assert.ok(d[out.id] && d[inn.id] && out.partner === inn.id && inn.partner === out.id);
  assert.strictEqual(byRef(r, 'meals/targets/training/kcal').tag, 'approval');
  assert.strictEqual(d['meals/targets/training/kcal'], false);
});
check('Adding an exercise outside a swap, any meal change and a deload pull-forward need approval even if the file tags them auto', () => {
  const f = mut(x => { x.changeLog.find(c => c.id === 'c3').kind = 'volume'; x.changeLog.find(c => c.id === 'c7').tag = 'auto'; x.approvals = []; });
  const r = review(f); assert.ok(r.ok, r.errors.join());
  const add = byRef(r, 'lifting/PUSH A/Cable Crossover'), kcal = byRef(r, 'meals/targets/training/c');
  assert.ok(add.tag === 'approval' && add.forced && kcal.tag === 'approval' && kcal.forced);
  assert.strictEqual(P.defaults(r.changes)[add.id], false);
  const dl = mut(x => { x.deload = { weekStart: '2026-11-03', evidence: 'Energy 2/5 and soreness 2/5 on 10/30 and 10/31; missed rep targets on PUSH A and PULL A.' }; x.changeLog.push({ id: 'c8', area: 'lifting', tag: 'auto', kind: 'deload-pull-forward', refs: ['lifting/deload'], reason: 'Readiness and performance both dropped.' }); });
  const d = review(dl); assert.ok(d.ok, d.errors.join()); const ch = byRef(d, 'lifting/deload'); assert.ok(ch.tag === 'approval' && ch.forced && /Readiness/.test(ch.reason) && /2\/5/.test(ch.evidence));
});
check('An agent can still ask for approval on a swap', () => {
  const r = review(mut(x => { x.changeLog.find(c => c.id === 'c3').tag = 'approval'; x.approvals.push({ changeId: 'c3', question: 'Swap?' }); }));
  assert.ok(r.ok, r.errors.join()); assert.strictEqual(byRef(r, 'lifting/PUSH A/Cable Crossover').tag, 'approval'); assert.strictEqual(P.defaults(r.changes)['lifting/PUSH A/Cable Crossover'], false);
});

console.log('Validation');
rejects('an unknown top-level field', f => { f.surprise = 1; }, /surprise: unknown field/);
rejects('an unknown field on a lifting exercise', f => { f.lifting['PUSH A'][0].tempo = '3-1-1'; }, /lifting\["PUSH A"\]\[0\]\.tempo: unknown field/);
rejects('an unknown field on a cardio entry', f => { f.cardio[0].zone = 4; }, /cardio\[0\]\.zone: unknown field/);
rejects('an unknown field in meals, a menu item and the changeLog', f => { f.meals.extra = 1; }, /meals\.extra: unknown field/);
rejects('an unknown changeLog field', f => { f.changeLog[0].priority = 1; }, /changeLog\[0\]\.priority: unknown field/);
rejects('the wrong schema name', f => { f.schema = 'training-calendar-plan'; }, /schema: must be/);
rejects('a missing generatedAt', f => { delete f.generatedAt; }, /generatedAt/);
rejects('HIIT rounds above 16', f => { f.cardio[0].rounds = 17; }, /17 is over the limit of 16 HIIT rounds/);
check('HIIT rounds of exactly 16 and Zone 2 of exactly 60 minutes are allowed', () => {
  const r = review(mut(f => { f.cardio[0].rounds = 16; f.cardio[1].durationMin = 60; })); assert.ok(r.ok, r.errors.join());
});
rejects('Zone 2 longer than 60 minutes', f => { f.cardio[1].durationMin = 61; }, /61 minutes is over the limit of 60/);
rejects('a Zone 2 heart rate outside 136–148', f => { f.cardio[1].hrHigh = 155; }, /136–148/);
rejects('HIIT on a legs day', f => { Object.assign(f.cardio[0], { session: 'LEGS B' }); }, /only push and pull sessions can switch|push and pull days only/);
rejects('a cardio date outside the week', f => { f.cardio[0].date = '2026-11-20'; }, /must fall in the week starting 2026-11-03/);
rejects('a protein change', f => { f.meals.targets.training.p = 205; }, /protein must not change \(it is 200 g/);
rejects('a calorie change of 151', f => { f.meals.targets.training.kcal = 2651; }, /limited to 150 kcal.*151/);
check('A calorie change of exactly 150 (up or down) is allowed, on either target', () => {
  const up = review(mut(f => { f.meals.targets.training.kcal = 2650; })); assert.ok(up.ok, up.errors.join());
  const down = review(mut(f => { f.meals.targets.rest = { kcal: 2000 }; f.changeLog.find(c => c.id === 'c7').refs.push('meals/targets/rest'); })); assert.ok(down.ok, down.errors.join());
  const too = review(mut(f => { f.meals.targets.rest = { kcal: 1999 }; })); assert.ok(!too.ok && /rest\.kcal.*limited/.test(too.errors.join()));
});
const kcalRec = (appliedAt, extra = {}) => ({ id: 'p1', generatedAt: '2026-10-26T20:00:00Z', appliedAt, accepted: [{ id: 'meals/targets/training/kcal' }], rejected: [], ...extra });
const NOW = Date.parse('2026-11-02T20:00:00Z'), withApplied = (...recs) => ({ ...ctx(), applied: recs, now: NOW });
check('Calorie lockout: a calorie change within 14 days of the last one is rejected, with the date it ends', () => {
  const r = review(EXAMPLE, withApplied(kcalRec('2026-10-27T12:00:00Z')));
  assert.ok(!r.ok && /calories were last changed on 2026-10-27; the 14-day lockout between calorie changes runs until 2026-11-10/.test(r.errors.join()), r.errors.join());
});
check('Calorie lockout: allowed from exactly 14 days after the last change', () => {
  assert.ok(review(EXAMPLE, withApplied(kcalRec('2026-10-19T20:00:00Z'))).ok, 'generatedAt 2026-11-02T20:00 is 14 days after 10-19T20:00');
  assert.ok(!review(EXAMPLE, withApplied(kcalRec('2026-10-19T20:00:01Z'))).ok, 'one second short');
});
check('Calorie lockout: undone plans, plans without an accepted calorie change, and unchanged calories do not count', () => {
  assert.ok(review(EXAMPLE, withApplied(kcalRec('2026-10-30T12:00:00Z', { undoneAt: '2026-10-31T00:00:00Z' }))).ok);
  assert.ok(review(EXAMPLE, withApplied({ ...kcalRec('2026-10-30T12:00:00Z'), accepted: [{ id: 'meals/targets/training/c' }, { id: 'lifting/PUSH A/Incline DB Press/targetLb' }], rejected: [{ id: 'meals/targets/training/kcal' }] })).ok);
  const keep = review(mut(f => { f.meals.targets.training.kcal = 2500; f.meals.targets.training.c = 290; }), withApplied(kcalRec('2026-10-30T12:00:00Z')));
  assert.ok(keep.ok, keep.errors.join()); // carbs and menu changes are allowed during the lockout when kcal is untouched
});
check('Calorie lockout: a future-dated generatedAt cannot skip it (the real clock counts too)', () => {
  const f = mut(x => { x.generatedAt = '2027-06-01T00:00:00Z'; });
  const r = review(f, { ...withApplied(kcalRec('2027-05-25T12:00:00Z')), now: Date.parse('2027-05-27T00:00:00Z') });
  assert.ok(!r.ok && /last changed on 2027-05-25/.test(r.errors.join()), r.errors.join());
  const stale = review(mut(x => { x.generatedAt = '2026-10-01T00:00:00Z'; }), { ...withApplied(kcalRec('2026-10-30T12:00:00Z')), now: Date.parse('2026-11-02T20:00:00Z') });
  assert.ok(!stale.ok && /last changed on 2026-10-30/.test(stale.errors.join()), 'a backdated file is judged by the real clock');
  assert.ok(review(f, { ...withApplied(kcalRec('2026-10-30T12:00:00Z')), now: Date.parse('2026-11-20T00:00:00Z') }).ok, 'allowed once 14 days have really passed');
});
check('Calorie lockout: the most recent calorie change decides', () => {
  const r = review(EXAMPLE, withApplied(kcalRec('2026-09-01T12:00:00Z'), kcalRec('2026-10-30T12:00:00Z', { id: 'p2' })));
  assert.ok(!r.ok && /last changed on 2026-10-30/.test(r.errors.join()));
});
rejects('a machine name that could carry markup', f => { f.cardio[0].machine = '<img src=x onerror=alert(1)>'; }, /cardio\[0\]\.machine: must be a machine name/);
rejects('a food id that is an object prototype key', f => { f.meals.menus.A.items[0].food = 'constructor'; }, /unknown food "constructor"/);
rejects('a menu item with an unknown food', f => { f.meals.menus.A.items[0].food = 'nope'; }, /unknown food "nope"/);
rejects('a new exercise missing required fields', f => { f.lifting['PUSH A'][2] = { name: 'Cable Crossover' }; }, /lifting\["PUSH A"\]\[2\]\.muscleGroup: required for a new exercise/);
rejects('a bad rep range on an existing exercise', f => { f.lifting['PUSH A'][0].reps = { low: 15, high: 10 }; }, /lifting\["PUSH A"\]\[0\]\.reps/);
rejects('two swaps in one session in one week', f => { f.lifting['PUSH A'][3] = { name: 'Cable Shoulder Press', muscleGroup: ['Shoulders'], sets: 3, reps: { low: 12, high: 15 }, rir: { low: 1, high: 2 }, restSec: { low: 60, high: 90 }, progression: 'upper' }; f.changeLog.find(c => c.id === 'c3').refs.push('lifting/PUSH A/Cable Shoulder Press', 'lifting/PUSH A/Machine Shoulder Press'); }, /only one swap is allowed per session per week/);
rejects('a swap to a different muscle group', f => { f.lifting['PUSH A'][2].muscleGroup = ['Triceps']; }, /works Triceps but Pec Deck \/ Cable Fly, the exercise it replaces, works Chest/);
rejects('a swap to a different movement pattern', f => { f.lifting['PUSH A'][2].pattern = 'vertical-press'; }, /Cable Crossover is a vertical-press but Pec Deck \/ Cable Fly, the exercise it replaces, is a fly/);
rejects('a swap whose new exercise has no pattern', f => { delete f.lifting['PUSH A'][2].pattern; }, /Cable Crossover needs a "pattern"/);
const logs = (dates, reps, name = 'Pec Deck / Cable Fly') => Object.fromEntries(dates.map(d => [`${d}_lift`, { date: d, type: 'lift', session: 'PUSH A', exercises: [{ name, planned: name, skipped: false, sets: reps.map(r => ({ w: 100, r })) }] }]));
check('Stall check: a swap needs 3 logged sessions in a row that missed the top of the rep range', () => {
  const stalled = logs(['2026-10-20', '2026-10-27', '2026-10-30'], [12, 13, 13]);
  assert.ok(review(EXAMPLE, { ...ctx(), workouts: stalled }).ok, 'three stalled sessions');
  const few = review(EXAMPLE, { ...ctx(), workouts: logs(['2026-10-27', '2026-10-30'], [12, 13, 13]) });
  assert.ok(!few.ok && /has 2 logged sessions, and a stall swap needs 3 in a row without reaching the top of the rep range \(15 reps on every set\)/.test(few.errors.join()), few.errors.join());
  const hit = review(EXAMPLE, { ...ctx(), workouts: { ...stalled, '2026-10-30_lift': logs(['2026-10-30'], [15, 15, 15])['2026-10-30_lift'] } });
  assert.ok(!hit.ok && /reached the top of the rep range \(15 reps on every set\) on 2026-10-30/.test(hit.errors.join()), hit.errors.join());
  assert.ok(review(EXAMPLE, { ...ctx(), workouts: { ...logs(['2026-09-01'], [15, 15, 15]), ...stalled } }).ok, 'an older session at the top is outside the last 3');
  assert.ok(!review(EXAMPLE, { ...ctx(), workouts: {} }).ok, 'no history at all is not a stall');
});
check('Stall check ignores skipped exercises and sessions after the plan was generated', () => {
  const w = logs(['2026-10-20', '2026-10-27', '2026-10-30'], [12, 13, 13]);
  w['2026-10-30_lift'].exercises[0].skipped = true;
  assert.ok(!review(EXAMPLE, { ...ctx(), workouts: w }).ok, 'only two counted sessions');
  assert.ok(!review(EXAMPLE, { ...ctx(), workouts: logs(['2026-11-10', '2026-11-12', '2026-11-14'], [12, 13, 13]) }).ok, 'future logs do not count');
});
const switchTo = (f, session, e) => { f.cardio.push(Object.assign({ date: '2026-11-06', session }, e)); f.changeLog.push({ id: 'c9', area: 'cardio', tag: 'auto', kind: 'cardio-progression', refs: [`cardio/${session}`], reason: 'Add a third HIIT day.' }); };
check('A push or pull Zone 2 session can switch to HIIT (always needs approval); other sessions cannot', () => {
  const f = mut(x => switchTo(x, 'PUSH B', { type: 'hiit', machine: 'Rower', rounds: 8, workSec: 30, restSec: 30, targetAvgWatts: 190 }));
  const r = review(f); assert.ok(r.ok, r.errors.join());
  const ch = byRef(r, 'cardio/PUSH B/type'); assert.ok(ch.tag === 'approval' && ch.forced && /^Zone 2 · 25 min/.test(ch.from) && /^HIIT · 8 rounds/.test(ch.to));
  assert.ok(!r.changes.some(c => c.ref.startsWith('cardio/PUSH B/') && c.ref !== 'cardio/PUSH B/type'));
  const c = ctx(), res = P.apply(c, r.proposal, r.changes, [ch.id]);
  assert.deepStrictEqual(res.program.cardio.sessions['PUSH B'], { type: 'HIIT', machine: 'Rower', alternatives: ['Stationary Bike', 'Rower', 'Stair Master'], rounds: 8, workSec: 30, restSec: 30, targetAvgWatts: 190 });
  assert.deepStrictEqual(ProgramLib.validate(res.program), []);
  assert.ok(!review(mut(x => switchTo(x, 'LEGS B', { type: 'hiit', machine: 'Rower', rounds: 8, workSec: 30, restSec: 30, targetAvgWatts: 190 }))).ok);
});
check('HIIT sessions per week are capped at 4', () => {
  const four = review(mut(x => { switchTo(x, 'PUSH B', { type: 'hiit', machine: 'Rower', rounds: 8, workSec: 30, restSec: 30, targetAvgWatts: 190 }); x.cardio.push({ date: '2026-11-07', session: 'PULL B', type: 'hiit', machine: 'Treadmill', rounds: 8, workSec: 30, restSec: 30, targetAvgWatts: 150 }); x.changeLog[x.changeLog.length - 1].refs.push('cardio/PULL B'); }));
  assert.ok(four.ok, four.errors.join()); // PUSH A, PULL A, PUSH B, PULL B is 4
  const p = ctx(); p.program.cardio.sessions['LEGS B'] = { ...p.program.cardio.sessions['PUSH A'] }; // a fifth HIIT session already in the program
  const five = review(mut(x => { switchTo(x, 'PUSH B', { type: 'hiit', machine: 'Rower', rounds: 8, workSec: 30, restSec: 30, targetAvgWatts: 190 }); x.cardio.push({ date: '2026-11-07', session: 'PULL B', type: 'hiit', machine: 'Treadmill', rounds: 8, workSec: 30, restSec: 30, targetAvgWatts: 150 }); x.changeLog[x.changeLog.length - 1].refs.push('cardio/PULL B'); }), p);
  assert.ok(!five.ok && /5 HIIT sessions a week is over the limit of 4/.test(five.errors.join()), five.errors.join());
});
rejects('a change with no changeLog reason', f => { f.changeLog = f.changeLog.filter(c => c.id !== 'c2'); }, /Leg Press: Target load.*has no reason/);
rejects('an approval-tagged entry with no approvals item', f => { f.approvals = f.approvals.filter(a => a.changeId !== 'c7'); }, /"c7" is tagged approval but has no matching approvals entry/);
rejects('an approvals item for an auto entry', f => { f.approvals.push({ changeId: 'c1', question: 'Really?' }); }, /"c1" is tagged auto, not approval/);
rejects('a changeLog path in the wrong area', f => { f.changeLog[0].refs = ['core/A/Cable Crunch']; }, /every path must start with "lifting\/"/);
rejects('a file with nothing to change', f => { delete f.lifting; delete f.core; delete f.cardio; delete f.meals; f.changeLog = []; f.approvals = []; }, /nothing to change/);
check('Bad JSON is reported, not thrown', () => { const r = P.parse('{nope', ctx()); assert.ok(!r.ok && /Not valid JSON/.test(r.errors[0])); });
check('The placeholder file (no generatedAt) is not a proposal', () => {
  const r = P.parse(JSON.stringify({ schema: 'training-calendar-next-week-plan', version: 1, note: 'No proposal yet.' }), ctx()); assert.ok(!r.ok);
});

console.log('Applying');
const accepted = r => r.changes.map(c => c.id);
check('Accepting everything updates config/program (version bumped, source agent) and config/plan', () => {
  const c = ctx(), r = review(EXAMPLE, c), res = P.apply(c, r.proposal, r.changes, accepted(r), Date.parse('2026-11-03T12:00:00Z'));
  assert.ok(res.ok, JSON.stringify(res.errors)); assert.deepStrictEqual(ProgramLib.validate(res.program), []);
  assert.strictEqual(res.program.version, 2); assert.strictEqual(res.program.source, 'agent');
  const push = res.program.sessions['PUSH A'].exercises.map(e => e.name);
  assert.deepStrictEqual(push, ['Incline DB Press', 'Cable Lateral Raise', 'Cable Crossover', 'Machine Shoulder Press', 'Overhead Cable Extension', 'Tricep Pushdown', 'Face Pulls']);
  assert.strictEqual(res.program.sessions['PUSH A'].exercises[0].targetLb, 55);
  assert.strictEqual(res.program.sessions['LEGS A'].exercises[0].targetLb, 360);
  assert.strictEqual(res.program.core.circuits.A.exercises[0].target, '18 reps');
  assert.strictEqual(res.program.cardio.sessions['PUSH A'].rounds, 12); assert.strictEqual(res.program.cardio.sessions['PUSH A'].targetAvgWatts, 210);
  assert.strictEqual(res.program.cardio.sessions['LEGS A'].durationMin, 35);
  assert.deepStrictEqual(res.plan.targets.training, { kcal: 2600, p: 200, f: 65, c: 304 }); assert.deepStrictEqual(res.plan.targets.rest, SAMPLE.plan.targets.rest);
  assert.strictEqual(res.plan.menus.A.items.find(i => i.food === 'rice').train, 135);
  assert.strictEqual(res.plan.menus.B.name, SAMPLE.plan.menus.B.name, 'menus not in the file are untouched');
});
check('Applied lifting shows the target load in the rows the app renders', () => {
  const c = ctx(), r = review(EXAMPLE, c), res = P.apply(c, r.proposal, r.changes, accepted(r));
  const rows = ProgramLib.liftTables(res.program);
  assert.ok(/Target load: 55 lb/.test(rows['PUSH A'][0][5])); assert.strictEqual(rows['PUSH A'][2][0], 'Cable Crossover');
});
check('Rejected changes are left out and recorded; unaccepted approvals change nothing', () => {
  const c = ctx(), r = review(EXAMPLE, c), d = P.defaults(r.changes);
  d['cardio/LEGS A/durationMin'] = false; // reject one auto change
  const res = P.apply(c, r.proposal, r.changes, Object.keys(d).filter(k => d[k]), Date.parse('2026-11-03T12:00:00Z'));
  assert.ok(res.ok); assert.strictEqual(res.plan, null, 'no meal change was accepted');
  assert.strictEqual(res.program.cardio.sessions['LEGS A'].durationMin, 30);
  assert.ok(res.program.sessions['PUSH A'].exercises.some(e => e.name === 'Cable Crossover'), 'the swap is accepted by default');
  assert.strictEqual(res.program.sessions['PUSH A'].exercises[0].targetLb, 55);
  const rec = res.record;
  assert.strictEqual(rec.id, P.proposalId(EXAMPLE.generatedAt)); assert.strictEqual(rec.generatedAt, EXAMPLE.generatedAt); assert.strictEqual(rec.appliedAt, '2026-11-03T12:00:00.000Z');
  assert.strictEqual(rec.programVersion, 2); assert.strictEqual(rec.accepted.length + rec.rejected.length, r.changes.length);
  assert.ok(rec.rejected.some(x => x.id === 'cardio/LEGS A/durationMin' && x.reason) && rec.rejected.some(x => x.id === 'meals/targets/training/kcal'));
  assert.deepStrictEqual(rec.before.program, ProgramLib.BUILTIN, 'the record keeps the program as it was, for Undo'); assert.ok(!('plan' in rec.before));
  assert.ok(rec.accepted.every(x => x.reason && x.label));
});
check('Rejecting a swap rejects both halves, even if only one was unchecked', () => {
  const c = ctx(), r = review(EXAMPLE, c), d = P.defaults(r.changes); d['lifting/PUSH A/Cable Crossover'] = false;
  const res = P.apply(c, r.proposal, r.changes, Object.keys(d).filter(k => d[k]));
  const names = res.program.sessions['PUSH A'].exercises.map(e => e.name);
  assert.ok(names.includes('Pec Deck / Cable Fly') && !names.includes('Cable Crossover'));
  assert.ok(res.record.rejected.some(x => x.id === 'lifting/PUSH A/Pec Deck / Cable Fly'));
});
check('Accepting only meal changes leaves the program (and its version) alone', () => {
  const c = ctx(), r = review(EXAMPLE, c), res = P.apply(c, r.proposal, r.changes, r.changes.filter(x => x.group === 'meals').map(x => x.id));
  assert.strictEqual(res.program, null); assert.ok(res.plan); assert.strictEqual(res.record.programVersion, null);
});
check('Rejecting everything still produces a record and changes nothing', () => {
  const c = ctx(), r = review(EXAMPLE, c), res = P.apply(c, r.proposal, r.changes, []);
  assert.ok(res.ok && res.program === null && res.plan === null); assert.strictEqual(res.record.accepted.length, 0); assert.strictEqual(res.record.rejected.length, r.changes.length);
});
check('Accepting a pull-forward deload records the week in the program', () => {
  const f = mut(x => { x.deload = { weekStart: '2026-11-03', evidence: 'Energy 2/5, soreness 2/5 twice; missed rep targets two sessions in a row.' }; x.changeLog.push({ id: 'c8', area: 'lifting', tag: 'approval', kind: 'deload-pull-forward', refs: ['lifting/deload'], reason: 'Both triggers fired.' }); x.approvals.push({ changeId: 'c8', question: 'Pull the deload forward to the week of Nov 3?' }); });
  const c = ctx(), r = review(f, c), res = P.apply(c, r.proposal, r.changes, ['lifting/deload']);
  assert.deepStrictEqual(res.program.deloadWeeks, ['2026-11-03']); assert.strictEqual(res.program.version, 2); assert.deepStrictEqual(ProgramLib.validate(res.program), []);
});
check('Applying never changes its inputs', () => {
  const c = ctx(), before = JSON.stringify(c), r = review(EXAMPLE, c), snap = JSON.stringify(r.proposal);
  P.apply(c, r.proposal, r.changes, accepted(r)); assert.strictEqual(JSON.stringify(c), before); assert.strictEqual(JSON.stringify(r.proposal), snap);
});
check('The same file reviewed after applying shows no changes', () => {
  const c = ctx(), r = review(EXAMPLE, c), res = P.apply(c, r.proposal, r.changes, accepted(r));
  const again = review(EXAMPLE, { program: res.program, plan: res.plan, foods: c.foods });
  assert.ok(again.ok || /calorie change is limited|protein/.test(again.errors.join()), again.errors.join());
});

console.log('New proposal detection');
check('isNewer compares generatedAt with every applied plan', () => {
  assert.strictEqual(P.isNewer('2026-11-02T20:00:00Z', []), true);
  assert.strictEqual(P.isNewer('2026-11-02T20:00:00Z', [{ generatedAt: '2026-10-26T20:00:00Z' }]), true);
  assert.strictEqual(P.isNewer('2026-11-02T20:00:00Z', [{ generatedAt: '2026-11-02T20:00:00Z' }]), false);
  assert.strictEqual(P.isNewer('2026-11-02T20:00:00Z', [{ generatedAt: '2026-11-09T20:00:00Z' }, { generatedAt: '2026-10-26T20:00:00Z' }]), false);
  assert.strictEqual(P.isNewer('not a date', []), false);
});

console.log('Review fixes');
check('Equivalent spellings of an existing exercise are not changes ("Chest" vs ["Chest"], role compound, restSec 60 vs {60,60})', () => {
  const f = mut(x => { Object.assign(x.lifting['LEGS A'][5], { muscleGroup: 'Calves', role: 'isolation' }); Object.assign(x.lifting['PUSH A'][1], { role: 'isolation', restSec: { low: 60, high: 90 } }); });
  const r = review(f); assert.ok(r.ok, r.errors.join()); assert.ok(!r.changes.some(c => /Muscle group|Role|Rest/.test(c.label)), 'no phantom changes');
  const p = ctx(); p.program.sessions['PUSH A'].exercises[1].restSec = 75;
  const g = review(mut(x => { x.lifting['PUSH A'][1].restSec = 75; x.lifting['LEGS A'][0].role = 'compound'; }), p); assert.ok(g.ok && !g.changes.some(c => /Rest/.test(c.label)), g.errors.join());
});
check('Stall check only counts sessions of the same workout (a lift in PUSH A and PULL A), and can skip uncountable ones', () => {
  const mk = (d, session, r) => ({ date: d, type: 'lift', session, exercises: [{ name: 'Pec Deck / Cable Fly', skipped: false, sets: [{ w: 1, r }, { w: 1, r }] }] });
  const other = { a: mk('2026-10-20', 'PULL A', 10), b: mk('2026-10-27', 'PULL A', 10), c: mk('2026-10-30', 'PULL A', 10) };
  const r = review(EXAMPLE, { ...ctx(), workouts: other }); assert.ok(!r.ok && /has 0 logged sessions/.test(r.errors.join()), r.errors.join());
  const mine = { a: mk('2026-10-20', 'PUSH A', 10), b: mk('2026-10-27', 'PUSH A', 10), c: mk('2026-10-30', 'PUSH A', 10) };
  assert.ok(review(EXAMPLE, { ...ctx(), workouts: mine }).ok);
  const skipped = review(EXAMPLE, { ...ctx(), workouts: mine, countable: w => w.date !== '2026-10-30' }); assert.ok(!skipped.ok && /has 2 logged sessions/.test(skipped.errors.join()));
});
check('HIIT on a legs session reports one error, not two', () => {
  const r = review(mut(f => { Object.assign(f.cardio[0], { session: 'LEGS B' }); })); assert.strictEqual(r.errors.filter(e => /cardio\[0\]/.test(e)).length, 1, r.errors.join());
});
check('A plan built against another program version gets a warning, not an error', () => {
  const r = review(mut(f => { f.basedOnProgramVersion = 3; })); assert.ok(r.ok); assert.ok(r.warnings.some(w => /built against program version 3, but yours is version 1/.test(w)), r.warnings.join());
  assert.ok(!review(mut(f => { f.basedOnProgramVersion = 1; })).warnings.length);
});
check('Program documents with markup in a machine name or alternative are invalid', () => {
  const d = clone(ProgramLib.BUILTIN); d.cardio.sessions['PUSH A'].machine = '<b>x</b>'; assert.ok(ProgramLib.validate(d).some(e => /machine/.test(e)));
  const e = clone(ProgramLib.BUILTIN); e.cardio.sessions['PUSH A'].alternatives = ['Rower', '"><script>']; assert.ok(ProgramLib.validate(e).some(x => /alternatives/.test(x)));
  assert.deepStrictEqual(ProgramLib.validate(ProgramLib.BUILTIN), []);
});

console.log('Documentation');
check('PLAN_SCHEMA.md has a full example identical to the shipped example file, and it validates', () => {
  const md = fs.readFileSync(path.join(root, 'PLAN_SCHEMA.md'), 'utf8');
  const m = md.match(/<!-- example:start -->\s*```json\n([\s\S]*?)```\s*<!-- example:end -->/);
  assert.ok(m, 'example block not found'); assert.deepStrictEqual(JSON.parse(m[1]), EXAMPLE); assert.ok(review(JSON.parse(m[1])).ok);
});
check('The limits table in PLAN_SCHEMA.md matches the limits in the code', () => {
  const md = fs.readFileSync(path.join(root, 'PLAN_SCHEMA.md'), 'utf8');
  assert.deepStrictEqual(P.LIMITS, { hiitRounds: 16, zone2Minutes: 60, kcalStep: 150, lockoutDays: 14, hiitSessions: 4, stallSessions: 3, zone2Hr: [136, 148] });
  assert.ok(/At most 16/.test(md) && /At most 60 minutes/.test(md) && /at most 150 kcal/.test(md) && /14 days/.test(md) && /136–148/.test(md));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
