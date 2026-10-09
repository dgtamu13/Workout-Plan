// Google Drive sync for the Training Calendar.
// Presents the small slice of the Firestore-style API the app uses (collection/doc/set/delete/onSnapshot),
// backed by a local store that is merged with one JSON file in the app's private Drive folder (appDataFolder).
(function () {
  const CLIENT_ID = '358985473662-1qsq1f7ku4c409uhj7a185rlq241ses0.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE_NAME = 'training-calendar.json';
  const STORE_KEY = 'derek-tc-store-v1';
  const LINK_KEY = 'derek-tc-drive-linked';
  const TOMBSTONE_MS = 90 * 864e5;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const clone = v => JSON.parse(JSON.stringify(v));

  // store.docs: { "collection/id": { u: updatedAtMs, d: doc | null (deleted) } }
  let store = { docs: {} };
  try { const s = JSON.parse(ls.get(STORE_KEY)); if (s && s.docs) store = s; } catch {}
  const saveStore = () => ls.set(STORE_KEY, JSON.stringify(store));

  let state = 'off'; // off | syncing | ok | needs-auth | offline | error
  let token = null, tokenExp = 0, fileId = null, lastSync = null;
  let tokenClient = null, synced = false, busy = false, again = false, pushTimer = null;
  const stateCbs = [], listeners = [];

  const linked = () => ls.get(LINK_KEY) === '1';
  function setState(s) { state = s; stateCbs.forEach(cb => { try { cb(s); } catch {} }); }

  // ── Snapshots ────────────────────────────────────────────────────
  const colSnap = col => {
    const docs = [];
    for (const [k, v] of Object.entries(store.docs)) {
      if (v.d == null || !k.startsWith(col + '/')) continue;
      docs.push({ id: k.slice(col.length + 1), exists: true, data: () => clone(v.d) });
    }
    return { docs, metadata: { fromCache: false } };
  };
  const docSnap = path => {
    const v = store.docs[path];
    return v && v.d != null ? { exists: true, data: () => clone(v.d) } : { exists: false, data: () => undefined };
  };
  function fire() {
    listeners.forEach(l => { try { l.kind === 'col' ? l.cb(colSnap(l.path)) : l.cb(docSnap(l.path)); } catch (e) { console.error(e); } });
  }

  // ── Firestore-style facade ───────────────────────────────────────
  function put(key, d) {
    store.docs[key] = { u: Date.now(), d: d == null ? null : clone(d) };
    saveStore();
    schedulePush();
  }
  const api = {
    collection(col) {
      return {
        doc(id) { return { set: v => { put(`${col}/${id}`, v); return Promise.resolve(); }, delete: () => { put(`${col}/${id}`, null); return Promise.resolve(); } }; },
        onSnapshot(cb) { listeners.push({ kind: 'col', path: col, cb }); if (synced) setTimeout(() => cb(colSnap(col))); return () => {}; },
      };
    },
    doc(path) {
      return {
        set: v => { put(path, v); return Promise.resolve(); },
        delete: () => { put(path, null); return Promise.resolve(); },
        onSnapshot(cb) { listeners.push({ kind: 'doc', path, cb }); if (synced) setTimeout(() => cb(docSnap(path))); return () => {}; },
      };
    },
  };

  // ── Google auth (Identity Services token client) ─────────────────
  function loadGIS() {
    return new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.oauth2) return res();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => res();
      s.onerror = () => rej(Object.assign(new Error('offline'), { offline: true }));
      document.head.appendChild(s);
    });
  }
  async function getToken(interactive) {
    if (token && Date.now() < tokenExp - 60000) return token;
    await loadGIS();
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(Object.assign(new Error('timeout'), { auth: true })), 25000);
      tokenClient = tokenClient || google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
      tokenClient.callback = r => {
        clearTimeout(timer);
        if (r.error) return rej(Object.assign(new Error(r.error), { auth: true }));
        token = r.access_token; tokenExp = Date.now() + (+r.expires_in || 3600) * 1000;
        ls.set(LINK_KEY, '1');
        res(token);
      };
      tokenClient.error_callback = e => { clearTimeout(timer); rej(Object.assign(new Error((e && e.type) || 'popup'), { auth: true })); };
      tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' });
    });
  }

  // ── Drive file ───────────────────────────────────────────────────
  async function drive(url, init, interactive, retried) {
    const t = await getToken(interactive);
    const r = await fetch(url, { ...init, headers: { ...(init && init.headers), Authorization: 'Bearer ' + t } });
    if (r.status === 401 && !retried) { token = null; return drive(url, init, interactive, true); }
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('auth ' + r.status), { auth: true });
    if (!r.ok) throw new Error('drive ' + r.status);
    return r;
  }
  async function readRemote(interactive) {
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const list = await (await drive(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`, {}, interactive)).json();
    if (!list.files || !list.files.length) { fileId = null; return {}; }
    fileId = list.files[0].id;
    const body = await (await drive(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {}, interactive)).json();
    return (body && body.docs) || {};
  }
  async function writeRemote(interactive) {
    const now = Date.now();
    for (const [k, v] of Object.entries(store.docs)) if (v.d == null && now - v.u > TOMBSTONE_MS) delete store.docs[k];
    saveStore();
    const content = JSON.stringify({ v: 1, app: 'training-calendar', docs: store.docs });
    if (fileId) {
      await drive(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content }, interactive);
      return;
    }
    const boundary = 'tc' + now;
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    const created = await (await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body }, interactive)).json();
    fileId = created.id;
  }

  // Newest timestamp wins per document. Returns which side changed.
  function merge(remote) {
    let local = false, rem = false;
    for (const k of new Set([...Object.keys(store.docs), ...Object.keys(remote)])) {
      const l = store.docs[k], r = remote[k];
      if (!r) rem = true;
      else if (!l || r.u > l.u) { store.docs[k] = r; local = true; }
      else if (l.u > r.u) rem = true;
    }
    return { local, rem };
  }

  async function sync(interactive) {
    if (!linked() && !interactive) return;
    if (busy) { again = true; return; }
    busy = true; setState('syncing');
    try {
      const m = merge(await readRemote(interactive));
      if (m.local) saveStore();
      if (m.rem || !fileId) await writeRemote(interactive);
      lastSync = Date.now();
      const first = !synced; synced = true;
      setState('ok');
      if (first || m.local) fire();
    } catch (e) {
      setState(e.auth ? 'needs-auth' : (!navigator.onLine || e.offline) ? 'offline' : 'error');
    } finally {
      busy = false;
      if (again) { again = false; sync(false); }
    }
  }
  function schedulePush() { if (!linked()) return; clearTimeout(pushTimer); pushTimer = setTimeout(() => sync(false), 1500); }

  // ── Backup file ──────────────────────────────────────────────────
  function importJSON(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj.docs !== 'object') throw new Error('Not a Training Calendar backup file.');
    const m = merge(obj.docs);
    saveStore(); fire(); schedulePush();
    return Object.keys(obj.docs).length;
  }

  window.DriveDB = {
    create: () => api,
    state: () => state,
    linked,
    lastSync: () => lastSync,
    onState: cb => { stateCbs.push(cb); },
    connect: () => sync(true),
    syncNow: () => sync(linked()),
    disconnect() {
      try { if (token && window.google) google.accounts.oauth2.revoke(token, () => {}); } catch {}
      token = null; tokenExp = 0; fileId = null; synced = false; ls.del(LINK_KEY); setState('off');
    },
    exportJSON: () => JSON.stringify({ v: 1, app: 'training-calendar', docs: store.docs }),
    importJSON,
  };

  // Keep devices fresh: on open, when the tab becomes visible, when back online, and every 2 minutes while visible.
  if (linked()) { setState('syncing'); setTimeout(() => sync(false), 300); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(false); });
  window.addEventListener('online', () => sync(false));
  setInterval(() => { if (!document.hidden) sync(false); }, 120000);
})();
