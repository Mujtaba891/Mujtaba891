/**
 * @file Script for the contact.html page.
 * @author Mujtaba Alam
 * @version 1.0.0
 * @description Handles the contact form submission, saves the message to a 'contact_messages'
 *              collection in Firestore, and provides user feedback.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. INITIALIZE FIREBASE ---
    // You can reuse the Firebase config you have on the page.
    // This script assumes firebase.js is loaded and `db` is available globally from the inline script.

    const contactForm = document.getElementById('contact-form');
    const formStatus = document.getElementById('form-status');

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent the default form submission

            // --- 2. GET FORM DATA ---
            const name = contactForm.querySelector('input[name="name"]').value.trim();
            const email = contactForm.querySelector('input[name="email"]').value.trim();
            const message = contactForm.querySelector('textarea[name="message"]').value.trim();
            const submitButton = contactForm.querySelector('button[type="submit"]');

            // Simple validation
            if (!name || !email || !message) {
                formStatus.textContent = 'Please fill out all fields.';
                formStatus.className = 'status-error';
                return;
            }

            // --- 3. PROVIDE FEEDBACK & SAVE TO FIREBASE ---
            submitButton.disabled = true;
            submitButton.innerHTML = '<div class="spinner-small"></div> Sending...';
            formStatus.textContent = '';
            formStatus.className = '';

            try {
                // Create a data object to send
                const messageData = {
                    name: name,
                    email: email,
                    message: message,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp() // Adds a server-side timestamp
                };

                // Add a new document with a generated ID to the 'contact_messages' collection
                await db.collection('contact_messages').add(messageData);

                // --- 4. HANDLE SUCCESS ---
                formStatus.textContent = 'Thank you! Your message has been sent successfully.';
                formStatus.className = 'status-success';
                submitButton.innerHTML = 'Message Sent!';
                contactForm.reset(); // Clear the form

            } catch (error) {
                // --- 5. HANDLE ERRORS ---
                console.error("Error sending message:", error);
                formStatus.textContent = 'An error occurred. Please try again later.';
                formStatus.className = 'status-error';
                submitButton.disabled = false;
                submitButton.innerHTML = 'Send Message';
            }
        });
    }
});