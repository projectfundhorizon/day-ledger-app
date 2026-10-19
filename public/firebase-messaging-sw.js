/* Shows reminder notifications when Day Ledger is closed.
   Notifications sent by the scheduled function open the app when tapped. */
importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js',
  '/firebase-config.js'
);
firebase.initializeApp(self.FIREBASE_CONFIG);
firebase.messaging(); // displays background notifications automatically
