#!/usr/bin/env node
// Tests for docs/sheets-sync.js (Google Drive + Sheets publishing and reading next-week-plan.json) against an in-memory fake of the Google APIs. Run with: npm test
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const docs = f => path.join(__dirname, '..', 'docs', f);
let passed = 0, failed = 0;
const checks = [];
const check = (name, fn) => checks.push([name, fn]);
const J = v => JSON.stringify(v);
const clone = v => JSON.parse(JSON.stringify(v));

const plain = v => JSON.parse(JSON.stringify(v)); // VM arrays/objects -> local ones, for deep equality

// ── SheetsSync against a fake Google ───────────────────────────
function backend() {
  const files = [], sheets = {}, log = [];
  let n = 0;
  const b = { files, sheets, log, fail: null, status: {}, tokenCalls: 0, rejectSilent: false, expireToken: 0 };
  const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const err = (status, message, reason) => res(status, { error: { code: status, message, status: reason, errors: [{ reason }] } });
  const id = () => 'id' + (++n);
  b.fetch = async (url, init = {}) => {
    const method = init.method || 'GET'; log.push(`${method} ${url.replace(/\?.*/, '').replace('https://www.googleapis.com', '').replace('https://sheets.googleapis.com', '')}`);
    if (b.fail && b.fail(url, method)) return b.fail(url, method);
    if (/Bearer expired/.test(init.headers.Authorization)) return err(401, 'Invalid Credentials', 'authError');
    const u = new URL(url), p = u.pathname, body = init.body && typeof init.body === 'string' && init.headers['Content-Type'] === 'application/json' ? JSON.parse(init.body) : null;
    if (u.host === 'www.googleapis.com' && p === '/drive/v3/files' && method === 'GET') {
      const query = u.searchParams.get('q'), name = /name='([^']+)'/.exec(query)[1], mime = (/mimeType='([^']+)'/.exec(query) || [])[1], parent = (/'([^']+)' in parents/.exec(query) || [])[1];
      return res(200, { files: files.filter(f => !f.trashed && f.name === name && (!mime || f.mimeType === mime) && (!parent || (f.parents || []).includes(parent))).map(f => ({ id: f.id, name: f.name, modifiedTime: f.modified })) });
    }
    if (u.host === 'www.googleapis.com' && p === '/drive/v3/files' && method === 'POST') {
      const f = { id: id(), name: body.name, mimeType: body.mimeType, parents: body.parents || [], modified: '2026-10-26T20:00:00Z' }; files.push(f);
      if (f.mimeType === 'application/vnd.google-apps.spreadsheet') sheets[f.id] = { tabs: [{ sheetId: 0, title: 'Sheet1', grid: { rowCount: 1000, columnCount: 26, frozenRowCount: 0 } }], values: {} };
      return res(200, { id: f.id });
    }
    if (p === '/upload/drive/v3/files' && method === 'POST') {
      const m = /boundary=(\S+)/.exec(init.headers['Content-Type'])[1], parts = init.body.split(`--${m}`).filter(x => /Content-Type/.test(x));
      const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].trim()), content = parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, '');
      const f = { id: id(), name: meta.name, mimeType: meta.mimeType, parents: meta.parents, content, modified: '2026-10-26T20:00:00Z' }; files.push(f); return res(200, { id: f.id });
    }
    let m = /^\/drive\/v3\/files\/([^/]+)$/.exec(p);
    if (m) { const f = files.find(x => x.id === m[1]); if (!f || f.trashed) return err(404, 'File not found', 'notFound'); return u.searchParams.get('alt') === 'media' ? res(200, f.content) : res(200, { name: f.name, modifiedTime: f.modified }); }
    m = /^\/v4\/spreadsheets\/([^/:]+)$/.exec(p);
    if (m) { const s = sheets[m[1]], f = files.find(x => x.id === m[1]); if (!s || f.trashed) return err(404, 'Requested entity was not found.', 'NOT_FOUND'); return res(200, { sheets: s.tabs.map(t => ({ properties: { sheetId: t.sheetId, title: t.title, gridProperties: { ...t.grid } } })) }); }
    m = /^\/v4\/spreadsheets\/([^/:]+):batchUpdate$/.exec(p);
    if (m) {
      const s = sheets[m[1]];
      for (const r of body.requests) {
        if (r.addSheet) s.tabs.push({ sheetId: s.tabs.length + 10, title: r.addSheet.properties.title, grid: { rowCount: 1000, columnCount: 26, frozenRowCount: 0, ...r.addSheet.properties.gridProperties } });
        if (r.updateSheetProperties) { const t = s.tabs.find(x => x.sheetId === r.updateSheetProperties.properties.sheetId), pr = r.updateSheetProperties.properties; if (pr.title) t.title = pr.title; if (pr.gridProperties) Object.assign(t.grid, pr.gridProperties); }
      }
      return res(200, {});
    }
    m = /^\/v4\/spreadsheets\/([^/:]+)\/values:batchClear$/.exec(p);
    if (m) { for (const rg of body.ranges) delete sheets[m[1]].values[rg.replace(/^'(.*)'$/, '$1')]; return res(200, {}); }
    m = /^\/v4\/spreadsheets\/([^/:]+)\/values:batchUpdate$/.exec(p);
    if (m) {
      const s = sheets[m[1]]; b.lastBody = body;
      for (const d of body.data) {
        const tab = d.range.split('!')[0].replace(/^'(.*)'$/, '$1'), t = s.tabs.find(x => x.title === tab);
        if (!t) return err(400, `Unable to parse range: ${d.range}`, 'badRequest');
        if (d.values.length > t.grid.rowCount || Math.max(...d.values.map(r => r.length)) > t.grid.columnCount) return err(400, `Range (${d.range}) exceeds grid limits.`, 'badRequest');
        s.values[tab] = d.values;
      }
      return res(200, {});
    }
    return err(404, 'unhandled ' + url, 'notFound');
  };
  return b;
}
function makeSync(b, store = {}) {
  const ctx = { console, JSON, Object, Array, Set, Map, Number, String, RegExp, Date, Math, Error, Promise, setTimeout, clearTimeout, URL, encodeURIComponent };
  ctx.fetch = b.fetch;
  ctx.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  ctx.navigator = { onLine: true };
  ctx.google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken(o) { b.tokenCalls++; if (o.prompt === 'none' && b.rejectSilent) return this.error_callback({ type: 'popup_failed_to_open' }); this.callback({ access_token: b.expireToken-- > 0 ? 'expired' : 'tok' + b.tokenCalls, expires_in: 3600 }); } }), revoke() {} } } };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(docs('sheets-sync.js'), 'utf8'), ctx);
  return { S: ctx.SheetsSync, store, ctx };
}
const TABLES = { Workouts: [['Date', 'Session', 'Reps'], ['2026-10-20', 'PUSH A', 12], ['2026-10-20', '=HYPERLINK("x")', null]], Body: [['Date', 'Weight (lb)'], ['2026-10-20', 171.5]], Meals: [['Date', 'Food']], Fatigue: [['Date', 'Sleep (1-5)'], ['2026-10-20', 4]], Program: [['Area', 'Name'], ['Meta', 'version']], 'Meal Plan': [['Area', 'Item'], ['Meta', 'last calorie change']] };
const settle = () => new Promise(r => setTimeout(r, 30));

check('First connect creates the folder, the Sheet inside it, the plan file and six tabs with the data', async () => {
  const b = backend(), { S } = makeSync(b); S.configure({ getTables: () => TABLES });
  assert.strictEqual(S.state(), 'off'); assert.strictEqual(await S.connect(), true); assert.strictEqual(S.state(), 'ok'); assert.ok(S.lastPublished());
  const folder = b.files.find(f => f.mimeType === 'application/vnd.google-apps.folder'), sheet = b.files.find(f => f.mimeType === 'application/vnd.google-apps.spreadsheet'), plan = b.files.find(f => f.name === 'next-week-plan.json');
  assert.strictEqual(folder.name, 'Training Calendar Data'); assert.deepStrictEqual(folder.parents, []); assert.strictEqual(sheet.name, 'Training Calendar'); assert.deepStrictEqual(sheet.parents, [folder.id]); assert.deepStrictEqual(plan.parents, [folder.id]);
  const t = b.sheets[sheet.id].tabs; assert.deepStrictEqual(t.map(x => x.title), ['Workouts', 'Body', 'Meals', 'Fatigue', 'Program', 'Meal Plan']); assert.ok(t.every(x => x.grid.frozenRowCount === 1), 'header row frozen');
  const v = b.sheets[sheet.id].values; assert.deepStrictEqual(v.Workouts, [['Date', 'Session', 'Reps'], ['2026-10-20', 'PUSH A', 12], ['2026-10-20', '=HYPERLINK("x")', '']]); assert.deepStrictEqual(v.Body[1], ['2026-10-20', 171.5]);
  assert.strictEqual(b.lastBody.valueInputOption, 'RAW', 'text such as =HYPERLINK stays text'); assert.ok(typeof v.Body[1][1] === 'number'); assert.deepStrictEqual(v['Meal Plan'], [['Area', 'Item'], ['Meta', 'last calorie change']]); assert.deepStrictEqual(v.Program[1], ['Meta', 'version']);
  assert.ok(/"schema": "training-calendar-next-week-plan"/.test(plan.content)); assert.deepStrictEqual(plain(S.links()), { sheet: `https://docs.google.com/spreadsheets/d/${sheet.id}/edit`, folder: `https://drive.google.com/drive/folders/${folder.id}` });
});
check('Publishing again reuses everything and replaces the data (no duplicates)', async () => {
  const b = backend(), { S } = makeSync(b); let tables = clone(TABLES); S.configure({ getTables: () => tables }); await S.connect();
  const created = b.log.filter(l => /^POST \/drive\/v3\/files|^POST \/upload/.test(l)).length; tables = clone(TABLES); tables.Body.push(['2026-10-21', 172]);
  await S.publish(false); assert.strictEqual(b.log.filter(l => /^POST \/drive\/v3\/files|^POST \/upload/.test(l)).length, created, 'nothing new created');
  assert.strictEqual(b.files.length, 3); assert.deepStrictEqual(Object.values(b.sheets)[0].values.Body.length, 3);
  assert.ok(b.log.indexOf(b.log.filter(l => /batchClear/.test(l)).pop()) < b.log.lastIndexOf(b.log.filter(l => /values:batchUpdate/.test(l)).pop()), 'cleared before writing');
});
check('A second device finds the existing folder and Sheet instead of making new ones', async () => {
  const b = backend(), a = makeSync(b); a.S.configure({ getTables: () => TABLES }); await a.S.connect();
  const second = makeSync(b); second.S.configure({ getTables: () => TABLES }); await second.S.connect();
  assert.strictEqual(b.files.length, 3); assert.strictEqual(second.S.links().sheet, a.S.links().sheet);
});
check('Large tables grow the grid before writing', async () => {
  const b = backend(), { S } = makeSync(b), big = clone(TABLES); for (let i = 0; i < 2500; i++) big.Workouts.push(['2026-10-20', 'PUSH A', i]); S.configure({ getTables: () => big });
  assert.strictEqual(await S.connect(), true); const sheet = Object.values(b.sheets)[0]; assert.ok(sheet.tabs.find(t => t.title === 'Workouts').grid.rowCount >= 2503); assert.strictEqual(sheet.values.Workouts.length, 2503);
});
check('A deleted Sheet is recreated on the next publish', async () => {
  const b = backend(), { S } = makeSync(b); S.configure({ getTables: () => TABLES }); await S.connect();
  b.files.find(f => f.mimeType === 'application/vnd.google-apps.spreadsheet').trashed = true; assert.strictEqual(await S.publish(false), true);
  assert.strictEqual(b.files.filter(f => f.mimeType === 'application/vnd.google-apps.spreadsheet' && !f.trashed).length, 1);
});
check('Reading the plan file returns the placeholder, then whatever is written into that same file', async () => {
  const b = backend(), { S } = makeSync(b); S.configure({ getTables: () => TABLES }); await S.connect();
  const first = await S.readPlan(false); assert.strictEqual(first.name, 'next-week-plan.json'); const ph = JSON.parse(first.text); assert.strictEqual(ph.schema, 'training-calendar-next-week-plan'); assert.ok(!ph.generatedAt, 'the placeholder has no generatedAt, so it never shows as a new proposal');
  const file = b.files.find(f => f.name === 'next-week-plan.json'); file.content = J({ schema: 'training-calendar-next-week-plan', version: 1, generatedAt: '2026-11-02T20:00:00Z' }); file.modified = '2026-10-26T21:00:00Z';
  const next = await S.readPlan(false); assert.strictEqual(next.modifiedTime, '2026-10-26T21:00:00Z'); assert.strictEqual(JSON.parse(next.text).generatedAt, '2026-11-02T20:00:00Z');
});
check('Without a connection nothing is published; schedule() publishes after a short delay once connected', async () => {
  const b = backend(), { S } = makeSync(b); S.configure({ getTables: () => TABLES });
  assert.strictEqual(await S.publish(false), false); S.schedule(); assert.strictEqual(b.log.length, 0);
  await S.connect(); const n = b.log.length; S.schedule(); S.schedule(); assert.strictEqual(b.log.length, n, 'debounced');
  await new Promise(r => setTimeout(r, 1700)); assert.ok(b.log.length > n); assert.strictEqual(b.log.filter(l => /values:batchUpdate/.test(l)).length, 2, 'two schedule() calls became one publish');
});
check('An expired token is refreshed once and the request retried', async () => {
  const b = backend(); b.expireToken = 1; const { S } = makeSync(b); S.configure({ getTables: () => TABLES });
  assert.strictEqual(await S.connect(), true); assert.strictEqual(S.state(), 'ok');
});
check('Failures set a clear state: needs sign-in, API turned off, offline, other errors', async () => {
  let b = backend(), { S } = makeSync(b); S.configure({ getTables: () => TABLES }); await S.connect(); b.rejectSilent = true; delete S;
  const s2 = makeSync(b, { 'derek-tc-sheets-v1': J({ linked: true, sheetId: Object.keys(b.sheets)[0], folderId: b.files[0].id, planId: b.files[2].id }) }); s2.S.configure({ getTables: () => TABLES });
  assert.strictEqual(s2.S.state(), 'ready'); assert.strictEqual(await s2.S.publish(false), false); assert.strictEqual(s2.S.state(), 'needs-auth');
  b = backend(); b.fail = (url) => /spreadsheets\//.test(url) ? { ok: false, status: 403, json: async () => ({ error: { code: 403, message: 'Google Sheets API has not been used in project 1 before or it is disabled.', status: 'PERMISSION_DENIED', errors: [{ reason: 'accessNotConfigured' }] } }) } : null;
  const s3 = makeSync(b); s3.S.configure({ getTables: () => TABLES }); assert.strictEqual(await s3.S.connect(), false); assert.strictEqual(s3.S.state(), 'api-disabled'); assert.ok(/Google Sheets API/.test(s3.S.error()));
  b = backend(); b.fail = () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'Backend Error' } }) }); const s4 = makeSync(b); s4.S.configure({ getTables: () => TABLES }); await s4.S.connect(); assert.strictEqual(s4.S.state(), 'error'); assert.ok(/Backend Error/.test(s4.S.error()));
  b = backend(); const s5 = makeSync(b); s5.ctx.fetch = async () => { throw new TypeError('Failed to fetch'); }; s5.S.configure({ getTables: () => TABLES }); await s5.S.connect(); assert.ok(['offline', 'off'].includes(s5.S.state()));
});
check('Disconnect forgets the links and the sign-in', async () => {
  const b = backend(), { S, store } = makeSync(b); S.configure({ getTables: () => TABLES }); await S.connect(); S.disconnect();
  assert.strictEqual(S.state(), 'off'); assert.strictEqual(S.linked(), false); assert.deepStrictEqual(plain(S.links()), { sheet: null, folder: null }); assert.ok(!('derek-tc-sheets-token' in store));
});
check('Only the narrow scopes are requested (files this app created plus the Sheets API)', () => {
  const { S } = makeSync(backend()); assert.strictEqual(S.SCOPE, 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets');
});
(async () => {
  for (const [name, fn] of checks) {
    try { await fn(); passed++; console.log('  ok   ' + name); }
    catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 6).join('\n       ')); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
