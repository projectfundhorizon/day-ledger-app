const crypto = require('crypto');
const L = require('./_lib');

module.exports = L.route(['POST'], async function (req, res) {
  const b = req.body || {};
  const email = L.normEmail(b.email), pw = L.checkPassword(b.password);
  await L.rateLimit('signup:' + L.clientIp(req), 20);
  if (!L.emailAllowed(email)) throw new L.HttpError(403, 'not-allowed');
  const uid = crypto.randomBytes(12).toString('hex');
  const claimed = await L.redis(['SETNX', 'email:' + email, uid]);
  if (!claimed) throw new L.HttpError(409, 'email-taken');
  await L.redis(['SET', 'user:' + uid, JSON.stringify({ email: email, pw: await L.hashPassword(pw) })]);
  await L.startSession(res, uid);
  res.status(200).json({ user: { uid: uid, email: email } });
});
