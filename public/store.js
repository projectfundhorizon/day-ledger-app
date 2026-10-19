/* Everything Firebase-specific lives in this file: sign-in, saving, and push notifications.
   The rest of the app only calls the functions exported here. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, setDoc, getDoc, collection, onSnapshot, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getMessaging, getToken, deleteToken, onMessage, isSupported
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';

var app = null, auth = null, db = null, msg = null;
var TOKEN_KEY = 'day-ledger-fcm-token';

export function configured() {
  var c = self.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.projectId && !/PASTE/.test(c.apiKey + c.projectId));
}
function init() {
  if (app) return;
  app = initializeApp(self.FIREBASE_CONFIG);
  auth = getAuth(app);
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    db = initializeFirestore(app, {});
  }
}
function uid() { return auth.currentUser.uid; }

/* ---- guest mode: nothing leaves the device ----
   Entries live in this browser's localStorage under GUEST_PREFIX. No Firebase account,
   no sync, no reminders. Clearing site data erases them. */
var GUEST_FLAG = 'day-ledger-guest';
var GUEST_PREFIX = 'day-ledger-guest:';
var GUEST_USER = { uid: 'guest', email: '', guest: true };
var userCb = null;
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function inGuest() { return lsGet(GUEST_FLAG) === '1'; }
export function isGuest() { return inGuest(); }
export function startGuest() {
  try { localStorage.setItem(GUEST_FLAG, '1'); } catch (e) { throw new Error('guest-unavailable'); }
  if (userCb) userCb(GUEST_USER);
}

/* ---- sign-in ---- */
export function onUser(cb) {
  init();
  userCb = cb;
  return onAuthStateChanged(auth, function (u) {
    if (u) { try { localStorage.removeItem(GUEST_FLAG); } catch (e) {} cb({ uid: u.uid, email: u.email }); }
    else cb(inGuest() ? GUEST_USER : null);
  });
}
export function signIn(email, pw) { init(); return signInWithEmailAndPassword(auth, email, pw); }
export function signUp(email, pw) { init(); return createUserWithEmailAndPassword(auth, email, pw); }
export function logOut() {
  init();
  if (inGuest()) { try { localStorage.removeItem(GUEST_FLAG); } catch (e) {} if (userCb) userCb(null); return Promise.resolve(); }
  return signOut(auth);
}
export function resetPassword(email) { init(); return sendPasswordResetEmail(auth, email); }

/* ---- entries: users/{uid}/data/{tasks | log-YYYY-MM} ---- */
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
  return onSnapshot(collection(db, 'users', uid(), 'data'), function (snap) {
    cb(snap.docs.map(function (d) { return { id: d.id, data: d.data() }; }));
  }, onError);
}
// Resolves once the server confirms, or after 1.5 s if offline. The write stays queued
// on the device and syncs by itself when the connection returns.
export function saveDoc(id, data) {
  if (inGuest()) {
    try { localStorage.setItem(GUEST_PREFIX + id, JSON.stringify(data)); return Promise.resolve({ synced: true }); }
    catch (e) { return Promise.reject(e); }
  }
  var p = setDoc(doc(db, 'users', uid(), 'data', id), data);
  return Promise.race([
    p.then(function () { return { synced: true }; }),
    new Promise(function (r) { setTimeout(function () { r({ synced: false }); }, 1500); })
  ]);
}

/* ---- reminder settings: reminders/{uid} ---- */
/* Guests get on-device reminders: settings and an "on" flag in localStorage, and the page
   itself raises the notification (see the reminder timer in app.js). They only fire while
   Day Ledger is open in a tab or installed app; signed-in users get server push instead. */
var GUEST_PREFS = 'day-ledger-guest-prefs';
var GUEST_REMIND = 'day-ledger-guest-remind';
function guestPrefs() { try { return JSON.parse(lsGet(GUEST_PREFS)) || {}; } catch (e) { return {}; } }
function guestRemindOn() { return lsGet(GUEST_REMIND) === '1'; }

export async function loadPrefs() {
  if (inGuest()) { var g = guestPrefs(); g.tokens = guestRemindOn() ? ['local'] : []; return g; }
  var s = await getDoc(doc(db, 'reminders', uid()));
  return s.exists() ? s.data() : null;
}
export function savePrefs(patch) {
  if (inGuest()) {
    try { var g = Object.assign(guestPrefs(), patch); delete g.tokens; localStorage.setItem(GUEST_PREFS, JSON.stringify(g)); return Promise.resolve(); }
    catch (e) { return Promise.reject(e); }
  }
  return setDoc(doc(db, 'reminders', uid()), patch, { merge: true });
}

/* ---- push notifications ---- */
export async function pushSupported() {
  if (inGuest()) return 'Notification' in self;
  try { return !!(('Notification' in self) && ('serviceWorker' in navigator) && await isSupported()); }
  catch (e) { return false; }
}
export function pushPermission() { return ('Notification' in self) ? Notification.permission : 'denied'; }
export function myToken() {
  if (inGuest()) return guestRemindOn() && pushPermission() === 'granted' ? 'local' : '';
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
}
function messaging() { if (!msg) msg = getMessaging(app); return msg; }

// Shows a notification from the page. Uses the service worker when there is one (needed on
// phones), otherwise the plain Notification API.
export async function notifyLocal(title, body) {
  var opts = { body: body, icon: '/icon-192.png' };
  try {
    var reg = await navigator.serviceWorker.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch (e) {}
  new Notification(title, opts);
}

export async function enablePush(email) {
  if (!(await pushSupported())) throw new Error('unsupported');
  var perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  if (inGuest()) { try { localStorage.setItem(GUEST_REMIND, '1'); } catch (e) {} return 'local'; }
  var reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  var token = await getToken(messaging(), { vapidKey: self.VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) throw new Error('no-token');
  await setDoc(doc(db, 'reminders', uid()), { email: email, tokens: arrayUnion(token) }, { merge: true });
  try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
  return token;
}
export async function disablePush() {
  if (inGuest()) { try { localStorage.removeItem(GUEST_REMIND); } catch (e) {} return; }
  var t = myToken();
  try { await deleteToken(messaging()); } catch (e) {}
  if (t) await setDoc(doc(db, 'reminders', uid()), { tokens: arrayRemove(t) }, { merge: true });
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
}
export async function testNotification() {
  if (inGuest()) return notifyLocal('Day Ledger', 'Reminders are working on this device.');
  var reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
  if (!reg) reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Day Ledger', { body: 'Reminders are working on this device.', icon: '/icon-192.png' });
}
export function onForeground(cb) { if (inGuest()) return function () {}; try { return onMessage(messaging(), cb); } catch (e) { return function () {}; } }
