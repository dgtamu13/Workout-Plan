// Machines: the registry of gym machines, their display units (lb, kg or plate numbers on the stack), and the factor that turns
// a weight read off one machine into the same effort on the exercise's reference machine. Two cable stacks can show the same
// number and feel very different (pulley ratios, cam shapes, kg stacks), so loads are only compared after this conversion.
//
// Registry (the `config/machines` document):
//   { machines: { <id>: { name, unit:'lb'|'kg'|'plate', plateLb:number|null, step:number|null } },
//     byExercise: { <exercise name>: { legacy:<id>|null, ref:<id>|null, manual:{ <id>: factor } } } }
// Machine '' means "not set" (all history logged before machines existed). byExercise.legacy says which machine that was.
// A factor k turns toLb(machine, w) into reference lb. The reference machine has k = 1; a manual factor wins; otherwise k is
// calibrated from switches: when consecutive normal sessions of an exercise are on different machines, the two sessions are
// taken to be the same effort, so k_b = k_a × e1RM_a / e1RM_b. The median of the last five switches is used, so a single
// permanent switch gives one fixed factor and progress on the new machine is not normalized away.
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib; else root.MachineLib = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  const KG = 2.20462;
  const UNITS = { lb: 'lb', kg: 'kg', plate: 'plate' };
  const empty = () => ({ machines: {}, byExercise: {} });

  function normalize(reg) {
    const r = reg && typeof reg === 'object' ? reg : {};
    const machines = {}, byExercise = {};
    for (const [id, m] of Object.entries(r.machines || {})) {
      if (!id || !m || typeof m.name !== 'string' || !m.name.trim()) continue;
      machines[id] = { name: m.name.trim().slice(0, 60), unit: UNITS[m.unit] ? m.unit : 'lb',
        plateLb: +m.plateLb > 0 ? +m.plateLb : null, step: +m.step > 0 ? +m.step : null };
    }
    for (const [ex, b] of Object.entries(r.byExercise || {})) {
      if (!b || typeof b !== 'object') continue;
      const manual = {};
      for (const [id, k] of Object.entries(b.manual || {})) if ((id === '' || machines[id]) && +k > 0) manual[id] = +k;
      byExercise[ex] = { legacy: machines[b.legacy] ? b.legacy : null, ref: (b.ref === '' || machines[b.ref]) ? b.ref : null, manual };
    }
    return { machines, byExercise };
  }

  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'machine';
  function newId(reg, name) { const base = slug(name); let id = base, n = 2; while (reg.machines[id]) id = `${base}-${n++}`; return id; }

  // Machine object for an id; '' and unknown ids are plain pounds.
  const get = (reg, id) => (id && reg.machines[id]) || null;
  const unitLb = m => !m ? 1 : m.unit === 'kg' ? KG : m.unit === 'plate' ? (m.plateLb || 1) : 1;
  const toLb = (m, w) => w * unitLb(m);
  const label = m => !m || m.unit === 'lb' ? 'lb' : m.unit === 'kg' ? 'kg' : 'pl';
  const step = m => (m && m.step) || (!m || m.unit === 'lb' ? 2.5 : m.unit === 'kg' ? 2.5 : 1);
  const rounder = m => { const s = step(m); return w => Math.round(Math.round(w / s) * s * 100) / 100; };
  // Which machine a logged exercise was on: its own machine, else the exercise's legacy machine, else ''.
  const resolve = (reg, ex, id) => id || (reg.byExercise[ex] && reg.byExercise[ex].legacy) || '';
  const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

  // sessions: [{ date, machine:<resolved id>, e1:<top e1RM in toLb pounds> }] for one exercise, normal sessions only, any order.
  // Returns { ref, k: { <id>: { k, src:'ref'|'manual'|'auto', n } } }; machines with no factor are absent.
  function calibrate(reg, ex, sessions) {
    const b = reg.byExercise[ex] || {}, manual = b.manual || {};
    const ss = sessions.filter(s => s.e1 > 0).sort((a, z) => a.date < z.date ? -1 : a.date > z.date ? 1 : 0);
    const used = [...new Set(ss.map(s => s.machine))];
    let ref = b.ref != null ? b.ref : null;
    if (ref == null) ref = used.includes('') ? '' : used.find(id => { const m = get(reg, id); return !m || m.unit !== 'plate' || m.plateLb; }) ?? used[0] ?? null;
    const k = {};
    if (ref != null) k[ref] = { k: 1, src: 'ref', n: 0 };
    for (const [id, v] of Object.entries(manual)) if (id !== ref) k[id] = { k: v, src: 'manual', n: 0 };
    const switches = [];
    for (let i = 1; i < ss.length; i++) if (ss[i].machine !== ss[i - 1].machine) switches.push([ss[i - 1], ss[i]]);
    for (let pass = 0; pass < used.length; pass++) {
      const est = {};
      for (const [a, z] of switches) for (const [x, y] of [[a, z], [z, a]]) {
        if (!k[x.machine] || k[y.machine]) continue;
        (est[y.machine] = est[y.machine] || []).push(k[x.machine].k * x.e1 / y.e1);
      }
      const ids = Object.keys(est); if (!ids.length) break;
      for (const id of ids) { const e = est[id].slice(-5); k[id] = { k: Math.round(median(e) * 1000) / 1000, src: 'auto', n: est[id].length }; }
    }
    return { ref, k };
  }

  // Reference-lb per displayed unit on machine id (k × unit size), or null when the machine is not calibrated yet.
  function scale(reg, cal, id) { const f = cal.k[id]; return f ? f.k * unitLb(get(reg, id)) : null; }

  return { KG, UNITS, empty, normalize, newId, get, unitLb, toLb, label, step, rounder, resolve, calibrate, scale };
});
