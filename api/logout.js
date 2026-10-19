const L = require('./_lib');

module.exports = L.route(['POST'], async function (req, res) {
  await L.endSession(req, res);
  res.status(200).json({ ok: true });
});
