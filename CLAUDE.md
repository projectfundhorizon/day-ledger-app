# Day Ledger (standalone Firebase app)

## Purpose
A daily goals and tasks ledger for two people. Each person ticks what they finished, wraps up
the day, and says why anything slipped. Days roll up into weekly, monthly and yearly views so
procrastination patterns show at a glance. Reminders arrive as push notifications.

## Stack
- Static site, no build step. Plain ES modules in `public/`.
- Firebase Auth (email and password), Firestore, Cloud Messaging, Hosting.
- One scheduled Cloud Function (`functions/`) sends reminders. Node 22, firebase-functions 7.
- Charts are hand-drawn SVG. PDF export uses jsPDF 2.5.1 from cdnjs.

## Files
- `public/index.html`: styles, sign-in screen, app shell.
- `public/app.js`: all UI, day model, statistics, charts, PDF export, reminder settings.
- `public/store.js`: the only file that touches Firebase. Swap this to change backend.
- `public/firebase-config.js`: project config and web push key. Read by the page and the worker.
- `public/firebase-messaging-sw.js`: shows background notifications.
- `functions/lib.js`: pure schedule and message logic with injected dependencies. Tested by `node functions/test.js`.
- `functions/index.js`: the scheduled trigger, every 15 minutes.
- `firestore.rules`: email allowlist plus per-user access. `firebase.json`: hosting, rules, functions.

## Data model
- `users/{uid}/data/tasks`: `{ items: [{ id, title, kind: "task"|"goal", active }] }`
- `users/{uid}/data/log-YYYY-MM`: `{ days: { "YYYY-MM-DD": { closed, items: [...] } } }`
  - item: `{ id, tid|null, title, kind, done, reason, pushed?, carried? }`
  - `tid` links to a standing task; `null` is a one-off for that day.
  - Months are sharded because a document is capped at 256 KiB.
- `reminders/{uid}`: `{ email, tz, morning:{on,time}, evening:{on,time}, tokens:[], lastSent:{morning,evening} }`

## Behaviour rules
- Standing tasks appear on every open day. Past and closed days keep their own wording.
- A day counts in stats only once it is closed or in the past.
- Wrapping up a day shows reason chips and a text box on every unticked item.
- One-offs can be carried to the next day. The carry count feeds "Keeps slipping".
- Before the first finished day, Week and Trends show clearly labelled sample data.
- The evening reminder is skipped if the day is already closed. Each reminder sends once per local day,
  inside a 30 minute window after the chosen time.
- Offline writes queue on the device (persistent Firestore cache) and sync later.

## Security
- Rules allow only the emails listed in `firestore.rules`, and only on the signed-in user's own `users/{uid}` and `reminders/{uid}`.
- The Cloud Function uses the Admin SDK, which bypasses rules by design.

## Decisions already made
- Standalone Firebase hosting so neither person needs a Claude account.
- Push reminders through a scheduled function (needs the Blaze plan).
- Two themes: light and dark, toggled by the sun/moon button and remembered per device.
- PDF download for Trends and for standing tasks.

## Verified and not verified
- Verified here with mocks: app logic, every view, PDF output, reminder schedule and send path.
- Not run: a real `firebase deploy`, real sign-in, and a real push to a phone. Do these first and fix what they show.
