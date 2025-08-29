/**
 * @file Script for the admin authentication page (login.html).
 * @author Mujtaba Alam
 * @version 1.0.0
 * @description Handles user login, signup, and redirection.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Firebase Initialization ---
    const firebaseConfig = { apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg", authDomain: "mujtaba-alam.firebaseapp.com", projectId: "mujtaba-alam", storageBucket: "mujtaba-alam.appspot.com", messagingSenderId: "221609343134", appId: "1:221609343134:web:d64123479f43e6bc66638f" };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // --- 2. DOM Elements ---
    const loginFormContainer = document.getElementById('login-form-container');
    const signupFormContainer = document.getElementById('signup-form-container');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const loginErrorEl = document.getElementById('login-error');
    const signupErrorEl = document.getElementById('signup-error');
    const showSignupBtn = document.getElementById('show-signup');
    const showLoginBtn = document.getElementById('show-login');

    // --- 3. Authentication State Guard ---
    // This is the most important part. If a user is already logged in,
    // it redirects them to the admin dashboard, preventing them from seeing the login page again.
    auth.onAuthStateChanged(user => {
        if (user) {
            window.location.href = './admin/admin.html';
        }
    });

    // --- 4. Event Handlers ---

    // Handle Login Form Submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginErrorEl.textContent = ''; // Clear previous errors
        const email = loginForm['login-email'].value;
        const password = loginForm['login-password'].value;

        try {
            await auth.signInWithEmailAndPassword(email, password);
            // The onAuthStateChanged listener will handle the redirect automatically.
        } catch (error) {
            console.error("Login Error:", error);
            loginErrorEl.textContent = error.message;
        }
    });

    // Handle Signup Form Submission
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        signupErrorEl.textContent = ''; // Clear previous errors
        const email = signupForm['signup-email'].value;
        const password = signupForm['signup-password'].value;
        const passwordConfirm = signupForm['signup-password-confirm'].value;

        if (password !== passwordConfirm) {
            signupErrorEl.textContent = "Passwords do not match.";
            return;
        }

        try {
            await auth.createUserWithEmailAndPassword(email, password);
            // The onAuthStateChanged listener will handle the redirect.
        } catch (error) {
            console.error("Signup Error:", error);
            signupErrorEl.textContent = error.message;
        }
    });

    // --- 5. UI Toggling ---

    // Switch to Signup View
    showSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loginFormContainer.style.display = 'none';
        signupFormContainer.style.display = 'block';
    });

    // Switch to Login View
    showLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signupFormContainer.style.display = 'none';
        loginFormContainer.style.display = 'block';
    });
});