# Day Ledger (self-hosted on Vercel)

## Purpose
A daily goals and tasks ledger for two people. Each person ticks what they finished, wraps up
the day, and says why anything slipped. Days roll up into weekly, monthly and yearly views so
procrastination patterns show at a glance. Reminders show as browser notifications.

## Stack
- Static site, no build step. Plain ES modules in `public/`.
- Own backend: Vercel functions in `api/` (Node 22, no npm packages) + Upstash Redis over its REST API.
- Own accounts: email + password (scrypt), httpOnly session cookie. No Firebase, no email service.
- Charts are hand-drawn SVG. PDF export uses jsPDF 2.5.1 from cdnjs (the one remaining external script).

## Files
- `public/index.html`: styles, sign-in screen, app shell.
- `public/app.js`: all UI, day model, statistics, charts, PDF export, reminder settings and reminder timer.
- `public/store.js`: the only file that talks to the backend (or to localStorage in guest mode).
- `public/sw.js`: service worker that shows reminder notifications (needed on phones).
- `api/_lib.js`: Redis client, sessions, password hashing, rate limiting. `api/signup|login|logout|me|data|prefs.js`: routes.
- `VERCEL.md`: one-time setup (Redis store, `ALLOWED_EMAILS`).
- Legacy, unused since the move off Firebase: `functions/`, `firebase.json`, `firestore.rules`, `public/firebase-config.js`, `public/firebase-messaging-sw.js`.

## Data model (Redis)
- `email:{email}` -> uid. `user:{uid}` -> `{ email, pw }` (pw = `salt:scrypt` hex). `sess:{sha256(token)}` -> uid, 30 day TTL.
- `data:{uid}` hash: field `tasks` -> `{ items: [{ id, title, kind: "task"|"goal", active }] }`;
  field `log-YYYY-MM` -> `{ days: { "YYYY-MM-DD": { closed, items: [...] } } }`
  - item: `{ id, tid|null, title, kind, done, reason, pushed?, carried? }`
  - `tid` links to a standing task; `null` is a one-off for that day.
  - Months are sharded to keep each document under ~250 KB.
- `prefs:{uid}` -> `{ email, tz, morning:{on,time}, evening:{on,time} }`. `rl:*` rate-limit counters.

## Behaviour rules
- Standing tasks appear on every open day. Past and closed days keep their own wording.
- A day counts in stats only once it is closed or in the past.
- Wrapping up a day shows reason chips and a text box on every unticked item.
- One-offs can be carried to the next day. The carry count feeds "Keeps slipping".
- Before the first finished day, Week and Trends show clearly labelled sample data.
- Reminders: the page checks every 30 s (`localReminderTick`); from the chosen time for 30 minutes, once per local
  day, evening skipped if the day is wrapped up. They fire only while the app is open (no server push).
- Signed-in data re-syncs every minute and when the tab regains focus. Writes need a connection (no offline queue).

## Guest mode
- "Continue as guest" on the sign-in screen. `store.js` keeps entries and reminder settings in localStorage
  (`day-ledger-guest*`). Never touches the API. Erased if site data is cleared.

## Security
- Only `ALLOWED_EMAILS` (Vercel env var, comma separated) may sign up or use the app; unset means anyone.
- Every `api/data` and `api/prefs` call is scoped to the session's own uid. Writes must be `application/json`.
- Login and signup are rate limited. No password reset: see `VERCEL.md`.

## Verified and not verified
- Verified: guest mode and guest reminders in a browser against a local copy.
- Not yet verified live: signup, login, data sync, `ALLOWED_EMAILS`, on the deployed API.
