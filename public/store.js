/* Everything backend-specific lives in this file: sign-in, saving, and reminders.
   The rest of the app only calls the functions exported here. The backend is the
   Vercel functions in /api (see api/_lib.js). Guest mode never calls them. */

var POLL_MS = 60000;
var GUEST_FLAG = 'day-ledger-guest';
var GUEST_PREFIX = 'day-ledger-guest:';
var GUEST_PREFS = 'day-ledger-guest-prefs';
var REMIND_FLAG = 'day-ledger-remind';
var GUEST_USER = { uid: 'guest', email: '', guest: true };
var userCb = null;

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
function inGuest() { return lsGet(GUEST_FLAG) === '1'; }

export function configured() { return true; }
export function isGuest() { return inGuest(); }

// Calls the API. Rejects with an Error whose .code is the server's error code,
// or 'network' when the server cannot be reached.
async function api(path, method, body) {
  var r;
  try {
    r = await fetch(path, {
      method: method || 'GET',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (e) { var n = new Error('network'); n.code = 'network'; throw n; }
  var j = null;
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) {
    var err = new Error((j && j.error) || 'server-error');
    err.code = r.status === 403 ? 'permission-denied' : ((j && j.error) || 'server-error');
    throw err;
  }
  return j;
}

/* ---- sign-in ---- */
export function startGuest() {
  try { localStorage.setItem(GUEST_FLAG, '1'); } catch (e) { throw new Error('guest-unavailable'); }
  if (userCb) userCb(GUEST_USER);
}
export function onUser(cb) {
  userCb = cb;
  if (inGuest()) { cb(GUEST_USER); return function () {}; }
  api('/api/me').then(function (j) { cb(j.user); }, function () { cb(null); });
  return function () {};
}
export async function signIn(email, pw) {
  var j = await api('/api/login', 'POST', { email: email, password: pw });
  lsDel(GUEST_FLAG);
  if (userCb) userCb(j.user);
}
export async function signUp(email, pw) {
  var j = await api('/api/signup', 'POST', { email: email, password: pw });
  lsDel(GUEST_FLAG);
  if (userCb) userCb(j.user);
}
export async function logOut() {
  if (inGuest()) lsDel(GUEST_FLAG);
  else { try { await api('/api/logout', 'POST', {}); } catch (e) {} }
  if (userCb) userCb(null);
}

/* ---- entries: tasks | log-YYYY-MM ----
   Guests keep them in localStorage. Signed-in users keep them on the server and the page
   re-reads them every minute and when the tab regains focus, so devices stay in step. */
export function listen(cb, onError) {
  if (inGuest()) {
    setTimeout(function () {
      var docs = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k.indexOf(GUEST_PREFIX) === 0) docs.push({ id: k.slice(GUEST_PREFIX.length), data: JSON.parse(localStorage.getItem(k)) });
        }
      } catch (e) {}
      cb(docs);
    }, 0);
    return function () {};
  }
  var stopped = false, last = '';
  function pull() {
    api('/api/data').then(function (j) {
      if (stopped) return;
      var sig = JSON.stringify(j.docs);
      if (sig !== last) { last = sig; cb(j.docs); }
    }, function (e) {
      if (stopped) return;
      if (e.code === 'not-signed-in' && userCb) userCb(null); // session expired
      else onError(e);
    });
  }
  function onVisible() { if (document.visibilityState === 'visible') pull(); }
  document.addEventListener('visibilitychange', onVisible);
  var timer = setInterval(pull, POLL_MS);
  pull();
  return function () { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
}
export async function saveDoc(id, data) {
  if (inGuest()) {
    try { localStorage.setItem(GUEST_PREFIX + id, JSON.stringify(data)); return { synced: true }; }
    catch (e) { throw e; }
  }
  await api('/api/data?id=' + encodeURIComponent(id), 'PUT', data);
  return { synced: true };
}

/* ---- reminder settings ---- */
function guestPrefs() { try { return JSON.parse(lsGet(GUEST_PREFS)) || {}; } catch (e) { return {}; } }
function remindOn() { return lsGet(REMIND_FLAG) === '1'; }

export async function loadPrefs() {
  var p;
  if (inGuest()) p = guestPrefs();
  else p = (await api('/api/prefs')).prefs || {};
  p.tokens = remindOn() ? ['local'] : [];
  return p;
}
export async function savePrefs(patch) {
  if (inGuest()) {
    var g = Object.assign(guestPrefs(), patch); delete g.tokens;
    lsSet(GUEST_PREFS, JSON.stringify(g));
    return;
  }
  await api('/api/prefs', 'PUT', patch);
}

/* ---- on-device reminders ----
   The page itself raises the notification (reminder timer in app.js), so they appear only
   while Day Ledger is open in a tab or installed app. */
export async function pushSupported() { return 'Notification' in self; }
export function pushPermission() { return ('Notification' in self) ? Notification.permission : 'denied'; }
export function myToken() { return remindOn() && pushPermission() === 'granted' ? 'local' : ''; }

async function worker() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch (e) { return null; }
}
// Uses the service worker when there is one (phones need it), else the plain Notification API.
export async function notifyLocal(title, body) {
  var opts = { body: body, icon: '/icon-192.png' };
  var reg = await worker();
  if (reg) { try { await navigator.serviceWorker.ready; await reg.showNotification(title, opts); return; } catch (e) {} }
  new Notification(title, opts);
}

export async function enablePush() {
  if (!(await pushSupported())) throw new Error('unsupported');
  var perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  lsSet(REMIND_FLAG, '1');
  await worker();
  return 'local';
}
export async function disablePush() { lsDel(REMIND_FLAG); }
export function testNotification() { return notifyLocal('Day Ledger', 'Reminders are working on this device.'); }
export function onForeground() { return function () {}; }
