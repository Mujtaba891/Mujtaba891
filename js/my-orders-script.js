/**
 * @file Script for the my-orders.html page.
 * @author Mujtaba Alam
 * @version 1.2.0
 * @description FINAL FIX: Correctly fetches orders with status 'Pending Payment'
 *              to display all unpaid orders, aligning with the new save logic.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    const ordersListContainer = document.getElementById('orders-list-container');
    const loadingPlaceholder = document.getElementById('loading-orders-placeholder');
    let db;

    function initializeFirebase() {
        try {
            const firebaseConfig = { apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg", authDomain: "mujtaba-alam.firebaseapp.com", projectId: "mujtaba-alam", storageBucket: "mujtaba-alam.appspot.com", messagingSenderId: "221609343134", appId: "1:221609343134:web:d64123479f43e6bc66638f" };
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            return true;
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            ordersListContainer.innerHTML = `<div class="neumorphic-outset order-card"><p style="color: red;">Error: Could not connect to the database. Please try again later.</p></div>`;
            return false;
        }
    }

    async function fetchAndDisplayOrders() {
        const orderIds = JSON.parse(localStorage.getItem('myOrders')) || [];

        if (orderIds.length === 0) {
            loadingPlaceholder.innerHTML = `<p>You have no saved orders. <a href="pricing.html">Create a project</a> to see it here!</p>`;
            return;
        }

        loadingPlaceholder.style.display = 'none';
        let ordersFound = 0;

        for (const orderId of orderIds) {
            try {
                const docRef = db.collection('orders').doc(orderId);
                const doc = await docRef.get();

                if (doc.exists) {
                    const orderData = { id: doc.id, ...doc.data() };
                    
                    // --- THE KEY CHANGE IS HERE ---
                    // Since all orders are created with this status, we look for it.
                    if (orderData.status === 'Pending Payment') {
                        createOrderCard(orderData);
                        ordersFound++;
                    }
                } else {
                    console.warn(`Order with ID ${orderId} not found in database.`);
                }
            } catch (error) {
                console.error(`Error fetching order ${orderId}:`, error);
            }
        }
        
        if (ordersFound === 0) {
            ordersListContainer.innerHTML += `<div class="neumorphic-outset order-card"><p>You have no pending orders to pay for. They may have already been paid or processed.</p></div>`;
        }
    }

    function createOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'neumorphic-outset order-card';
        const siteName = order.fullCustomizations?.siteName || 'N/A';
        const price = order.estimatedPrice || 0;

        card.innerHTML = `
            <div class="order-card-info">
                <h3>${order.selectedTemplate}</h3>
                <p><strong>Site Name:</strong> ${siteName}</p>
                <p><strong>Price:</strong> ₹${price.toLocaleString('en-IN')}</p>
                <p><strong>Status:</strong> <span class="status-pending">${order.status}</span></p>
            </div>
            <div class="order-card-actions">
                <button class="neumorphic-btn primary pay-now-btn" data-order-id="${order.id}">Pay Now</button>
            </div>
        `;
        ordersListContainer.appendChild(card);
    }

    async function handlePayNowClick(e) {
        if (!e.target.classList.contains('pay-now-btn')) return;

        const button = e.target;
        const orderId = button.dataset.orderId;
        button.disabled = true;
        button.innerHTML = `<div class="spinner-small"></div> Processing...`;

        try {
            const docRef = db.collection('orders').doc(orderId);
            const doc = await docRef.get();

            if (doc.exists) {
                const orderData = doc.data();

                const checkoutData = {
                    price: orderData.estimatedPrice,
                    orderId: orderId,
                    summary: [{ question: 'Template', text: orderData.selectedTemplate }],
                    contact: orderData.contactDetails
                };
                
                localStorage.setItem('checkoutData', JSON.stringify(checkoutData));
                window.location.href = 'checkout.html';
            } else {
                throw new Error("Order not found. It may have been deleted.");
            }
        } catch (error) {
            console.error("Failed to proceed to payment:", error);
            alert(`Error: ${error.message}`);
            button.disabled = false;
            button.innerHTML = 'Pay Now';
        }
    }

    if (initializeFirebase()) {
        fetchAndDisplayOrders();
        ordersListContainer.addEventListener('click', handlePayNowClick);
    }
});