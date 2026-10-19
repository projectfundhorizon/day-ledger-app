# Hosting the site on Vercel

Vercel serves only the web pages (`public/`). Sign-in, the database and the reminder
function stay on Firebase. Vercel does not replace them.

1. Put this folder on GitHub (private repo is fine). Do not commit `node_modules`.
2. vercel.com > Add New > Project > import the repo.
   Framework preset: Other. Build command: leave empty. Output directory: `public` (vercel.json sets it).
3. Deploy. Note the address, e.g. `day-ledger.vercel.app`.
4. Firebase console > Authentication > Settings > Authorized domains > Add domain: your Vercel address
   (add a custom domain too, if you use one). Without this, sign-in fails on Vercel.
5. Rules and reminders still deploy from Firebase CLI:
   `firebase deploy --only firestore` (and `firebase deploy --only functions` for reminders, Blaze plan).
6. Push on iPhone: open the Vercel address in Safari > Share > Add to Home Screen.

Every `git push` redeploys the site. Changing `public/firebase-config.js` needs a push too.
