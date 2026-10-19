const L = require('./_lib');

// 200 with user:null when signed out, so the page can tell "not signed in" from a real error.
module.exports = L.route(['GET'], async function (req, res) {
  const u = await L.currentUser(req);
  res.status(200).json({ user: u });
});
