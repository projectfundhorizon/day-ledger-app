/* Project config for Day Ledger. Steps are in README.md.
   This file is loaded by the page and by the notification service worker. */

// Firebase console > Project settings > Your apps > Web app > Config
self.FIREBASE_CONFIG = {
  apiKey: "AIzaSyD8ykk4WicpmeXjuSmsIMT5Sumse3NJfZ4",
  authDomain: "day-ledger-darshan-shah.firebaseapp.com",
  projectId: "day-ledger-darshan-shah",
  storageBucket: "day-ledger-darshan-shah.firebasestorage.app",
  messagingSenderId: "359682841677",
  appId: "1:359682841677:web:e8f033a7caeb79a2821004"
};

// Firebase console > Project settings > Cloud Messaging > Web Push certificates > Generate key pair
self.VAPID_KEY = "PASTE_WEB_PUSH_KEY";
