/**
 * @file Definitive, Fully Functional "My Orders" Page Script
 * @author Mujtaba Alam (Professionally Architected)
 * @version 5.0.0 (Dynamic Price Display Update)
 * @description This script requires a user to be logged in. It securely fetches ONLY the
 *              logged-in user's orders from Firestore, sorts them into pending/completed
 *              sections, and handles the update request logic. It now correctly displays
 *              the final total price, including all add-ons.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. CONFIGURATION & STATE ---
    const firebaseConfig = { apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg", authDomain: "mujtaba-alam.firebaseapp.com", projectId: "mujtaba-alam", storageBucket: "mujtaba-alam.appspot.com", messagingSenderId: "221609343134", appId: "1:221609343134:web:d64123479f43e6bc66638f" };

    const DOM = {
        pendingContainer: document.getElementById('pending-orders-container'),
        completedContainer: document.getElementById('completed-orders-container'),
        pendingPlaceholder: document.getElementById('loading-pending-placeholder'),
        completedPlaceholder: document.getElementById('loading-completed-placeholder'),
        mainContainer: document.querySelector('.my-orders-container'),
    };
    
    let db, auth;

    // --- 2. INITIALIZATION & AUTHENTICATION GUARD ---
    function main() {
        if (!initializeFirebase()) return;
        
        auth.onAuthStateChanged(user => {
            if (user) {
                console.log("User is authenticated. Fetching orders for UID:", user.uid);
                fetchUserOrders(user.uid);
            } else {
                console.log("User is not authenticated. Displaying login prompt.");
                DOM.pendingPlaceholder.innerHTML = `<p>Please <a href="login-customer.html?redirect=my-orders.html">login or create an account</a> to view your projects.</p>`;
                DOM.completedPlaceholder.style.display = 'none';
            }
        });
        
        attachEventListeners();
    }

    function initializeFirebase() {
        try {
            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            db = firebase.firestore();
            return true;
        } catch (error) {
            console.error("CRITICAL: Firebase initialization failed:", error);
            DOM.pendingPlaceholder.innerHTML = `<p style="color:red;">Error connecting to services.</p>`;
            return false;
        }
    }

    // --- 3. DATA FETCHING (Works with new index) ---
    async function fetchUserOrders(userId) {
        try {
            const querySnapshot = await db.collection('orders')
                .where('userId', '==', userId)
                .orderBy('createdAt', 'desc')
                .get();
            
            console.log(`Firestore query returned ${querySnapshot.size} documents.`);

            let pendingOrders = [];
            let completedOrders = [];

            querySnapshot.forEach(doc => {
                const orderData = { id: doc.id, ...doc.data() };
                if (orderData.status === 'Pending Payment') {
                    pendingOrders.push(orderData);
                } else {
                    completedOrders.push(orderData);
                }
            });

            renderOrdersUI(pendingOrders, completedOrders);

        } catch (error) {
            console.error("CRITICAL ERROR fetching user orders:", error);
            DOM.pendingPlaceholder.innerHTML = `<p style="color:red;">Could not fetch your orders. Please check the developer console for more information.</p>`;
            DOM.completedPlaceholder.style.display = 'none';
        }
    }

    // --- 4. UI RENDERING ---
    function renderOrdersUI(pending, completed) {
        // Render Pending Orders
        if (pending.length > 0) {
            DOM.pendingPlaceholder.style.display = 'none';
            DOM.pendingContainer.innerHTML = pending.map(createPendingOrderCardHTML).join('');
        } else {
            DOM.pendingPlaceholder.innerHTML = `<p>You have no orders awaiting payment. <a href="pricing.html">Start a new project!</a></p>`;
        }

        // Render Completed Orders
        if (completed.length > 0) {
            DOM.completedPlaceholder.style.display = 'none';
            DOM.completedContainer.innerHTML = completed.map(createCompletedOrderCardHTML).join('');
        } else {
            DOM.completedPlaceholder.innerHTML = `<p>Your active and completed projects will appear here.</p>`;
        }
    }

    function createPendingOrderCardHTML(order) {
        // --- THIS IS THE KEY UPDATE ---
        // It now reads from priceBreakdown.totalPrice for the accurate total.
        // It falls back to estimatedPrice for any older orders that don't have the new structure.
        const totalPrice = order.priceBreakdown?.totalPrice ?? order.estimatedPrice ?? 0;

        return `
            <div class="neumorphic-outset order-card">
                <div class="order-card-info">
                    <h3>${order.selectedTemplate}</h3>
                    <p><strong>Total Price:</strong> ₹${totalPrice.toLocaleString('en-IN')}</p>
                    <p><strong>Status:</strong> <span class="status-pending-payment" style="font-weight:600; color: #f39c12;">${order.status}</span></p>
                </div>
                <div class="order-card-actions">
                    <button class="neumorphic-btn primary pay-now-btn" data-order-id="${order.id}">Pay Now</button>
                </div>
            </div>`;
    }

    function createCompletedOrderCardHTML(order) {
        const orderTimestamp = order.paymentDetails?.paidAt || order.createdAt;
        let isUpdateEligible = false;
        if (orderTimestamp) {
            const orderDate = orderTimestamp.toDate();
            const oneYearLater = new Date(new Date(orderDate).setFullYear(orderDate.getFullYear() + 1));
            if (new Date() < oneYearLater) isUpdateEligible = true;
        }

        const updateButtonHTML = isUpdateEligible
            ? `<button class="neumorphic-btn request-update-btn" data-order-id="${order.id}">Request Update</button>`
            : `<button class="neumorphic-btn" disabled>Request Update</button><p class="disabled-reason">1-year free update period has ended.</p>`;
        
        return `
            <div class="neumorphic-outset order-card">
                <div class="order-card-info">
                    <h3>${order.selectedTemplate}</h3>
                    <p><strong>Project ID:</strong> ${order.id}</p>
                    <p><strong>Status:</strong> <span style="font-weight:600; color: ${order.status === 'Completed' ? '#2ecc71' : 'var(--primary-color)'};">${order.status}</span></p>
                </div>
                <div class="order-card-actions">${updateButtonHTML}</div>
                <div class="update-form" id="update-form-${order.id}">
                    <textarea placeholder="Please describe the updates you need..."></textarea>
                    <button class="neumorphic-btn primary submit-update-btn" data-order-id="${order.id}">Submit Request</button>
                    <p class="update-status-message"></p>
                </div>
            </div>`;
    }

    // --- 5. EVENT HANDLING ---
    function attachEventListeners() {
        DOM.mainContainer.addEventListener('click', async (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            const orderId = button.dataset.orderId;

            if (button.classList.contains('pay-now-btn')) await handlePayNow(button, orderId);
            if (button.classList.contains('request-update-btn')) handleToggleUpdateForm(orderId);
            if (button.classList.contains('submit-update-btn')) await handleSubmitUpdate(button, orderId);
        });
    }

    async function handlePayNow(button, orderId) {
        button.disabled = true;
        button.innerHTML = `<div class="spinner-small"></div>`;
        try {
            const doc = await db.collection('orders').doc(orderId).get();
            if (!doc.exists) throw new Error("Order not found.");

            const orderData = doc.data();
            
            // --- UPDATED to pass the correct total price to checkout ---
            const priceForCheckout = orderData.priceBreakdown?.totalPrice ?? orderData.estimatedPrice;

            const checkoutData = { price: priceForCheckout, orderId, summary: [{ question: 'Template', text: orderData.selectedTemplate }], contact: orderData.contactDetails };
            localStorage.setItem('checkoutData', JSON.stringify(checkoutData));
            window.location.href = 'checkout.html';
        } catch (error) {
            console.error("Pay Now Error:", error);
            alert(`Error preparing for payment: ${error.message}`);
            button.disabled = false;
            button.textContent = 'Pay Now';
        }
    }

    function handleToggleUpdateForm(orderId) {
        const form = document.getElementById(`update-form-${orderId}`);
        if (form) form.style.display = form.style.display === 'block' ? 'none' : 'block';
    }

    async function handleSubmitUpdate(button, orderId) {
        const form = document.getElementById(`update-form-${orderId}`);
        const textarea = form.querySelector('textarea');
        const statusMessage = form.querySelector('.update-status-message');
        const updateText = textarea.value.trim();

        if (updateText.length < 15) {
            statusMessage.textContent = "Please provide a more detailed description.";
            statusMessage.style.color = "var(--danger-color)";
            return;
        }

        button.disabled = true;
        button.textContent = 'Submitting...';

        try {
            await db.collection('update_requests').add({
                orderId: orderId,
                updateRequestText: updateText,
                requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'Pending Review',
                userId: auth.currentUser.uid // Link request to user
            });
            statusMessage.textContent = "Request sent successfully!";
            statusMessage.style.color = "var(--success-color)";
            textarea.disabled = true;
            button.textContent = 'Submitted';
        } catch (error) {
            console.error("Submit Update Error:", error);
            statusMessage.textContent = "An error occurred. Please try again.";
            statusMessage.style.color = "var(--danger-color)";
            button.disabled = false;
            button.textContent = 'Submit Request';
        }
    }

    // --- 6. RUN THE APPLICATION ---
    main();
});