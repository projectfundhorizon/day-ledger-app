const L = require('./_lib');

const ID = /^(tasks|log-\d{4}-\d{2})$/;
const MAX_BYTES = 250000; // keeps one document under the 256 KiB the data model was designed for

// GET /api/data           -> every document of the signed-in user
// PUT /api/data?id=<id>   -> replace one document (tasks | log-YYYY-MM)
module.exports = L.route(['GET', 'PUT'], async function (req, res) {
  const u = await L.requireUser(req);
  const key = 'data:' + u.uid;
  if (req.method === 'GET') {
    const flat = (await L.redis(['HGETALL', key])) || [];
    const docs = [];
    for (let i = 0; i < flat.length; i += 2) docs.push({ id: flat[i], data: JSON.parse(flat[i + 1]) });
    return res.status(200).json({ docs: docs });
  }
  const id = String(req.query.id || '');
  if (!ID.test(id)) throw new L.HttpError(400, 'bad-id');
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new L.HttpError(400, 'bad-body');
  const text = JSON.stringify(body);
  if (text.length > MAX_BYTES) throw new L.HttpError(413, 'too-large');
  await L.redis(['HSET', key, id, text]);
  res.status(200).json({ ok: true });
});
