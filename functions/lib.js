/* Pure helpers for the reminder schedule. No Firebase here, so they are easy to test. */

// Local date (YYYY-MM-DD) and minutes since midnight for a time zone.
function localParts(now, tz) {
  var f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  var p = {};
  f.formatToParts(now).forEach(function (x) { p[x.type] = x.value; });
  return { date: p.year + '-' + p.month + '-' + p.day, minutes: (+p.hour) * 60 + (+p.minute) };
}

// True from the chosen time until 30 minutes later, once per local day.
// The job runs every 15 minutes, so the window absorbs a late run.
function isDue(parts, time, lastSentDate) {
  var m = /^(\d\d):(\d\d)$/.exec(time || '');
  if (!m) return false;
  var t = (+m[1]) * 60 + (+m[2]);
  return parts.minutes >= t && parts.minutes < t + 30 && lastSentDate !== parts.date;
}

// What to say. Returns null when there is nothing worth sending.
function buildMessage(kind, activeCount, day) {
  if (day && day.closed) return null; // day already wrapped up
  var total = day ? day.items.length : activeCount;
  var done = day ? day.items.filter(function (i) { return i.done; }).length : 0;
  if (kind === 'morning') {
    if (!total) return { title: 'Plan your day', body: 'Add your goals and tasks for today.' };
    return { title: 'Plan your day', body: total + (total === 1 ? ' item is' : ' items are') + ' waiting for today. Open Day Ledger and set your goals.' };
  }
  if (!total) return { title: 'Wrap up your day', body: 'Take a minute to log how today went.' };
  if (done === total) return { title: 'All done today', body: 'All ' + total + ' done. Wrap up the day to close the book.' };
  return { title: 'Wrap up your day', body: done + ' of ' + total + ' done. Tick what you finished and note what slipped.' };
}

var BAD_TOKEN = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];

// Reads the person's entries for today and builds the message.
async function compose(db, uid, kind, date) {
  var base = db.collection('users').doc(uid).collection('data');
  var res = await Promise.all([base.doc('tasks').get(), base.doc('log-' + date.slice(0, 7)).get()]);
  var items = ((res[0].data() || {}).items || []);
  var active = items.filter(function (i) { return i.active; }).length;
  var day = (((res[1].data() || {}).days) || {})[date];
  return buildMessage(kind, active, day);
}

// Sends whatever is due for one person. deps = { db, messaging, FieldValue, appUrl }.
async function handle(deps, ref, r, now) {
  var tokens = (r.tokens || []).filter(Boolean);
  if (!tokens.length) return;
  var parts = localParts(now, r.tz || 'Asia/Kolkata');
  var last = r.lastSent || {};
  var updates = {};
  var kinds = ['morning', 'evening'];
  for (var k = 0; k < kinds.length; k++) {
    var kind = kinds[k], cfg = r[kind];
    if (!cfg || !cfg.on || !isDue(parts, cfg.time, last[kind])) continue;
    updates['lastSent.' + kind] = parts.date;
    var msg = await compose(deps.db, ref.id, kind, parts.date);
    if (!msg) continue;
    var res = await deps.messaging.sendEachForMulticast({
      tokens: tokens,
      notification: { title: msg.title, body: msg.body },
      webpush: { fcmOptions: { link: deps.appUrl }, notification: { icon: deps.appUrl + 'icon-192.png' } }
    });
    var dead = [];
    res.responses.forEach(function (x, i) {
      if (!x.success && x.error && BAD_TOKEN.indexOf(x.error.code) >= 0) dead.push(tokens[i]);
    });
    if (dead.length) updates.tokens = deps.FieldValue.arrayRemove.apply(deps.FieldValue, dead);
  }
  if (Object.keys(updates).length) await ref.update(updates);
}

module.exports = { localParts: localParts, isDue: isDue, buildMessage: buildMessage, compose: compose, handle: handle };
