// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// TODO: Add your own Firebase configuration from your project settings
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg",
  authDomain: "mujtaba-alam.firebaseapp.com",
  projectId: "mujtaba-alam",
  storageBucket: "mujtaba-alam.firebasestorage.app",
  messagingSenderId: "221609343134",
  appId: "1:221609343134:web:d64123479f43e6bc66638f",
  measurementId: "G-JMWCX9KHWR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export the services
export { auth, db };