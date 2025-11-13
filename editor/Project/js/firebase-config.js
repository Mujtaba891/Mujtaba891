// firebase-config.js

// --- IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// --- YOUR PERSONAL FIREBASE CONFIGURATION ---
// This is the only place you need to add your config.
const firebaseConfig = {
  apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg",
  authDomain: "mujtaba-alam.firebaseapp.com",
  projectId: "mujtaba-alam",
  storageBucket: "mujtaba-alam.appspot.com", // Corrected this line for you
  messagingSenderId: "221609343134",
  appId: "1:221609343134:web:d64123479f43e6bc66638f",
  measurementId: "G-JMWCX9KHWR"
};

// --- INITIALIZE AND EXPORT ---
// This code uses your config to connect to Firebase.
const app = initializeApp(firebaseConfig);

// These exports are used by your main app.js file.
export const db = getFirestore(app);
export const auth = getAuth(app);

// This special export is what app.js reads to inject into the AI-generated websites.
export const config = firebaseConfig;