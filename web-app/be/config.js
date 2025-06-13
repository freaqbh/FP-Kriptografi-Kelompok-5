const admin = require("firebase-admin");
const serviceAccount = require("serviceAccountKey.json");

var firebaseApp = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
var db = firebaseApp.firestore();

module.exports = { db };