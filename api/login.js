const L = require('./_lib');

module.exports = L.route(['POST'], async function (req, res) {
  const b = req.body || {};
  const email = L.normEmail(b.email), pw = String(b.password || '');
  await L.rateLimit('login-ip:' + L.clientIp(req), 30);
  await L.rateLimit('login:' + email, 10);
  const uid = await L.redis(['GET', 'email:' + email]);
  const raw = uid ? await L.redis(['GET', 'user:' + uid]) : null;
  const user = raw ? JSON.parse(raw) : null;
  // Hash even when the account is missing so timing does not reveal which emails exist.
  const ok = await L.verifyPassword(pw, user ? user.pw : 'x:x');
  if (!user || !ok) throw new L.HttpError(401, 'invalid-credentials');
  if (!L.emailAllowed(email)) throw new L.HttpError(403, 'not-allowed');
  await L.startSession(res, uid);
  res.status(200).json({ user: { uid: uid, email: email } });
});
