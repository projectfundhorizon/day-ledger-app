const L = require('./_lib');

const TIME = /^\d\d:\d\d$/;
function slot(v) {
  if (!v || typeof v !== 'object' || typeof v.on !== 'boolean' || !TIME.test(String(v.time))) throw new L.HttpError(400, 'bad-body');
  return { on: v.on, time: v.time };
}

// GET /api/prefs -> { prefs } ; PUT /api/prefs -> merge email, tz, morning, evening
module.exports = L.route(['GET', 'PUT'], async function (req, res) {
  const u = await L.requireUser(req);
  const key = 'prefs:' + u.uid;
  const raw = await L.redis(['GET', key]);
  const cur = raw ? JSON.parse(raw) : null;
  if (req.method === 'GET') return res.status(200).json({ prefs: cur });
  const b = req.body || {}, next = Object.assign({}, cur);
  if ('email' in b) next.email = String(b.email).slice(0, 254);
  if ('tz' in b) next.tz = String(b.tz).slice(0, 64);
  if ('morning' in b) next.morning = slot(b.morning);
  if ('evening' in b) next.evening = slot(b.evening);
  await L.redis(['SET', key, JSON.stringify(next)]);
  res.status(200).json({ ok: true });
});
