# Day Ledger: setup

A daily goals and tasks ledger for you and your partner. Each of you creates your own login,
sees only your own days, and gets morning and evening reminders on your phone or laptop.
It runs on Firebase, so it does not need Claude, and you host it yourself.

## What it costs
- Hosting, sign-in and the database stay inside Firebase's free allowance for two people.
- Reminders in the background need a small scheduled function. Firebase only lets you deploy
  functions on its pay-as-you-go plan (Blaze), which means adding a card. One scheduled job is
  within the three free Cloud Scheduler jobs each Google account gets. Add a budget alert so
  you are told if anything ever goes above zero.
- Prefer no card? Skip step 8 and the `functions` folder. Everything works except reminders
  that arrive while the app is closed.

## Steps
1. **Install the tools.** Install Node.js 22 or newer from nodejs.org. Then run
   `npm install -g firebase-tools` and `firebase login`.
2. **Create a project.** Go to console.firebase.google.com, choose Add project, and turn
   Google Analytics off.
3. **Register the web app.** On the project page choose the `</>` icon, give it a name, skip
   the hosting option, and copy the `firebaseConfig` values into `public/firebase-config.js`.
4. **Turn on sign-in.** Build > Authentication > Get started > Email/Password > Enable.
5. **Create the database.** Build > Firestore Database > Create database > production mode.
   Pick `asia-south1` (Mumbai) if you are in India.
6. **Get the notification key.** Project settings > Cloud Messaging > Web Push certificates >
   Generate key pair. Paste it into `VAPID_KEY` in `public/firebase-config.js`.
7. **Choose who is allowed.** Open `firestore.rules` and replace the two example emails with
   yours and your partner's, in lowercase. Nobody else can store anything.
8. **Switch to the Blaze plan** (only for background reminders). Upgrade in the Firebase
   console, then create a budget alert in Google Cloud Billing.
9. **Deploy.** In this folder run:
   ```
   firebase use --add
   cd functions && npm install && cd ..
   firebase deploy
   ```
   The last line prints your Hosting URL, normally `https://YOUR-PROJECT.web.app`.
10. **Create the accounts.** Open the URL, tap Create an account, and use an email from the
    allowed list. Your partner does the same on her own phone.
11. **Turn on reminders on each device.** Open Setup > Reminders > Turn on reminders.
    - Android: use Chrome.
    - iPhone (iOS 16.4 or newer): in Safari tap Share > Add to Home Screen, open Day Ledger
      from the home screen, then turn on reminders.
12. **Test.** Tap Send a test here. For a real run, set a reminder a few minutes ahead. The
    schedule is checked every 15 minutes, so allow up to 15 minutes.

## How reminders behave
- Morning plan and evening wrap-up, each with its own time, set separately by each person.
- The evening reminder is skipped when you have already wrapped up the day.
- Times follow the time zone of the device you last opened the app on.

## Privacy
Entries live under your own login and the database rules block everyone else. You, as the
owner of the Firebase project, can still see all data in the Firebase console.

## If something fails
- "This email is not allowed": fix the emails in `firestore.rules` and run `firebase deploy`.
- No notifications: check the browser or phone permission, and on iPhone make sure you opened
  the app from the home screen. Function logs: `firebase functions:log`.
- Blank page that asks for config: step 3 values are still placeholders.

## For Claude Code
Read `CLAUDE.md` first. It describes the files, data model and rules.


## Hosting on Vercel instead of Firebase Hosting
See VERCEL.md. Skip `firebase deploy --only hosting`.
