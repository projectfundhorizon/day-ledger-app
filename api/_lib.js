/* Shared helpers for the Vercel functions. Files starting with "_" are not exposed as routes.
   No npm packages: the database is reached over plain HTTPS (Upstash Redis REST) and
   passwords use Node's built-in scrypt. */
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const COOKIE = 'dl_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30;

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

async function redis(cmd) {
  if (!DB_URL || !DB_TOKEN) throw new HttpError(500, 'storage-not-configured');
  const r = await fetch(DB_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + DB_TOKEN }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error('redis: ' + j.error);
  return j.result;
}

// Wraps a handler: method check, JSON-only writes (blocks cross-site form posts), error to JSON.
function route(methods, fn) {
  return async function (req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (methods.indexOf(req.method) < 0) throw new HttpError(405, 'method-not-allowed');
      if (req.method !== 'GET' && !/^application\/json/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'json-only');
      await fn(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: e.code || 'server-error' });
    }
  };
}

function normEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'invalid-email');
  return e;
}
function checkPassword(v) {
  const p = String(v || '');
  if (p.length < 8 || p.length > 200) throw new HttpError(400, 'weak-password');
  return p;
}
// ALLOWED_EMAILS (comma separated) restricts who may sign up and use the app. Unset = anyone.
function emailAllowed(email) {
  const list = (process.env.ALLOWED_EMAILS || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  return !list.length || list.indexOf(email) >= 0;
}

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return salt.toString('hex') + ':' + key.toString('hex');
}
async function verifyPassword(pw, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 2) return false;
  const key = await scrypt(pw, Buffer.from(parts[0], 'hex'), 64);
  const want = Buffer.from(parts[1], 'hex');
  return want.length === key.length && crypto.timingSafeEqual(key, want);
}

// At most `max` tries per `key` per 15 minutes.
async function rateLimit(key, max) {
  const k = 'rl:' + key;
  const n = await redis(['INCR', k]);
  if (n === 1) await redis(['EXPIRE', k, 900]);
  if (n > max) throw new HttpError(429, 'rate-limited');
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

const sha = function (s) { return crypto.createHash('sha256').update(s).digest('hex'); };
function readCookie(req) {
  const m = new RegExp('(?:^|; )' + COOKIE + '=([^;]+)').exec(req.headers.cookie || '');
  return m ? m[1] : '';
}
function setCookie(res, value, maxAge) {
  res.setHeader('Set-Cookie', COOKIE + '=' + value + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + maxAge);
}
async function startSession(res, uid) {
  const token = crypto.randomBytes(32).toString('hex');
  await redis(['SET', 'sess:' + sha(token), uid, 'EX', SESSION_SECONDS]);
  setCookie(res, token, SESSION_SECONDS);
}
async function endSession(req, res) {
  const t = readCookie(req);
  if (t) await redis(['DEL', 'sess:' + sha(t)]);
  setCookie(res, '', 0);
}
// Returns { uid, email } or null.
async function currentUser(req) {
  const t = readCookie(req);
  if (!t) return null;
  const uid = await redis(['GET', 'sess:' + sha(t)]);
  if (!uid) return null;
  const raw = await redis(['GET', 'user:' + uid]);
  if (!raw) return null;
  return { uid: uid, email: JSON.parse(raw).email };
}
async function requireUser(req) {
  const u = await currentUser(req);
  if (!u) throw new HttpError(401, 'not-signed-in');
  if (!emailAllowed(u.email)) throw new HttpError(403, 'not-allowed');
  return u;
}

module.exports = {
  HttpError, redis, route, normEmail, checkPassword, emailAllowed, hashPassword, verifyPassword,
  rateLimit, clientIp, startSession, endSession, currentUser, requireUser
};
