// Proposed-plan logic for next-week-plan.json: validate the file, diff it against the current program and meal plan,
// and apply the accepted changes. Pure functions with no DOM or network access, so they run the same in the browser and
// in tests. The file format is documented in PLAN_SCHEMA.md.
(function (root) {
  'use strict';

  const lib = () => root.ProgramLib || (typeof require === 'function' ? require('./program.js') : null);
  const SESSIONS = ['PUSH A', 'PULL A', 'LEGS A', 'PUSH B', 'PULL B', 'LEGS B'];
  const CIRCUITS = ['A', 'B', 'C'];
  const SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];
  const DAYS = ['training', 'rest'];
  const AREAS = ['lifting', 'core', 'cardio', 'meals'];
  const TAGS = ['auto', 'approval'];
  const KINDS = ['progression', 'stall-swap', 'volume', 'deload-pull-forward', 'cardio-progression', 'calories', 'macros', 'readiness', 'other'];
  const SCHEMA = 'training-calendar-next-week-plan';
  const TOP_KEYS = ['schema', 'version', 'generatedAt', 'weekStart', 'basedOnProgramVersion', 'note', 'deload', 'lifting', 'core', 'cardio', 'meals', 'changeLog', 'approvals'];
  const EXERCISE_KEYS = ['name', 'muscleGroup', 'pattern', 'sets', 'reps', 'perSide', 'rir', 'restSec', 'progression', 'methods', 'role', 'cue', 'targetLb'];
  const NEW_EXERCISE_KEYS = ['name', 'muscleGroup', 'sets', 'reps', 'rir', 'restSec', 'progression'];
  const CORE_KEYS = ['name', 'sets', 'target'];
  const HIIT_KEYS = ['date', 'session', 'type', 'machine', 'rounds', 'workSec', 'restSec', 'targetAvgWatts'];
  const Z2_KEYS = ['date', 'session', 'type', 'machine', 'durationMin', 'hrLow', 'hrHigh'];
  const MACRO = { kcal: ['calories', 'kcal'], p: ['protein', 'g'], f: ['fat', 'g'], c: ['carbs', 'g'] };
  // Hard limits. A file outside them is rejected before it is shown.
  const LIMITS = { hiitRounds: 16, zone2Minutes: 60, kcalStep: 150, lockoutDays: 14, hiitSessions: 4, stallSessions: 3, zone2Hr: [136, 148] };
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const isInt = Number.isInteger;
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const validDate = s => {
    if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  };
  const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number), dt = new Date(y, m - 1, d + n); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; };
  const lower = s => String(s).toLowerCase();
  const unknownKeys = (obj, allowed, path, err) => Object.keys(obj).filter(k => !allowed.includes(k)).forEach(k => err(`${path ? path + '.' : ''}${k}`, 'unknown field'));
  // The id of the applied-plans record, taken from generatedAt.
  const proposalId = generatedAt => 'p' + String(generatedAt).replace(/[^0-9A-Za-z]/g, '');

  // The date of the most recent applied calorie target change (accepted and not undone), or null.
  const lastCalorieChange = applied => (applied || []).filter(r => !r.undoneAt && (r.accepted || []).some(c => /^meals\/targets\/\w+\/kcal$/.test(c.id)))
    .map(r => Date.parse(r.appliedAt)).filter(t => !Number.isNaN(t)).sort((a, b) => b - a)[0] ?? null;
  const dayStr = t => new Date(t).toISOString().slice(0, 10);

  // ── Validation ─────────────────────────────────────────────────
  // ctx: { program, plan, foods, applied }  the current program document, meal plan ({ targets, menus }), known foods, and the
  // applied-plans records (used for the 2-week calorie lockout).
  function validate(raw, ctx = {}) {
    const errors = [], warnings = [];
    const err = (path, msg) => errors.push(`${path}: ${msg}`);
    const fail = () => ({ ok: false, errors, warnings, proposal: null });
    if (!isObj(raw)) { errors.push('The file must contain a JSON object.'); return fail(); }
    const L = lib(), program = ctx.program || L.BUILTIN, plan = ctx.plan || null, foods = ctx.foods || {};
    const lastChange = lastCalorieChange(ctx.applied), gen = Date.parse(raw.generatedAt);
    const locked = lastChange !== null && !Number.isNaN(gen) && gen - lastChange < LIMITS.lockoutDays * 864e5;
    unknownKeys(raw, TOP_KEYS, '', err);
    if (raw.schema !== SCHEMA) err('schema', `must be "${SCHEMA}"`);
    if (raw.version !== 1) err('version', 'must be 1');
    const out = { schema: SCHEMA, version: 1, generatedAt: null, weekStart: null, basedOnProgramVersion: null, note: '', deload: null, lifting: {}, core: {}, cardio: [], meals: null, changeLog: [], approvals: [] };
    if (typeof raw.generatedAt !== 'string' || Number.isNaN(Date.parse(raw.generatedAt))) err('generatedAt', 'required ISO date-time, like "2026-11-02T20:00:00Z"'); else out.generatedAt = raw.generatedAt;
    if (!validDate(raw.weekStart)) err('weekStart', 'required date in YYYY-MM-DD format (the first day of the week this plan is for)'); else out.weekStart = raw.weekStart;
    if (raw.basedOnProgramVersion !== undefined) { if (isInt(raw.basedOnProgramVersion) && raw.basedOnProgramVersion >= 1) out.basedOnProgramVersion = raw.basedOnProgramVersion; else err('basedOnProgramVersion', 'must be a whole number, 1 or more'); }
    if (raw.note !== undefined) { if (typeof raw.note === 'string' && raw.note.length <= 2000) out.note = raw.note; else err('note', 'must be text up to 2000 characters'); }

    // deload: a pull-forward deload for one week.
    if (raw.deload !== undefined) {
      const d = raw.deload;
      if (!isObj(d)) err('deload', 'must be an object');
      else {
        unknownKeys(d, ['weekStart', 'evidence'], 'deload', err);
        if (!validDate(d.weekStart)) err('deload.weekStart', 'required date in YYYY-MM-DD format');
        if (!str(d.evidence, 600)) err('deload.evidence', 'required: the readiness and performance evidence that triggered the pull-forward');
        if (validDate(d.weekStart) && str(d.evidence, 600)) out.deload = { weekStart: d.weekStart, evidence: d.evidence.trim() };
      }
    }

    // lifting: per session, the full ordered exercise list. For an exercise already in the program, send only name plus the
    // fields that change; the rest is kept. A new exercise needs name, muscleGroup, sets, reps, rir, restSec and progression.
    if (raw.lifting !== undefined) {
      if (!isObj(raw.lifting)) err('lifting', 'must be an object keyed by session name');
      else for (const [s, list] of Object.entries(raw.lifting)) {
        const path = `lifting["${s}"]`;
        if (!SESSIONS.includes(s)) { err(path, `unknown session (use ${SESSIONS.join(', ')})`); continue; }
        if (!Array.isArray(list) || !list.length || list.length > 12) { err(path, 'must be a list of 1 to 12 exercises'); continue; }
        const cur = program.sessions[s].exercises, seen = new Set(), items = [];
        list.forEach((x, i) => {
          const p = `${path}[${i}]`;
          if (!isObj(x)) return err(p, 'must be an object');
          unknownKeys(x, EXERCISE_KEYS, p, err);
          if (!str(x.name, 60)) return err(`${p}.name`, 'required text up to 60 characters');
          const name = x.name.trim(), existing = cur.find(e => lower(e.name) === lower(name));
          if (seen.has(lower(name))) return err(p, `duplicate exercise "${name}" in this session`);
          seen.add(lower(name));
          if (!existing) NEW_EXERCISE_KEYS.filter(k => x[k] === undefined).forEach(k => err(`${p}.${k}`, `required for a new exercise ("${name}" is not in this session)`));
          const merged = { ...clone(existing || {}), ...clone(x), name: existing ? existing.name : name };
          if (Array.isArray(x.methods) && !x.methods.length) delete merged.methods;
          items.push(merged);
        });
        out.lifting[s] = items;
      }
    }
    if (raw.core !== undefined) {
      if (!isObj(raw.core)) err('core', 'must be an object keyed by circuit letter (A, B or C)');
      else for (const [c, list] of Object.entries(raw.core)) {
        const path = `core["${c}"]`;
        if (!CIRCUITS.includes(c)) { err(path, 'unknown circuit (use A, B or C)'); continue; }
        if (!Array.isArray(list) || !list.length || list.length > 8) { err(path, 'must be a list of 1 to 8 exercises'); continue; }
        const seen = new Set(), items = [];
        list.forEach((x, i) => {
          const p = `${path}[${i}]`;
          if (!isObj(x)) return err(p, 'must be an object');
          unknownKeys(x, CORE_KEYS, p, err);
          if (!str(x.name, 60)) return err(`${p}.name`, 'required text up to 60 characters');
          if (!isInt(x.sets) || x.sets < 1 || x.sets > 8) return err(`${p}.sets`, 'required whole number from 1 to 8');
          if (!str(x.target, 24) || !/\d/.test(x.target)) return err(`${p}.target`, 'required text with a number, like "15 reps", "10/side" or "45 sec"');
          if (seen.has(lower(x.name))) return err(p, `duplicate exercise "${x.name}" in this circuit`);
          seen.add(lower(x.name)); items.push({ name: x.name.trim(), sets: x.sets, target: x.target.trim() });
        });
        out.core[c] = items;
      }
    }

    // cardio: one dated entry per session, in the shape from the agent spec.
    if (raw.cardio !== undefined) {
      if (!Array.isArray(raw.cardio) || raw.cardio.length > 6) err('cardio', 'must be a list of up to 6 entries, one per session');
      else {
        const seen = new Set();
        raw.cardio.forEach((x, i) => {
          const p = `cardio[${i}]`;
          if (!isObj(x)) return err(p, 'must be an object');
          if (!SESSIONS.includes(x.session)) return err(`${p}.session`, `required, one of ${SESSIONS.join(', ')}`);
          if (seen.has(x.session)) return err(p, `more than one entry for ${x.session}`);
          seen.add(x.session);
          const kind = x.type === 'hiit' ? 'HIIT' : x.type === 'zone2' ? 'Zone 2' : null;
          if (!kind) return err(`${p}.type`, 'must be "hiit" or "zone2"');
          unknownKeys(x, x.type === 'hiit' ? HIIT_KEYS : Z2_KEYS, p, err);
          const entry = { date: null, session: x.session, type: x.type };
          if (!validDate(x.date)) err(`${p}.date`, 'required date in YYYY-MM-DD format');
          else if (out.weekStart && (x.date < out.weekStart || x.date > addDays(out.weekStart, 6))) err(`${p}.date`, `must fall in the week starting ${out.weekStart}`);
          else entry.date = x.date;
          const has = program.cardio.sessions[x.session];
          if (has.type !== kind && !/^(PUSH|PULL)/.test(x.session)) err(`${p}.type`, `${x.session} is a ${has.type} session and only push and pull sessions can switch between HIIT and Zone 2`);
          if (x.machine !== undefined) { if (str(x.machine, 40)) entry.machine = x.machine.trim(); else err(`${p}.machine`, 'must be text up to 40 characters'); }
          if (x.type === 'hiit') {
            if (!/^(PUSH|PULL)/.test(x.session)) err(`${p}.session`, 'HIIT is for push and pull days only');
            if (!isInt(x.rounds) || x.rounds < 1) err(`${p}.rounds`, 'required whole number, 1 or more');
            else if (x.rounds > LIMITS.hiitRounds) err(`${p}.rounds`, `${x.rounds} is over the limit of ${LIMITS.hiitRounds} HIIT rounds`);
            else entry.rounds = x.rounds;
            if (!isInt(x.workSec) || x.workSec < 5 || x.workSec > 600) err(`${p}.workSec`, 'required whole number of seconds, 5 to 600'); else entry.workSec = x.workSec;
            if (!isInt(x.restSec) || x.restSec < 0 || x.restSec > 600) err(`${p}.restSec`, 'required whole number of seconds, 0 to 600'); else entry.restSec = x.restSec;
            if (!isNum(x.targetAvgWatts) || x.targetAvgWatts <= 0 || x.targetAvgWatts >= 2000) err(`${p}.targetAvgWatts`, 'required number of watts above 0'); else entry.targetAvgWatts = x.targetAvgWatts;
          } else {
            if (!isInt(x.durationMin) || x.durationMin < 5) err(`${p}.durationMin`, 'required whole number of minutes, 5 or more');
            else if (x.durationMin > LIMITS.zone2Minutes) err(`${p}.durationMin`, `${x.durationMin} minutes is over the limit of ${LIMITS.zone2Minutes} minutes of Zone 2`);
            else entry.durationMin = x.durationMin;
            const [lo, hi] = LIMITS.zone2Hr;
            if (!isInt(x.hrLow) || !isInt(x.hrHigh) || x.hrLow < lo || x.hrHigh > hi || x.hrLow > x.hrHigh) err(`${p}.hrLow/hrHigh`, `required heart rates inside the ${lo}–${hi} bpm Zone 2 band, with hrLow at most hrHigh`);
            else { entry.hrLow = x.hrLow; entry.hrHigh = x.hrHigh; }
          }
          out.cardio.push(entry);
        });
        const hiitAfter = SESSIONS.filter(s => { const e = out.cardio.find(x => x.session === s); return e ? e.type === 'hiit' : program.cardio.sessions[s].type === 'HIIT'; }).length;
        if (hiitAfter > LIMITS.hiitSessions) err('cardio', `${hiitAfter} HIIT sessions a week is over the limit of ${LIMITS.hiitSessions}`);
      }
    }

    // meals: targets and menus. Protein stays fixed and each calorie target moves by at most 150 kcal.
    if (raw.meals !== undefined) {
      const mp = raw.meals, res = {};
      if (!isObj(mp)) err('meals', 'must be an object');
      else {
        unknownKeys(mp, ['targets', 'menus'], 'meals', err);
        if (mp.targets !== undefined) {
          if (!isObj(mp.targets)) err('meals.targets', 'must be an object with "training" and/or "rest"');
          else {
            res.targets = {};
            for (const [day, t] of Object.entries(mp.targets)) {
              const p = `meals.targets.${day}`;
              if (!DAYS.includes(day)) { err(p, 'must be "training" or "rest"'); continue; }
              if (!isObj(t)) { err(p, 'must be an object'); continue; }
              unknownKeys(t, Object.keys(MACRO), p, err);
              res.targets[day] = {};
              const now = (plan && plan.targets && plan.targets[day]) || {};
              for (const k of Object.keys(MACRO)) {
                if (t[k] === undefined) continue;
                const max = k === 'kcal' ? 6000 : 600, min = k === 'kcal' ? 500 : 0;
                if (!isNum(t[k]) || t[k] < min || t[k] > max) { err(`${p}.${k}`, `must be a number from ${min} to ${max}`); continue; }
                if (k === 'p' && isNum(now.p) && t.p !== now.p) { err(`${p}.p`, `protein must not change (it is ${now.p} g; the file has ${t.p} g)`); continue; }
                if (k === 'kcal' && isNum(now.kcal) && Math.abs(t.kcal - now.kcal) > LIMITS.kcalStep) { err(`${p}.kcal`, `a calorie change is limited to ${LIMITS.kcalStep} kcal per target (${now.kcal} to ${t.kcal} is ${Math.abs(t.kcal - now.kcal)})`); continue; }
                if (k === 'kcal' && isNum(now.kcal) && t.kcal !== now.kcal && locked) { err(`${p}.kcal`, `calories were last changed on ${dayStr(lastChange)}; the ${LIMITS.lockoutDays}-day lockout between calorie changes runs until ${dayStr(lastChange + LIMITS.lockoutDays * 864e5)}. Keep kcal at ${now.kcal} until then (carbs, fat and menu changes are still allowed)`); continue; }
                res.targets[day][k] = t[k];
              }
            }
          }
        }
        if (mp.menus !== undefined) {
          if (!isObj(mp.menus)) err('meals.menus', 'must be an object keyed by menu letter');
          else {
            res.menus = {};
            for (const [key, m] of Object.entries(mp.menus)) {
              const p = `meals.menus.${key}`;
              if (!/^[A-Za-z0-9]{1,3}$/.test(key)) { err(p, 'menu key must be 1 to 3 letters or numbers'); continue; }
              if (!isObj(m)) { err(p, 'must be an object'); continue; }
              unknownKeys(m, ['name', 'items'], p, err);
              const menu = { name: '', items: [] };
              if (!str(m.name, 80)) err(`${p}.name`, 'required text up to 80 characters'); else menu.name = m.name.trim();
              if (!Array.isArray(m.items) || !m.items.length || m.items.length > 40) err(`${p}.items`, 'must be a list of 1 to 40 items');
              else {
                const seen = new Set();
                m.items.forEach((it, i) => {
                  const ip = `${p}.items[${i}]`;
                  if (!isObj(it)) return err(ip, 'must be an object');
                  unknownKeys(it, ['food', 'slot', 'train', 'rest'], ip, err);
                  if (typeof it.food !== 'string' || !foods[it.food]) return err(`${ip}.food`, `unknown food "${it.food}" (use an existing food id)`);
                  if (!SLOTS.includes(it.slot)) return err(`${ip}.slot`, `must be one of ${SLOTS.join(', ')}`);
                  const bad = ['train', 'rest'].filter(k => !isNum(it[k]) || it[k] < 0 || it[k] > 2000);
                  if (bad.length) return err(`${ip}.${bad[0]}`, 'required grams, a number from 0 to 2000');
                  const id = `${it.slot}|${it.food}`;
                  if (seen.has(id)) return err(ip, `duplicate ${it.food} in ${it.slot}`);
                  seen.add(id); menu.items.push({ food: it.food, slot: it.slot, train: it.train, rest: it.rest });
                });
              }
              res.menus[key] = menu;
            }
          }
        }
        out.meals = res;
      }
    }

    // The proposed lifting, core and cardio must still make a valid program.
    if (!errors.length) {
      L.validate(candidate(program, out)).forEach(e => {
        if (/^sessions\[/.test(e)) errors.push(e.replace(/^sessions\["([^"]+)"\]\.exercises\[(\d+)\]/, (_, s, i) => `lifting["${s}"][${i}]`));
        else if (/^core\./.test(e)) errors.push(e.replace(/^core\.circuits\.(\w)\.exercises/, 'core["$1"]'));
        else if (/^cardio\./.test(e)) errors.push(e);
      });
    }

    // changeLog and approvals.
    if (!Array.isArray(raw.changeLog)) err('changeLog', 'required list: one entry for each change, with the reason');
    else {
      const ids = new Set();
      raw.changeLog.forEach((x, i) => {
        const p = `changeLog[${i}]`;
        if (!isObj(x)) return err(p, 'must be an object');
        unknownKeys(x, ['id', 'area', 'tag', 'kind', 'refs', 'reason', 'evidence'], p, err);
        if (!str(x.id, 40)) return err(`${p}.id`, 'required short text');
        if (ids.has(x.id)) return err(`${p}.id`, `duplicate id "${x.id}"`);
        ids.add(x.id);
        if (!AREAS.includes(x.area)) return err(`${p}.area`, `must be one of ${AREAS.join(', ')}`);
        if (!TAGS.includes(x.tag)) return err(`${p}.tag`, 'must be "auto" or "approval"');
        if (x.kind !== undefined && !KINDS.includes(x.kind)) return err(`${p}.kind`, `must be one of ${KINDS.join(', ')}`);
        if (!Array.isArray(x.refs) || !x.refs.length || !x.refs.every(r => str(r, 200))) return err(`${p}.refs`, 'required list of paths this entry explains, like "lifting/PUSH A/Incline DB Press/sets"');
        if (x.refs.some(r => r.split('/')[0] !== x.area)) return err(`${p}.refs`, `every path must start with "${x.area}/"`);
        if (!str(x.reason, 600)) return err(`${p}.reason`, 'required text up to 600 characters');
        if (x.evidence !== undefined && !str(x.evidence, 600)) return err(`${p}.evidence`, 'must be text up to 600 characters');
        out.changeLog.push({ id: x.id, area: x.area, tag: x.tag, ...(x.kind ? { kind: x.kind } : {}), refs: x.refs.slice(), reason: x.reason.trim(), ...(x.evidence ? { evidence: x.evidence.trim() } : {}) });
      });
    }
    if (raw.approvals !== undefined) {
      if (!Array.isArray(raw.approvals)) err('approvals', 'must be a list');
      else raw.approvals.forEach((x, i) => {
        const p = `approvals[${i}]`;
        if (!isObj(x)) return err(p, 'must be an object');
        unknownKeys(x, ['changeId', 'question'], p, err);
        if (!str(x.changeId, 40)) return err(`${p}.changeId`, 'required: the id of a changeLog entry');
        if (!str(x.question, 300)) return err(`${p}.question`, 'required text: what you are asking the user to approve');
        out.approvals.push({ changeId: x.changeId, question: x.question.trim() });
      });
    }
    if (!errors.length) {
      const byId = new Map(out.changeLog.map(c => [c.id, c]));
      out.approvals.forEach((a, i) => { const c = byId.get(a.changeId); if (!c) err(`approvals[${i}].changeId`, `no changeLog entry "${a.changeId}"`); else if (c.tag !== 'approval') err(`approvals[${i}].changeId`, `"${a.changeId}" is tagged ${c.tag}, not approval`); });
      out.changeLog.filter(c => c.tag === 'approval' && !out.approvals.some(a => a.changeId === c.id)).forEach(c => err('approvals', `changeLog entry "${c.id}" is tagged approval but has no matching approvals entry`));
    }
    const hasContent = Object.keys(out.lifting).length || Object.keys(out.core).length || out.cardio.length || out.meals || out.deload;
    if (!hasContent && !errors.length) err('(file)', 'nothing to change: add "lifting", "core", "cardio", "meals" or "deload"');
    if (errors.length) return fail();
    out.id = proposalId(out.generatedAt);
    return { ok: true, errors, warnings, proposal: out };
  }

  // The program as it would be if the whole proposal were applied (used for validation).
  function candidate(program, proposal) {
    const p = clone(program);
    for (const [s, list] of Object.entries(proposal.lifting)) p.sessions[s].exercises = clone(list);
    for (const [c, list] of Object.entries(proposal.core)) p.core.circuits[c].exercises = clone(list);
    for (const e of proposal.cardio) p.cardio.sessions[e.session] = cardioDoc(p.cardio.sessions[e.session], e);
    return p;
  }
  // The program's cardio prescription for a session after a cardio entry from the file.
  function cardioDoc(cur, e) {
    const out = e.type === 'hiit' ? { type: 'HIIT' } : { type: 'Zone 2' };
    out.machine = e.machine || cur.machine;
    if (cur.alternatives) out.alternatives = clone(cur.alternatives);
    if (e.type === 'hiit') Object.assign(out, { rounds: e.rounds, workSec: e.workSec, restSec: e.restSec, targetAvgWatts: e.targetAvgWatts });
    else Object.assign(out, { durationMin: e.durationMin, hrLow: e.hrLow, hrHigh: e.hrHigh });
    return out;
  }
  const cardioText = c => (c.type === 'HIIT' || c.type === 'hiit')
    ? `HIIT · ${c.rounds} rounds · ${c.workSec} sec on / ${c.restSec} sec off${c.targetAvgWatts ? ` · ${c.targetAvgWatts} W` : ''}`
    : `Zone 2 · ${c.durationMin} min · ${c.hrLow}–${c.hrHigh} bpm`;

  function parse(text, ctx) {
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, errors: [`Not valid JSON: ${e.message}`], warnings: [], proposal: null }; }
    return validate(raw, ctx);
  }

  // ── Diff ───────────────────────────────────────────────────────
  const fmtRange = r => (r.low === r.high ? `${r.low}` : `${r.low}–${r.high}`);
  const LIFT_FIELDS = [
    ['sets', 'Sets', e => String(e.sets)],
    ['reps', 'Reps', e => fmtRange(e.reps) + (e.perSide ? '/' + e.perSide : '')],
    ['rir', 'RIR', e => fmtRange(e.rir)],
    ['restSec', 'Rest', e => lib().fmtRest(e.restSec)],
    ['progression', 'Progression', e => (e.progression === 'lower' ? 'lower (+10 lb)' : 'upper (+5 lb)')],
    ['targetLb', 'Target load', e => (e.targetLb ? e.targetLb + ' lb' : '(none)')],
    ['methods', 'Method', e => (e.methods && e.methods.length ? e.methods.join(', ') : '(none)')],
    ['muscleGroup', 'Muscle group', e => [].concat(e.muscleGroup).join(' / ')],
    ['pattern', 'Movement pattern', e => e.pattern || '(none)'],
    ['role', 'Role', e => e.role || 'compound'],
    ['perSide', 'Per side', e => e.perSide || '(none)'],
    ['cue', 'Cue', e => e.cue || '(none)'],
  ];
  const CORE_FIELDS = [['sets', 'Sets', e => String(e.sets)], ['target', 'Target', e => e.target]];
  const liftSummary = e => `${e.sets} × ${fmtRange(e.reps)}${e.perSide ? '/' + e.perSide : ''}${e.targetLb ? ' @ ' + e.targetLb + ' lb' : ''}`;
  const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  // current: { program, plan, foods }. Returns the changes; review() attaches the reasons and tags.
  function diff(current, proposal) {
    const changes = [], add = c => changes.push(c), program = current.program;

    if (proposal.deload && !(program.deloadWeeks || []).includes(proposal.deload.weekStart)) {
      add({ ref: 'lifting/deload', group: 'lifting', section: 'Deload', kind: 'add', label: `Pull the deload forward to the week of ${proposal.deload.weekStart}`, from: 'Scheduled deload weeks only', to: 'Extra deload week: lifting sets −40% at the same weights, HIIT rounds −40%, Zone 2 time −40%', evidence: proposal.deload.evidence, force: true });
    }

    const sessions = (group, curOf, lists, fields, summary) => {
      for (const key of Object.keys(lists)) {
        const list = lists[key], cur = curOf(key), curNames = cur.map(e => lower(e.name)), newNames = list.map(e => lower(e.name)), base = `${group}/${key}`;
        cur.filter(e => !newNames.includes(lower(e.name))).forEach(e => add({ ref: `${base}/${e.name}`, group, section: key, kind: 'remove', name: e.name, label: `Remove ${e.name}`, from: summary(e), to: null, force: true }));
        list.forEach(x => {
          const o = cur.find(e => lower(e.name) === lower(x.name));
          if (!o) return add({ ref: `${base}/${x.name}`, group, section: key, kind: 'add', name: x.name, label: `Add ${x.name}`, from: null, to: summary(x), force: true });
          for (const [f, label, fmt] of fields) {
            if (JSON.stringify(o[f] ?? null) === JSON.stringify(x[f] ?? null)) continue;
            add({ ref: `${base}/${o.name}/${f}`, group, section: key, kind: 'change', name: o.name, field: f, label: `${o.name}: ${label}`, from: fmt(o), to: fmt(x) });
          }
        });
        const keep = cur.map(e => e.name).filter(n => newNames.includes(lower(n))), want = list.map(e => e.name).filter(n => curNames.includes(lower(n)));
        if (!sameOrder(keep.map(lower), want.map(lower))) add({ ref: `${base}/order`, group, section: key, kind: 'order', label: 'Exercise order', from: keep.join(', '), to: want.join(', ') });
      }
    };
    sessions('lifting', s => program.sessions[s].exercises, proposal.lifting, LIFT_FIELDS, liftSummary);
    sessions('core', c => program.core.circuits[c].exercises, proposal.core, CORE_FIELDS, e => `${e.sets} × ${e.target}`);

    for (const e of proposal.cardio) {
      const cur = program.cardio.sessions[e.session], base = `cardio/${e.session}`;
      if ((cur.type === 'HIIT') !== (e.type === 'hiit')) {
        add({ ref: `${base}/type`, group: 'cardio', section: `${e.session} · ${e.type === 'hiit' ? 'HIIT' : 'Zone 2'}`, kind: 'change', field: 'type', label: `Switch to ${e.type === 'hiit' ? 'HIIT' : 'Zone 2'}`, from: cardioText(cur), to: cardioText(e), force: true });
        continue;
      }
      const fields = e.type === 'hiit'
        ? [['machine', 'Machine', v => v], ['rounds', 'Rounds', v => String(v)], ['workSec', 'Work interval', v => v + ' sec'], ['restSec', 'Rest interval', v => v + ' sec'], ['targetAvgWatts', 'Target avg watts', v => v + ' W']]
        : [['machine', 'Machine', v => v], ['durationMin', 'Duration', v => v + ' min'], ['hrLow', 'HR floor', v => v + ' bpm'], ['hrHigh', 'HR ceiling', v => v + ' bpm']];
      for (const [f, label, fmt] of fields) {
        if (e[f] === undefined || (cur[f] ?? null) === e[f]) continue;
        add({ ref: `${base}/${f}`, group: 'cardio', section: `${e.session} · ${e.type === 'hiit' ? 'HIIT' : 'Zone 2'}`, kind: 'change', field: f, label, from: cur[f] == null ? '(none)' : fmt(cur[f]), to: fmt(e[f]) });
      }
    }

    const mp = proposal.meals, cm = current.plan || {}, foods = current.foods || {};
    const foodName = id => (foods[id] || {}).name || id;
    if (mp) {
      for (const day of DAYS) for (const [k, v] of Object.entries((mp.targets || {})[day] || {})) {
        const cur = ((cm.targets || {})[day] || {})[k];
        if (cur !== v) add({ ref: `meals/targets/${day}/${k}`, group: 'meals', section: 'Meal plan targets', kind: 'change', field: k, label: `${day === 'rest' ? 'Rest' : 'Training'} day ${MACRO[k][0]}`, from: cur === undefined ? '(not set)' : `${cur} ${MACRO[k][1]}`, to: `${v} ${MACRO[k][1]}`, force: true });
      }
      for (const [key, m] of Object.entries(mp.menus || {})) {
        const cur = (cm.menus || {})[key], section = `Menu ${key}`;
        if (!cur) { add({ ref: `meals/menus/${key}`, group: 'meals', section, kind: 'add', label: `Add menu ${key}: ${m.name}`, from: null, to: `${m.items.length} items`, force: true }); continue; }
        if (cur.name !== m.name) add({ ref: `meals/menus/${key}/name`, group: 'meals', section, kind: 'change', label: 'Menu name', from: cur.name, to: m.name, force: true });
        const idOf = it => `${it.slot}/${it.food}`, curMap = new Map((cur.items || []).map(it => [idOf(it), it])), newIds = new Set(m.items.map(idOf));
        for (const it of cur.items || []) if (!newIds.has(idOf(it))) add({ ref: `meals/menus/${key}/${idOf(it)}`, group: 'meals', section, kind: 'remove', label: `${it.slot}: remove ${foodName(it.food)}`, from: `${it.train} g training · ${it.rest} g rest`, to: null, force: true });
        for (const it of m.items) {
          const c = curMap.get(idOf(it));
          if (!c) { add({ ref: `meals/menus/${key}/${idOf(it)}`, group: 'meals', section, kind: 'add', label: `${it.slot}: add ${foodName(it.food)}`, from: null, to: `${it.train} g training · ${it.rest} g rest`, force: true }); continue; }
          for (const d of ['train', 'rest']) if (c[d] !== it[d]) add({ ref: `meals/menus/${key}/${idOf(it)}/${d}`, group: 'meals', section, kind: 'change', field: d, label: `${it.slot}: ${foodName(it.food)} (${d === 'rest' ? 'rest' : 'training'} day)`, from: `${c[d]} g`, to: `${it[d]} g`, force: true });
        }
      }
    }
    return changes;
  }

  // Attach each change's changeLog entry (the most specific matching path wins), its reason and its tag.
  // Deload pull-forwards, calorie and macro changes, every meal change, and adding or removing an exercise outside a stall swap
  // need approval whatever the file says. A stall swap (kind "stall-swap") follows its tag, so it can be automatic.
  function explain(changes, proposal) {
    const unexplained = [], matched = new Set();
    for (const c of changes) {
      let best = null, bestLen = -1;
      for (const entry of proposal.changeLog) for (const r of entry.refs) {
        if ((c.ref === r || c.ref.startsWith(r + '/')) && r.length > bestLen) { best = entry; bestLen = r.length; }
      }
      if (!best) { unexplained.push(c); continue; }
      matched.add(best.id);
      const swap = best.kind === 'stall-swap' && (c.group === 'lifting' || c.group === 'core') && (c.kind === 'add' || c.kind === 'remove');
      const needs = best.tag === 'approval' || (c.force && !swap) || ['deload-pull-forward', 'calories', 'macros'].includes(best.kind);
      c.id = c.ref; c.logId = best.id; c.logKind = best.kind || ''; c.swap = swap; c.reason = best.reason; c.evidence = c.evidence || best.evidence || '';
      c.tag = needs ? 'approval' : 'auto'; c.forced = needs && best.tag === 'auto';
    }
    return { unexplained, idle: proposal.changeLog.filter(e => !matched.has(e.id)).map(e => e.id) };
  }

  // Stall swaps follow the agent spec: at most one per session per week, one exercise out and one in, and the same muscle group.
  // Sessions (newest first) in which `name` was logged with working sets, from the workouts map.
  function loggedSessions(workouts, name, before) {
    return Object.values(workouts || {}).filter(w => w && w.type === 'lift' && w.date && w.date <= before && Array.isArray(w.exercises))
      .map(w => ({ date: w.date, ex: w.exercises.find(e => e && e.name === name && !e.skipped && (e.sets || []).some(s => Number(s.r) > 0)) })).filter(x => x.ex)
      .sort((a, b) => b.date.localeCompare(a.date)).map(x => ({ date: x.date, sets: x.ex.sets.filter(s => Number(s.r) > 0) }));
  }
  function checkSwaps(changes, program, proposal, workouts) {
    const errors = [], bySection = {};
    changes.filter(c => c.swap).forEach(c => { (bySection[`${c.group}|${c.section}`] ||= []).push(c); });
    for (const [key, list] of Object.entries(bySection)) {
      const [group, section] = key.split('|'), out = list.filter(c => c.kind === 'remove'), inn = list.filter(c => c.kind === 'add');
      const where = group === 'core' ? `core["${section}"]` : `lifting["${section}"]`;
      if (out.length !== 1 || inn.length !== 1) { errors.push(`${where}: a stall swap replaces one exercise with one new exercise, and only one swap is allowed per session per week (this file removes ${out.length} and adds ${inn.length} as swaps)`); continue; }
      out[0].partner = inn[0].id; inn[0].partner = out[0].id;
      if (group !== 'lifting') continue;
      const cur = program.sessions[section].exercises.find(e => e.name === out[0].name);
      if (workouts && cur) {
        const hist = loggedSessions(workouts, cur.name, proposal.generatedAt.slice(0, 10)).slice(0, LIMITS.stallSessions), top = cur.reps.high;
        const hit = hist.find(h => h.sets.every(x => Number(x.r) >= top));
        if (hist.length < LIMITS.stallSessions) errors.push(`${where}: ${cur.name} has ${hist.length} logged session${hist.length === 1 ? '' : 's'}, and a stall swap needs ${LIMITS.stallSessions} in a row without reaching the top of the rep range (${top} reps on every set)`);
        else if (hit) errors.push(`${where}: ${cur.name} reached the top of the rep range (${top} reps on every set) on ${hit.date}, so it has not stalled for ${LIMITS.stallSessions} sessions`);
      }
      const added = (proposal.lifting[section] || []).find(e => e.name === inn[0].name);
      if (cur && cur.pattern) {
        if (!added.pattern) errors.push(`${where}: ${inn[0].name} needs a "pattern" (the movement pattern of the exercise it replaces is "${cur.pattern}")`);
        else if (added.pattern !== cur.pattern) errors.push(`${where}: ${inn[0].name} is a ${added.pattern} but ${out[0].name}, the exercise it replaces, is a ${cur.pattern}. A swap must keep the same movement pattern.`);
      }
      const a = cur && [].concat(cur.muscleGroup)[0], b = added && [].concat(added.muscleGroup)[0];
      if (a && b && lower(a) !== lower(b)) errors.push(`${where}: ${inn[0].name} works ${b} but ${out[0].name}, the exercise it replaces, works ${a}. A swap must keep the same muscle group.`);
    }
    return errors;
  }

  // Validate, diff and explain in one step. This is what the app shows.
  function review(text, ctx) {
    const res = typeof text === 'string' ? parse(text, ctx) : validate(text, ctx);
    if (!res.ok) return { ...res, changes: [] };
    const changes = diff(ctx, res.proposal), { unexplained, idle } = explain(changes, res.proposal);
    const warnings = res.warnings.slice(), swapErrors = checkSwaps(changes, ctx.program || lib().BUILTIN, res.proposal, ctx.workouts);
    if (swapErrors.length) return { ok: false, errors: swapErrors, warnings, proposal: null, changes: [] };
    if (idle.length) warnings.push(`changeLog entries with no matching change: ${idle.join(', ')}`);
    if (unexplained.length) return { ok: false, errors: unexplained.map(c => `changeLog: "${c.label}" (${c.section}) has no reason. Add a changeLog entry whose refs include "${c.ref}".`), warnings, proposal: null, changes: [] };
    return { ok: true, errors: [], warnings, proposal: res.proposal, changes };
  }

  // ── Apply ──────────────────────────────────────────────────────
  function applyLists(group, curByKey, proposal, changes, accepted) {
    const out = {};
    for (const [key, list] of Object.entries(proposal[group])) {
      const mine = changes.filter(c => c.group === group && c.section === key && accepted.has(c.id));
      if (!mine.length) continue;
      let rows = clone(curByKey[key]);
      const removed = new Set(mine.filter(c => c.kind === 'remove').map(c => lower(c.name)));
      rows = rows.filter(r => !removed.has(lower(r.name)));
      for (const c of mine.filter(c => c.kind === 'change')) {
        const r = rows.find(x => x.name === c.name), src = list.find(x => lower(x.name) === lower(c.name));
        if (!r || !src) continue;
        if (src[c.field] === undefined) delete r[c.field]; else r[c.field] = clone(src[c.field]);
      }
      for (const c of mine.filter(c => c.kind === 'add')) {
        const x = list.find(e => e.name === c.name); if (!x) continue;
        let at = 0;
        for (let j = list.indexOf(x) - 1; j >= 0; j--) { const p = rows.findIndex(r => lower(r.name) === lower(list[j].name)); if (p >= 0) { at = p + 1; break; } }
        rows.splice(at, 0, clone(x));
      }
      if (mine.some(c => c.kind === 'order')) {
        const names = list.map(x => lower(x.name));
        const slots = rows.map((r, i) => (names.includes(lower(r.name)) ? i : -1)).filter(i => i >= 0);
        const sorted = rows.filter(r => names.includes(lower(r.name))).sort((a, b) => names.indexOf(lower(a.name)) - names.indexOf(lower(b.name)));
        slots.forEach((pos, k) => { rows[pos] = sorted[k]; });
      }
      out[key] = rows;
    }
    return out;
  }

  // acceptedIds: the change ids the user accepted. Returns the new program (null when no program change was accepted),
  // the new meal plan (null when no meal change was accepted), and a record of what was accepted and rejected.
  function apply(current, proposal, changes, acceptedIds, now) {
    // The two halves of a swap go together: if either was rejected, so is the other.
    const picked = new Set(acceptedIds), accepted = new Set([...picked].filter(id => { const c = changes.find(x => x.id === id); return !(c && c.partner) || picked.has(c.partner); })), has = c => accepted.has(c.id);
    const lift = applyLists('lifting', Object.fromEntries(SESSIONS.map(s => [s, current.program.sessions[s].exercises])), proposal, changes, accepted);
    const core = applyLists('core', Object.fromEntries(CIRCUITS.map(c => [c, current.program.core.circuits[c].exercises])), proposal, changes, accepted);
    const cardio = changes.filter(c => c.group === 'cardio' && has(c));
    const deload = changes.find(c => c.ref === 'lifting/deload' && has(c));
    let program = null;
    if (Object.keys(lift).length || Object.keys(core).length || cardio.length || deload) {
      program = clone(current.program);
      for (const [s, rows] of Object.entries(lift)) program.sessions[s].exercises = rows;
      for (const [c, rows] of Object.entries(core)) program.core.circuits[c].exercises = rows;
      for (const c of cardio) {
        const sess = c.ref.split('/')[1], e = proposal.cardio.find(x => x.session === sess);
        if (c.field === 'type') program.cardio.sessions[sess] = cardioDoc(program.cardio.sessions[sess], e); else program.cardio.sessions[sess][c.field] = e[c.field];
      }
      if (deload) program.deloadWeeks = [...new Set([...(program.deloadWeeks || []), proposal.deload.weekStart])].sort();
      program.version = current.program.version + 1;
      program.source = 'agent';
      const bad = lib().validate(program);
      if (bad.length) return { ok: false, errors: bad };
    }
    let plan = null;
    const meal = changes.filter(c => c.group === 'meals' && has(c));
    if (meal.length) {
      plan = clone(current.plan || {}); plan.targets = plan.targets || {}; plan.menus = plan.menus || {};
      const mp = proposal.meals;
      for (const c of meal) {
        const p = c.ref.split('/');
        if (p[1] === 'targets') { plan.targets[p[2]] = plan.targets[p[2]] || {}; plan.targets[p[2]][p[3]] = mp.targets[p[2]][p[3]]; }
        else if (p[1] === 'menus' && p.length === 3) plan.menus[p[2]] = clone(mp.menus[p[2]]);
        else if (p[1] === 'menus' && p[3] === 'name') plan.menus[p[2]].name = mp.menus[p[2]].name;
        else if (p[1] === 'menus') {
          const menu = plan.menus[p[2]], slot = p[3], food = p[4];
          const find = () => menu.items.findIndex(it => it.slot === slot && it.food === food);
          const src = mp.menus[p[2]].items.find(it => it.slot === slot && it.food === food);
          if (c.kind === 'remove') { const i = find(); if (i >= 0) menu.items.splice(i, 1); }
          else if (c.kind === 'add') {
            let at = menu.items.length; for (let i = menu.items.length - 1; i >= 0; i--) if (menu.items[i].slot === slot) { at = i + 1; break; }
            menu.items.splice(at, 0, clone(src));
          } else { const i = find(); if (i >= 0) menu.items[i][p[5]] = src[p[5]]; }
        }
      }
    }
    const rec = c => ({ id: c.id, group: c.group, section: c.section, kind: c.kind, label: c.label, from: c.from, to: c.to, tag: c.tag, forced: !!c.forced, swap: !!c.swap, reason: c.reason, logId: c.logId });
    const record = {
      id: proposal.id, generatedAt: proposal.generatedAt, weekStart: proposal.weekStart, appliedAt: new Date(now || Date.now()).toISOString(),
      note: proposal.note || '', programVersion: program ? program.version : null,
      accepted: changes.filter(has).map(rec), rejected: changes.filter(c => !has(c)).map(rec),
      // What the program and meal plan were before this plan, so it can be undone. Only the documents that changed are kept.
      before: { ...(program ? { program: clone(current.program) } : {}), ...(plan ? { plan: current.plan ? clone(current.plan) : null } : {}) },
    };
    return { ok: true, program, plan, record };
  }

  // The initial Accept/Reject state: auto changes start accepted, approval changes start unaccepted.
  const defaults = changes => Object.fromEntries(changes.map(c => [c.id, c.tag === 'auto']));
  // True when `generatedAt` is newer than every applied plan.
  const isNewer = (generatedAt, appliedList) => {
    const t = Date.parse(generatedAt); if (Number.isNaN(t)) return false;
    return !(appliedList || []).some(a => Date.parse(a.generatedAt) >= t);
  };

  root.PlanProposal = { SESSIONS, SCHEMA, LIMITS, lastCalorieChange, validate, parse, diff, explain, review, apply, defaults, isNewer, proposalId };
  if (typeof module === 'object' && module.exports) module.exports = root.PlanProposal;
})(typeof window !== 'undefined' ? window : globalThis);
