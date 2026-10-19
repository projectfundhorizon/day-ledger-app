/* Sends the morning and evening reminders.
   Runs every 15 minutes, checks each person's own times, and skips the evening
   reminder when the day is already wrapped up. */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { handle } = require('./lib');

initializeApp();

const REGION = 'asia-south1'; // Mumbai. Change it if you prefer another region.
const APP_URL = 'https://' + process.env.GCLOUD_PROJECT + '.web.app/';

exports.sendReminders = onSchedule({ schedule: 'every 15 minutes', region: REGION, timeZone: 'Etc/UTC' }, async function () {
  const db = getFirestore();
  const deps = { db: db, messaging: getMessaging(), FieldValue: FieldValue, appUrl: APP_URL };
  const snap = await db.collection('reminders').get();
  const now = new Date();
  for (const d of snap.docs) {
    try { await handle(deps, d.ref, d.data(), now); }
    catch (e) { console.error('reminder failed for', d.id, e); }
  }
});
