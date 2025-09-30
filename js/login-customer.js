'use strict';

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Firebase Initialization ---
    const firebaseConfig = { apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg", authDomain: "mujtaba-alam.firebaseapp.com", projectId: "mujtaba-alam", storageBucket: "mujtaba-alam.appspot.com", messagingSenderId: "221609343134", appId: "1:221609343134:web:d64123479f43e6bc66638f" };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // --- 2. DOM Elements ---
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const loginError = document.getElementById('login-error');
    const signupError = document.getElementById('signup-error');
    const showSignupBtn = document.getElementById('show-signup');
    const showLoginBtn = document.getElementById('show-login');
    const loginContainer = document.getElementById('login-form-container');
    const signupContainer = document.getElementById('signup-form-container');

    // --- 3. Redirection Logic ---
    // Get the page the user was on before being sent to login
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect') || 'my-orders.html'; // Default to my-orders page

    // --- 4. Event Handlers ---
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = loginForm['login-email'].value;
        const password = loginForm['login-password'].value;
        
        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                window.location.href = redirectUrl; // Success! Go back.
            })
            .catch(error => {
                loginError.textContent = error.message;
            });
    });

    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = signupForm['signup-email'].value;
        const password = signupForm['signup-password'].value;
        
        auth.createUserWithEmailAndPassword(email, password)
            .then(() => {
                window.location.href = redirectUrl; // Success! Go back.
            })
            .catch(error => {
                signupError.textContent = error.message;
            });
    });
    
    // --- 5. UI Toggling ---
    showSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loginContainer.style.display = 'none';
        signupContainer.style.display = 'block';
    });

    showLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signupContainer.style.display = 'none';
        loginContainer.style.display = 'block';
    });
});