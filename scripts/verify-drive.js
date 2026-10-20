#!/usr/bin/env node
// Tests for docs/drive-sync.js (the DriveDB store behind every collection and document): local store, merge rules,
// backup import/export, listeners, token reuse and sign-in states, against an in-memory fake of Drive's appDataFolder.
// Run with: npm test
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'docs', 'drive-sync.js'), 'utf8');
const J = JSON.stringify;
const wait = (ms = 20) => new Promise(r => setTimeout(r, ms));

// One shared fake Drive (the appDataFolder file) that several "devices" can sync with.
function drive() {
  const d = { file: null, calls: [], tokens: new Set(['tok-1', 'tok-2']), rejectAll: false, requests: 0 };
  d.fetch = async (url, init = {}) => {
    const u = new URL(url), p = u.pathname, auth = (init.headers && init.headers.Authorization) || '';
    d.requests++; d.calls.push(`${init.method || 'GET'} ${p}`);
    const res = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (d.rejectAll || !d.tokens.has(auth.replace('Bearer ', ''))) return res(401, {});
    if (p === '/drive/v3/about') return res(200, { user: { emailAddress: 'derek@example.com' } });
    if (p === '/drive/v3/files') return res(200, { files: d.file ? [{ id: 'f1' }] : [] });
    if (p === '/drive/v3/files/f1') return res(200, JSON.parse(d.file));
    if (p === '/upload/drive/v3/files/f1') { d.file = init.body; return res(200, {}); }
    if (p === '/upload/drive/v3/files') { d.file = init.body.split('\r\n\r\n')[2].split('\r\n--')[0]; return res(200, { id: 'f1' }); }
    return res(404, {});
  };
  return d;
}
// A device: its own localStorage and its own copy of drive-sync.js.
function device(d, storage = {}, { gis = true } = {}) {
  const handlers = {}, ctx = { console, JSON, Object, Array, Set, Map, Number, String, RegExp, Date, Math, Error, Promise, URL, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.self = ctx;
  ctx.localStorage = { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem: k => { delete storage[k]; } };
  ctx.document = { hidden: false, head: { appendChild() {} }, createElement: () => ({}), addEventListener: (t, f) => { handlers[t] = f; } };
  ctx.navigator = { onLine: true }; ctx.addEventListener = () => {}; ctx.setInterval = () => 0;
  ctx.fetch = d.fetch; ctx.tokenRequests = 0;
  if (gis) ctx.google = { accounts: { oauth2: {
    initTokenClient: () => ({ callback() {}, error_callback() {}, requestAccessToken(opts) { ctx.tokenRequests++; ctx.lastOpts = opts; setTimeout(() => (ctx.denyNext ? this.error_callback({ type: 'popup_closed' }) : this.callback({ access_token: ctx.nextToken || 'tok-1', expires_in: 3600 }))); } }),
    revoke() {},
  } } };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { ctx, db: ctx.DriveDB, storage, api: ctx.DriveDB.create(), handlers };
}
const store = dev => JSON.parse(dev.db.exportJSON()).docs;

let passed = 0, failed = 0;
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('Documents and collections: set, delete, and snapshots only show live records', async () => {
  const dv = device(drive()); const col = dv.api.collection('workouts');
  await col.doc('a').set({ n: 1 }); await col.doc('b').set({ n: 2 }); await col.doc('b').delete(); await dv.api.doc('config/plan').set({ x: 1 });
  const d = store(dv); assert.strictEqual(d['workouts/a'].d.n, 1); assert.strictEqual(d['workouts/b'].d, null, 'deleted records stay as tombstones so the delete syncs'); assert.ok(d['workouts/a'].u > 0);
  assert.strictEqual(JSON.parse(dv.storage['derek-tc-store-v1']).docs['config/plan'].d.x, 1, 'saved on the device');
});
check('Listeners wait for the first real sync or an import; they get clones, not live references', async () => {
  const dv = device(drive()); let fired = 0, snap = null;
  dv.api.collection('foods').onSnapshot(s => { fired++; snap = s; });
  await dv.api.collection('foods').doc('x').set({ name: 'Rice' }); await wait(); assert.strictEqual(fired, 0, 'nothing before a sync');
  dv.db.importJSON(J({ docs: { 'foods/y': { u: 5, d: { name: 'Oats' } } } })); assert.strictEqual(fired, 1);
  assert.strictEqual(J(snap.docs.map(x => x.id).sort()), J(['x', 'y'])); const got = snap.docs[0].data(); got.name = 'changed'; assert.notStrictEqual(snap.docs[0].data().name, 'changed');
  let docSnap; dv.api.doc('config/plan').onSnapshot(s => { docSnap = s; }); dv.db.importJSON(J({ docs: { 'config/plan': { u: 5, d: { targets: {} } } } })); assert.strictEqual(docSnap.exists, true);
  dv.db.importJSON(J({ docs: { 'config/plan': { u: 9, d: null } } })); assert.strictEqual(docSnap.exists, false, 'a newer delete wins');
});
check('Merge: the newest edit wins per record, in both directions, and unknown records are kept', async () => {
  const dv = device(drive()); await dv.api.doc('a/1').set({ v: 'local' }); const u = store(dv)['a/1'].u;
  dv.db.importJSON(J({ docs: { 'a/1': { u: u - 1000, d: { v: 'older' } }, 'a/2': { u: 1, d: { v: 'new record' } } } }));
  assert.strictEqual(store(dv)['a/1'].d.v, 'local'); assert.strictEqual(store(dv)['a/2'].d.v, 'new record');
  dv.db.importJSON(J({ docs: { 'a/1': { u: u + 1000, d: { v: 'newer' } } } })); assert.strictEqual(store(dv)['a/1'].d.v, 'newer');
});
check('Import rejects things that are not a backup and reports the number of records', () => {
  const dv = device(drive());
  assert.throws(() => dv.db.importJSON('not json')); assert.throws(() => dv.db.importJSON('{"a":1}'), /Not a Training Calendar backup/);
  assert.strictEqual(dv.db.importJSON(J({ docs: { 'a/1': { u: 1, d: {} }, 'a/2': { u: 1, d: {} } } })), 2);
  const exp = JSON.parse(dv.db.exportJSON()); assert.deepStrictEqual([exp.v, exp.app], [1, 'training-calendar']);
});
check('Connect: signs in, creates the Drive file, then a second device merges both ways', async () => {
  const d = drive(), a = device(d), b = device(d);
  await a.api.doc('workouts/a').set({ who: 'A' }); await a.db.connect(); await wait();
  assert.strictEqual(a.db.state(), 'ok'); assert.strictEqual(a.db.linked(), true); assert.ok(a.db.lastSync());
  assert.strictEqual(JSON.parse(d.file).docs['workouts/a'].d.who, 'A'); assert.strictEqual(J(a.ctx.lastOpts), J({ prompt: '' }), 'interactive connect');
  await b.api.doc('workouts/b').set({ who: 'B' }); await b.db.connect(); await wait();
  assert.strictEqual(J(Object.keys(store(b)).sort()), J(['workouts/a', 'workouts/b'])); assert.strictEqual(J(Object.keys(JSON.parse(d.file).docs).sort()), J(['workouts/a', 'workouts/b']), 'the file has both');
  await a.db.syncNow(); await wait(); assert.ok(store(a)['workouts/b'], 'device A picks B up on its next sync');
});
check('A listener fires after the first sync so the app can seed missing documents', async () => {
  const d = drive(), a = device(d); let seen = null; a.api.doc('config/program').onSnapshot(s => { seen = s.exists; });
  await a.db.connect(); await wait(); assert.strictEqual(seen, false, 'empty store: the snapshot reports that the doc does not exist');
});
check('A later edit is pushed after a short delay without a popup (silent token)', async () => {
  const d = drive(), a = device(d); await a.db.connect(); await wait(); const n = a.ctx.tokenRequests;
  await a.api.doc('body/2026-10-20').set({ weight: 170 }); await wait(1700);
  assert.strictEqual(JSON.parse(d.file).docs['body/2026-10-20'].d.weight, 170); assert.strictEqual(a.ctx.tokenRequests, n, 'the saved token was reused');
});
check('Sign-in survives a reload: linked flag and a still-valid token are reused, so no sign-in prompt', async () => {
  const d = drive(), a = device(d); await a.db.connect(); await wait();
  const b = device(d, a.storage); await wait(50);
  assert.strictEqual(b.db.linked(), true); assert.strictEqual(b.ctx.tokenRequests, 0, 'no token request on reload'); assert.strictEqual(b.db.state(), 'ok');
  assert.strictEqual(JSON.parse(a.storage['derek-tc-drive-token']).hint, 'derek@example.com', 'remembers the account for later silent sign-ins');
});
check('An expired token is refreshed once and the request retried', async () => {
  const d = drive(), a = device(d); await a.db.connect(); await wait();
  d.tokens.delete('tok-1'); a.ctx.nextToken = 'tok-2'; await a.api.doc('a/1').set({ x: 1 }); await a.db.syncNow(); await wait(60);
  assert.strictEqual(a.db.state(), 'ok'); assert.strictEqual(JSON.parse(d.file).docs['a/1'].d.x, 1); assert.ok(a.ctx.tokenRequests >= 2);
});
check('Failures: sign-in refused or silent sign-in blocked -> needs-auth; offline; the data stays on the device', async () => {
  const d = drive(), a = device(d); a.ctx.denyNext = true; await a.db.connect(); await wait();
  assert.strictEqual(a.db.state(), 'needs-auth'); await a.api.doc('a/1').set({ x: 1 }); assert.ok(store(a)['a/1'], 'still saved locally');
  const o = device(d); o.ctx.navigator.onLine = false; o.ctx.fetch = async () => { throw new TypeError('Failed to fetch'); }; o.ctx.nextToken = 'tok-1';
  await o.db.connect(); await wait(); assert.ok(['offline', 'error'].includes(o.db.state()), o.db.state());
});
check('A tap retries a blocked silent sign-in (the user gesture lets the popup open)', async () => {
  const d = drive(), a = device(d); await a.db.connect(); await wait();
  const b = device(d, a.storage); await wait(30); b.ctx.denyNext = true; b.storage['derek-tc-drive-token'] = J({ t: 'old', exp: 0, hint: 'derek@example.com' });
  const c = device(d, b.storage); c.ctx.denyNext = true; await wait(60); assert.strictEqual(c.db.state(), 'needs-auth');
  c.ctx.denyNext = false; c.handlers.pointerdown && c.handlers.pointerdown(); await wait(60);
  assert.strictEqual(c.db.state(), 'ok', 'recovered after the retry'); assert.deepStrictEqual(c.ctx.lastOpts && c.ctx.lastOpts.prompt, '', 'the retry is interactive');
});
check('Disconnect forgets the link and token but keeps the data on the device', async () => {
  const d = drive(), a = device(d); await a.api.doc('a/1').set({ x: 1 }); await a.db.connect(); await wait(); a.db.disconnect();
  assert.strictEqual(a.db.state(), 'off'); assert.strictEqual(a.db.linked(), false); assert.ok(!('derek-tc-drive-token' in a.storage) && !('derek-tc-drive-linked' in a.storage)); assert.ok(store(a)['a/1']);
});
check('Old tombstones are dropped when the file is written; recent ones are kept so deletes still sync', async () => {
  const d = drive(), a = device(d), now = Date.now();
  a.db.importJSON(J({ docs: { 'a/old': { u: now - 100 * 864e5, d: null }, 'a/recent': { u: now - 1 * 864e5, d: null }, 'a/live': { u: now, d: { k: 1 } } } }));
  await a.db.connect(); await wait();
  assert.strictEqual(J(Object.keys(JSON.parse(d.file).docs).sort()), J(['a/live', 'a/recent']));
});

(async () => {
  for (const [name, fn] of checks) {
    try { await fn(); passed++; console.log('  ok   ' + name); }
    catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 6).join('\n       ')); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
