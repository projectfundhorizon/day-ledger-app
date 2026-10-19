const assert = require('assert');
const { localParts, isDue, buildMessage } = require('./lib');

// 2026-10-18 15:30 UTC is 21:00 in Kolkata
const now = new Date('2026-10-18T15:30:00Z');
const kol = localParts(now, 'Asia/Kolkata');
assert.deepStrictEqual(kol, { date: '2026-10-18', minutes: 21 * 60 });
assert.strictEqual(localParts(now, 'America/New_York').minutes, 11 * 60 + 30);
assert.strictEqual(localParts(new Date('2026-10-18T20:00:00Z'), 'Asia/Kolkata').date, '2026-10-19'); // crosses midnight

assert.strictEqual(isDue(kol, '21:00', undefined), true);          // on time
assert.strictEqual(isDue(kol, '20:45', undefined), true);          // 15 min late still fine
assert.strictEqual(isDue(kol, '20:15', undefined), false);         // window passed
assert.strictEqual(isDue(kol, '21:15', undefined), false);         // not yet
assert.strictEqual(isDue(kol, '21:00', '2026-10-18'), false);      // already sent today
assert.strictEqual(isDue(kol, '21:00', '2026-10-17'), true);       // sent yesterday
assert.strictEqual(isDue(kol, 'bad', undefined), false);

const open = { closed: false, items: [{ done: true }, { done: false }, { done: false }] };
assert.strictEqual(buildMessage('evening', 5, open).body.startsWith('1 of 3 done'), true);
assert.strictEqual(buildMessage('evening', 5, { closed: true, items: [] }), null);              // wrapped up, skip
assert.strictEqual(buildMessage('evening', 4, undefined).body.startsWith('0 of 4 done'), true);  // nothing logged yet
assert.strictEqual(buildMessage('evening', 0, undefined).title, 'Wrap up your day');
assert.strictEqual(buildMessage('evening', 2, { closed: false, items: [{ done: true }, { done: true }] }).title, 'All done today');
assert.strictEqual(buildMessage('morning', 1, undefined).body.startsWith('1 item is waiting'), true);
assert.strictEqual(buildMessage('morning', 3, undefined).body.startsWith('3 items are waiting'), true);
assert.strictEqual(buildMessage('morning', 0, undefined).body, 'Add your goals and tasks for today.');
assert.strictEqual(buildMessage('morning', 3, { closed: true, items: [] }), null);

// ---- full send path with fakes ----
(async function () {
  const { handle } = require('./lib');
  function fakeDb(tasks, days) {
    return { collection: function () { return { doc: function () { return { collection: function () { return { doc: function (id) {
      return { get: async function () { return { data: function () { return id === 'tasks' ? tasks : id.indexOf('log-') === 0 ? days : undefined; } }; } };
    } }; } }; } }; } };
  }
  function run(r, db, resp) {
    const sent = [], updates = [];
    const deps = {
      db: db, appUrl: 'https://x.web.app/',
      FieldValue: { arrayRemove: function () { return { removed: Array.prototype.slice.call(arguments) }; } },
      messaging: { sendEachForMulticast: async function (m) { sent.push(m); return { responses: resp || m.tokens.map(function () { return { success: true }; }) }; } }
    };
    const ref = { id: 'u1', update: async function (u) { updates.push(u); } };
    return handle(deps, ref, r, now).then(function () { return { sent: sent, updates: updates }; });
  }
  const tasks = { items: [{ active: true }, { active: true }, { active: false }] };
  const db = fakeDb(tasks, { days: { '2026-10-18': { closed: false, items: [{ done: true }, { done: false }] } } });
  const base = { tz: 'Asia/Kolkata', tokens: ['a', 'b'], evening: { on: true, time: '21:00' }, morning: { on: true, time: '08:00' } };

  let o = await run(base, db);                       // 21:00 local: evening is due, morning is not
  assert.strictEqual(o.sent.length, 1);
  assert.strictEqual(o.sent[0].notification.body.startsWith('1 of 2 done'), true);
  assert.strictEqual(o.updates[0]['lastSent.evening'], '2026-10-18');
  assert.strictEqual(o.sent[0].webpush.fcmOptions.link, 'https://x.web.app/');

  o = await run(Object.assign({}, base, { lastSent: { evening: '2026-10-18' } }), db);   // already sent today
  assert.strictEqual(o.sent.length, 0);

  o = await run(Object.assign({}, base, { evening: { on: false, time: '21:00' } }), db); // switched off
  assert.strictEqual(o.sent.length, 0);

  o = await run(Object.assign({}, base, { tokens: [] }), db);                            // no device
  assert.strictEqual(o.sent.length, 0);

  const closedDb = fakeDb(tasks, { days: { '2026-10-18': { closed: true, items: [{ done: false }] } } });
  o = await run(base, closedDb);                                                         // wrapped up: skip, but mark handled
  assert.strictEqual(o.sent.length, 0);
  assert.strictEqual(o.updates[0]['lastSent.evening'], '2026-10-18');

  o = await run(base, db, [{ success: true }, { success: false, error: { code: 'messaging/registration-token-not-registered' } }]);
  assert.deepStrictEqual(o.updates[0].tokens.removed, ['b']);                            // dead token pruned
  console.log('functions logic OK');
})().catch(function (e) { console.error(e); process.exit(1); });
