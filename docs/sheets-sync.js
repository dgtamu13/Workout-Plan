// Publishes workouts, body, meals and check-ins to a visible Google Sheet and reads next-week-plan.json.
// Folder "Training Calendar Data" (in My Drive) holds the sheet "Training Calendar" and the plan file.
// Uses the narrow drive.file scope (files this app created) plus the Sheets scope. It does not touch the hidden
// appDataFolder sync in drive-sync.js, which keeps its own sign-in.
(function (root) {
  'use strict';
  const CLIENT_ID = '358985473662-1qsq1f7ku4c409uhj7a185rlq241ses0.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';
  const FOLDER_NAME = 'Training Calendar Data', SHEET_NAME = 'Training Calendar', PLAN_FILE = 'next-week-plan.json', PLAN_TAB = 'Plan';
  const TABS = ['Workouts', 'Body', 'Meals', 'Fatigue', 'Program', 'Meal Plan', 'Machines'];
  const STORE_KEY = 'derek-tc-sheets-v1', TOKEN_KEY = 'derek-tc-sheets-token', DRIVE_TOKEN_KEY = 'derek-tc-drive-token';
  const DRIVE = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3', SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
  const PLACEHOLDER = {
    schema: 'training-calendar-next-week-plan', version: 1,
    note: 'No proposal yet. The training agent replaces the contents of this same file with a new plan (generatedAt, weekStart, lifting, core, cardio, meals, changeLog, approvals). Format: PLAN_SCHEMA.md in the Workout-Plan repository.',
  };

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const readJSON = k => { try { return JSON.parse(ls.get(k)); } catch { return null; } };

  let ids = readJSON(STORE_KEY) || {};
  let state = ids.linked ? 'ready' : 'off'; // off | ready | connecting | publishing | ok | needs-auth | offline | api-disabled | error
  let lastPublished = ids.lastPublished || null, lastError = null;
  let token = null, tokenExp = 0, tokenClient = null, hint = null;
  let busy = false, again = false, timer = null, getTables = () => ({}), authFailedAt = 0;
  const stateCbs = [];
  const save = () => ls.set(STORE_KEY, JSON.stringify(ids));
  function setState(s, err) { state = s; lastError = err || null; stateCbs.forEach(cb => { try { cb(s); } catch {} }); }

  try { const t = readJSON(TOKEN_KEY); if (t && t.scope === SCOPE && t.exp > Date.now() + 120000) { token = t.t; tokenExp = t.exp; } } catch {}
  try { const d = readJSON(DRIVE_TOKEN_KEY); if (d && d.hint) hint = d.hint; } catch {}

  class ApiError extends Error { constructor(status, message, reason) { super(message); this.status = status; this.reason = reason; } }

  // ── Auth (Google Identity Services) ────────────────────────────
  const gisReady = () => root.google && root.google.accounts && root.google.accounts.oauth2;
  function loadGIS() {
    return new Promise((res, rej) => {
      if (gisReady()) return res();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => res();
      s.onerror = () => rej(Object.assign(new Error('offline'), { offline: true }));
      document.head.appendChild(s);
    });
  }
  async function getToken(interactive) {
    if (token && Date.now() < tokenExp - 60000) return token;
    if (!gisReady()) await loadGIS(); // stay synchronous when already loaded so the popup keeps its user gesture
    return new Promise((res, rej) => {
      const timeout = setTimeout(() => rej(Object.assign(new Error('timeout'), { auth: true })), 25000);
      tokenClient = tokenClient || root.google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
      tokenClient.callback = r => {
        clearTimeout(timeout);
        if (r.error) return rej(Object.assign(new Error(r.error), { auth: true }));
        token = r.access_token; tokenExp = Date.now() + (+r.expires_in || 3600) * 1000;
        ls.set(TOKEN_KEY, JSON.stringify({ t: token, exp: tokenExp, scope: SCOPE }));
        res(token);
      };
      tokenClient.error_callback = e => { clearTimeout(timeout); rej(Object.assign(new Error((e && e.type) || 'popup'), { auth: true })); };
      const opts = { prompt: interactive ? '' : 'none' };
      if (hint) opts.hint = hint;
      tokenClient.requestAccessToken(opts);
    });
  }

  // ── HTTP ───────────────────────────────────────────────────────
  async function api(url, init, interactive, retried) {
    const t = await getToken(interactive);
    let r;
    try { r = await root.fetch(url, { ...init, headers: { ...(init && init.headers), Authorization: 'Bearer ' + t } }); }
    catch (e) { throw Object.assign(new Error('offline'), { offline: true }); }
    if (r.status === 401 && !retried) { token = null; ls.del(TOKEN_KEY); return api(url, init, interactive, true); }
    if (!r.ok) {
      let msg = `HTTP ${r.status}`, reason = '';
      try { const j = await r.json(); msg = (j.error && (j.error.message || j.error.status)) || msg; reason = (j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || (j.error && j.error.status) || ''; } catch {}
      throw new ApiError(r.status, msg, reason);
    }
    return r;
  }
  const json = async (url, init, interactive) => (await api(url, init, interactive)).json();
  const post = (url, body, interactive) => json(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, interactive);
  const q = s => encodeURIComponent(s);

  // ── Folder, sheet and plan file ────────────────────────────────
  async function findOne(query, interactive) {
    const j = await json(`${DRIVE}/files?q=${q(query)}&fields=files(id,name,modifiedTime)&orderBy=createdTime&pageSize=5&spaces=drive`, {}, interactive);
    return (j.files || [])[0] || null;
  }
  async function ensureFolder(interactive) {
    if (ids.folderId) return ids.folderId;
    const f = await findOne(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, interactive)
      || await post(`${DRIVE}/files?fields=id`, { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }, interactive);
    ids.folderId = f.id; save(); return ids.folderId;
  }
  async function ensureSheet(interactive) {
    if (ids.sheetId) return ids.sheetId;
    const folder = await ensureFolder(interactive);
    const f = await findOne(`name='${SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and '${folder}' in parents and trashed=false`, interactive)
      || await post(`${DRIVE}/files?fields=id`, { name: SHEET_NAME, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [folder] }, interactive);
    ids.sheetId = f.id; save(); return ids.sheetId;
  }
  async function ensurePlan(interactive) {
    if (ids.planId) return ids.planId;
    const folder = await ensureFolder(interactive);
    let f = await findOne(`name='${PLAN_FILE}' and '${folder}' in parents and trashed=false`, interactive);
    if (!f) {
      const boundary = 'tcplan' + Date.now();
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: PLAN_FILE, parents: [folder], mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(PLACEHOLDER, null, 2)}\r\n--${boundary}--`;
      f = await json(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body }, interactive);
    }
    ids.planId = f.id; save(); return ids.planId;
  }
  // Make sure the four tabs exist with a frozen header row and enough rows/columns for the data.
  async function ensureTabs(sheetId, tables, interactive) {
    const meta = await json(`${SHEETS}/${sheetId}?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount,frozenRowCount))`, {}, interactive);
    const have = (meta.sheets || []).map(s => s.properties), requests = [];
    const need = tab => ({ rows: Math.max(200, (tables[tab] || []).length + 100), cols: Math.max(26, ((tables[tab] || [])[0] || []).length + 2) });
    const first = have.find(p => p.title === 'Sheet1');
    TABS.forEach((tab, i) => {
      const n = need(tab);
      let p = have.find(x => x.title === tab);
      if (!p && first && !have.some(x => TABS.includes(x.title)) && i === 0) { p = first; requests.push({ updateSheetProperties: { properties: { sheetId: p.sheetId, title: tab }, fields: 'title' } }); }
      if (!p) { requests.push({ addSheet: { properties: { title: tab, gridProperties: { rowCount: n.rows, columnCount: n.cols, frozenRowCount: 1 } } } }); return; }
      const g = p.gridProperties || {};
      if ((g.rowCount || 0) < n.rows || (g.columnCount || 0) < n.cols || g.frozenRowCount !== 1)
        requests.push({ updateSheetProperties: { properties: { sheetId: p.sheetId, gridProperties: { rowCount: Math.max(g.rowCount || 0, n.rows), columnCount: Math.max(g.columnCount || 0, n.cols), frozenRowCount: 1 } }, fields: 'gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount' } });
    });
    // The Plan tab is where the training agent writes its plan (the file cannot be overwritten by Drive connectors). It is never cleared or published over.
    if (!have.some(x => x.title === PLAN_TAB)) requests.push({ addSheet: { properties: { title: PLAN_TAB, gridProperties: { rowCount: 100, columnCount: 2 } } } });
    if (requests.length) await post(`${SHEETS}/${sheetId}:batchUpdate`, { requests }, interactive);
  }
  const a1 = tab => `'${tab}'`; // quoted so tab names with spaces work in A1 notation
  const clean = v => (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) ? '' : (typeof v === 'number' || typeof v === 'boolean') ? v : String(v);

  async function publishOnce(interactive) {
    const tables = getTables();
    const sheetId = await ensureSheet(interactive);
    await ensurePlan(interactive);
    await ensureTabs(sheetId, tables, interactive);
    await post(`${SHEETS}/${sheetId}/values:batchClear`, { ranges: TABS.map(a1) }, interactive);
    await post(`${SHEETS}/${sheetId}/values:batchUpdate`, { valueInputOption: 'RAW', data: TABS.map(tab => ({ range: `${a1(tab)}!A1`, values: (tables[tab] || []).map(r => r.map(clean)) })) }, interactive);
  }
  // A cached id can go stale (file deleted or moved to trash): forget the ids once and look everything up again.
  async function withFreshIds(fn) {
    try { return await fn(); }
    catch (e) { if (e instanceof ApiError && e.status === 404 && (ids.sheetId || ids.planId || ids.folderId)) { ids = { linked: ids.linked, lastPublished: ids.lastPublished }; save(); return fn(); } throw e; }
  }
  function classify(e) {
    if (e.offline || (typeof navigator !== 'undefined' && navigator.onLine === false)) return ['offline', null];
    if (e.auth) return ['needs-auth', null];
    const msg = String(e.message || '');
    if (e.status === 403 && /has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED|API has not been enabled/i.test(msg + ' ' + (e.reason || ''))) {
      const which = /sheets/i.test(msg) ? 'Google Sheets API' : /drive/i.test(msg) ? 'Google Drive API' : 'Google Sheets and Drive APIs';
      return ['api-disabled', `Turn on the ${which} for your Google Cloud project, wait a minute, then try again.`];
    }
    if (e.status === 403 && /insufficient|scope|permission/i.test(msg)) return ['needs-auth', 'Google needs your permission for the Sheet and Drive access. Tap Reconnect.'];
    return ['error', msg];
  }

  async function publish(interactive) {
    if (!ids.linked && !interactive) return false;
    if (!interactive && state === 'needs-auth' && Date.now() - authFailedAt < 15 * 60 * 1000) return false; // reconnect is one tap on the app's banner, not a retry on every submit
    if (busy) { again = true; return false; }
    busy = true; setState('publishing');
    try {
      await withFreshIds(() => publishOnce(interactive));
      ids.linked = true; lastPublished = Date.now(); ids.lastPublished = lastPublished; save();
      setState('ok'); return true;
    } catch (e) { const [s, m] = classify(e); if (s === 'needs-auth') authFailedAt = Date.now(); setState(s, m); return false; }
    finally { busy = false; if (again) { again = false; schedule(); } }
  }
  function schedule() { if (!ids.linked) return; clearTimeout(timer); timer = setTimeout(() => publish(false), 1500); }

  // The proposed plan, from either place the agent may have written it: the Plan tab of the Sheet (column A, one chunk of the JSON text
  // per row) or the next-week-plan.json file. If both hold a plan, the one with the later generatedAt wins. Returns text plus when it last changed.
  const generatedAtOf = text => { try { const t = Date.parse(JSON.parse(text).generatedAt); return Number.isNaN(t) ? null : t; } catch { return null; } };
  async function readPlan(interactive) {
    return withFreshIds(async () => {
      const id = await ensurePlan(interactive);
      const meta = await json(`${DRIVE}/files/${id}?fields=name,modifiedTime`, {}, interactive);
      const file = { text: await (await api(`${DRIVE}/files/${id}?alt=media`, {}, interactive)).text(), modifiedTime: meta.modifiedTime, name: meta.name, id };
      let tab = null;
      try {
        const sheetId = await ensureSheet(interactive);
        const v = await json(`${SHEETS}/${sheetId}/values/${encodeURIComponent(`'${PLAN_TAB}'!A:A`)}?valueRenderOption=UNFORMATTED_VALUE`, {}, interactive);
        const text = (v.values || []).map(r => (r && r[0] != null ? String(r[0]) : '')).join('').trim();
        if (text) { const g = generatedAtOf(text); tab = { text, modifiedTime: g !== null ? new Date(g).toISOString() : (await json(`${DRIVE}/files/${sheetId}?fields=modifiedTime`, {}, interactive)).modifiedTime, name: `${PLAN_TAB} tab`, id: sheetId }; } // the sheet's own modified time changes on every publish, so a plan is dated by its generatedAt
      } catch (e) { if (!(e instanceof ApiError) || e.status !== 400) throw e; } // 400: the Plan tab does not exist yet
      if (!tab) return file;
      const t = generatedAtOf(tab.text), f = generatedAtOf(file.text);
      return t !== null && f !== null && f > t ? file : tab; // a Plan tab that is not valid JSON is shown, so the problem is reported
    });
  }
  async function connect() {
    setState('connecting');
    try { ids.linked = true; save(); await getToken(true); return publish(true); }
    catch (e) { ids.linked = !!ids.sheetId; save(); const [s, m] = classify(e); setState(s === 'offline' && !ids.sheetId ? 'off' : s, m); return false; }
  }
  // quiet: a background look for a new plan must not change the publish state shown to the user if it fails.
  async function check(interactive, quiet) {
    try { return await readPlan(interactive); }
    catch (e) { if (!quiet) { const [s, m] = classify(e); setState(s, m); } throw e; }
  }
  function disconnect() {
    try { if (token && root.google) root.google.accounts.oauth2.revoke(token, () => {}); } catch {}
    token = null; tokenExp = 0; ls.del(TOKEN_KEY); ids = {}; save(); lastPublished = null; setState('off');
  }

  root.SheetsSync = {
    FOLDER_NAME, SHEET_NAME, PLAN_FILE, PLAN_TAB, TABS, SCOPE,
    configure: o => { if (o && o.getTables) getTables = o.getTables; },
    state: () => state, error: () => lastError, linked: () => !!ids.linked, lastPublished: () => lastPublished,
    links: () => ({
      sheet: ids.sheetId ? `https://docs.google.com/spreadsheets/d/${ids.sheetId}/edit` : null,
      folder: ids.folderId ? `https://drive.google.com/drive/folders/${ids.folderId}` : null,
    }),
    onState: cb => { stateCbs.push(cb); },
    connect, publish, schedule, readPlan: check, disconnect,
  };
})(typeof window !== 'undefined' ? window : globalThis);
