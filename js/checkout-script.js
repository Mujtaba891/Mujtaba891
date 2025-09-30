/**
 * @file Script for the checkout.html page with dynamic API keys and coupon functionality.
 * @author Mujtaba Alam
 * @version 7.0.0 (Dynamic API Key)
 * @description Fetches Razorpay API key from Firestore instead of using a hardcoded
 *              value, enhancing security. Complies with all security rules for payment updates.
 */
'use-strict';

document.addEventListener('DOMContentLoaded', () => {

    // ===================================================================================
    // SECTION 1: INITIALIZATION AND STATE MANAGEMENT
    // ===================================================================================

    let db;

    // Central state object to manage all dynamic data for the checkout process.
    const state = {
        basePrice: 0,
        finalPrice: 0,
        appliedCoupon: null,
        checkoutData: null,
        razorpayApiKey: null,
    };

    // Centralized DOM element references for performance and maintainability.
    const UI = {
        summaryList: document.getElementById('order-summary-list'),
        subtotalPrice: document.getElementById('checkout-subtotal-price'),
        totalPrice: document.getElementById('checkout-total-price'),
        discountDisplay: document.getElementById('discount-display'),
        discountAmount: document.getElementById('checkout-discount-amount'),
        payButton: document.getElementById('rzp-button'),
        couponInput: document.getElementById('coupon-code-input'),
        applyCouponBtn: document.getElementById('apply-coupon-btn'),
        couponStatus: document.getElementById('coupon-status'),
    };

    /**
     * Initializes the Firebase application.
     * @returns {boolean} True if initialization is successful, otherwise false.
     */
    function initializeFirebase() {
        try {
            const firebaseConfig = {
                apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg",
                authDomain: "mujtaba-alam.firebaseapp.com",
                projectId: "mujtaba-alam",
                storageBucket: "mujtaba-alam.appspot.com",
                messagingSenderId: "221609343134",
                appId: "1:221609343134:web:d64123479f43e6bc66638f"
            };
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            return true;
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            alert("A connection error occurred. Please refresh the page and try again.");
            return false;
        }
    }

    // ===================================================================================
    // SECTION 2: DATA FETCHING AND UI RENDERING
    // ===================================================================================

    /**
     * Fetches the Razorpay API Key ID from the 'settings/api_keys' document in Firestore.
     * @returns {Promise<string|null>} The API key or null if not found or on error.
     */
    async function fetchRazorpayApiKey() {
        if (!db) return null;
        try {
            const doc = await db.collection('settings').doc('api_keys').get();
            if (doc.exists && doc.data().razorpayKeyId) {
                return doc.data().razorpayKeyId;
            } else {
                console.error("CRITICAL: Razorpay Key ID not found in Firestore 'settings/api_keys'. Payment cannot proceed.");
                return null;
            }
        } catch (error) {
            console.error("Error fetching Razorpay API key:", error);
            return null;
        }
    }

    /**
     * Retrieves checkout data from localStorage and populates the state.
     * @returns {boolean} True if data is found and valid, otherwise false.
     */
    function getCheckoutDataFromStorage() {
        try {
            const data = localStorage.getItem('checkoutData');
            if (data) {
                state.checkoutData = JSON.parse(data);
                return true;
            }
            return false;
        } catch (e) {
            console.error("Failed to parse checkout data from localStorage:", e);
            return false;
        }
    }

    /**
     * Renders the initial order summary based on checkout data.
     */
    function renderOrderSummary() {
        const { price, summary } = state.checkoutData;
        state.basePrice = price;
        state.finalPrice = price;

        const summaryHTML = summary.map(item => `<div><span>${item.question}</span><strong>${item.text}</strong></div>`).join('');
        UI.summaryList.innerHTML = summaryHTML;

        updatePriceUI();
    }

    /**
     * Updates all price-related elements in the UI based on the current state.
     */
    function updatePriceUI() {
        let discount = 0;
        if (state.appliedCoupon) {
            discount = state.appliedCoupon.type === 'percentage'
                ? (state.basePrice * state.appliedCoupon.value) / 100
                : state.appliedCoupon.value;
        }
        
        state.finalPrice = Math.max(0, state.basePrice - discount);

        const formatCurrency = (amount) => `₹${Math.round(amount).toLocaleString('en-IN')}`;
        UI.subtotalPrice.textContent = formatCurrency(state.basePrice);
        UI.totalPrice.textContent = formatCurrency(state.finalPrice);

        if (discount > 0) {
            UI.discountAmount.textContent = `- ${formatCurrency(discount)}`;
            UI.discountDisplay.style.display = 'flex';
        } else {
            UI.discountDisplay.style.display = 'none';
        }
    }

    /**
     * Displays a message on the page, replacing the checkout form.
     * Used for critical errors or when no data is found.
     */
    function showPageMessage(title, message, buttonText, buttonLink) {
        document.body.innerHTML = `
            <div class="checkout-container neumorphic-outset">
                <h2>${title}</h2>
                <p>${message}</p>
                <a href="${buttonLink}" class="neumorphic-btn">${buttonText}</a>
            </div>`;
    }

    // ===================================================================================
    // SECTION 3: COUPON LOGIC
    // ===================================================================================

    /**
     * Handles the coupon application logic.
     */
    async function handleApplyCoupon() {
        const code = UI.couponInput.value.toUpperCase().trim();
        if (!code) {
            UI.couponStatus.textContent = 'Please enter a coupon code.';
            return;
        }

        UI.applyCouponBtn.disabled = true;
        UI.couponStatus.textContent = 'Validating...';
        UI.couponStatus.className = 'coupon-status';

        try {
            const snapshot = await db.collection('coupons').where('code', '==', code).get();

            if (snapshot.empty) {
                UI.couponStatus.textContent = 'Invalid coupon code.';
                UI.couponStatus.className = 'coupon-status error';
                state.appliedCoupon = null;
            } else {
                const couponData = snapshot.docs[0].data();
                if (couponData.isActive) {
                    state.appliedCoupon = couponData;
                    UI.couponStatus.textContent = `Success! '${couponData.code}' has been applied.`;
                    UI.couponStatus.className = 'coupon-status success';
                    UI.couponInput.disabled = true;
                    UI.applyCouponBtn.textContent = 'Remove';
                } else {
                    UI.couponStatus.textContent = 'This coupon is currently inactive.';
                    UI.couponStatus.className = 'coupon-status error';
                    state.appliedCoupon = null;
                }
            }
        } catch (error) {
            console.error("Error validating coupon:", error);
            UI.couponStatus.textContent = 'Could not validate the coupon. Please try again.';
            UI.couponStatus.className = 'coupon-status error';
        } finally {
            updatePriceUI();
            UI.applyCouponBtn.disabled = false;
        }
    }
    
    /**
     * Handles the coupon removal logic.
     */
    function handleRemoveCoupon() {
        state.appliedCoupon = null;
        updatePriceUI();
        UI.couponStatus.textContent = 'Coupon has been removed.';
        UI.couponStatus.className = 'coupon-status';
        UI.couponInput.disabled = false;
        UI.couponInput.value = '';
        UI.applyCouponBtn.textContent = 'Apply';
    }

    // ===================================================================================
    // SECTION 4: PAYMENT LOGIC
    // ===================================================================================

    /**
     * Updates the order document in Firestore after a successful payment.
     * This function is designed to comply with Firestore security rules.
     * @param {object} paymentResponse - The response object from Razorpay.
     */
    async function updateOrderAfterPayment(paymentResponse) {
        if (!db) return;
        
        const orderId = state.checkoutData.orderId;
        const orderRef = db.collection('orders').doc(orderId);
        
        const updateData = {
            status: 'In Progress',
            paymentDetails: {
                paymentId: paymentResponse.razorpay_payment_id,
                gateway: 'Razorpay',
                paidAt: firebase.firestore.FieldValue.serverTimestamp()
            }
        };

        if (state.appliedCoupon) {
            updateData.finalPrice = state.finalPrice;
            updateData.appliedCoupon = {
                code: state.appliedCoupon.code,
                type: state.appliedCoupon.type,
                value: state.appliedCoupon.value
            };
        }

        try {
            await orderRef.update(updateData);
        } catch (error) {
            console.error(`CRITICAL: Failed to update order ${orderId} after payment. Manual verification needed.`, error);
            // Optionally, inform the user that there was an issue and to contact support.
            alert("Your payment was successful, but there was an issue updating your order status. Please contact support with your payment ID.");
        }
    }

    /**
     * Initializes the Razorpay payment process.
     */
    function initializePayment() {
        UI.payButton.addEventListener('click', () => {
            const data = state.checkoutData;
            const options = {
                key: state.razorpayApiKey,
                amount: state.finalPrice * 100, // Amount in paise
                currency: "INR",
                name: "Mujtaba Alam - Web Services",
                description: `Payment for ${data.summary[0].text}`,
                handler: async function (response) {
                    UI.payButton.disabled = true;
                    UI.payButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                    await updateOrderAfterPayment(response);
                    localStorage.removeItem('checkoutData');
                    showPageMessage(
                        '<i class="fas fa-check-circle" style="color: var(--success-color);"></i> Thank You!',
                        'Your payment was successful and your project is now in progress. You can track its status on the "My Orders" page.',
                        'Back to Home',
                        'index.html'
                    );
                },
                prefill: {
                    name: data.contact.name,
                    email: data.contact.email,
                    contact: data.contact.whatsapp
                },
                notes: {
                    firebase_order_id: data.orderId
                },
                theme: {
                    color: "#007BFF"
                }
            };

            const rzp = new Razorpay(options);
            rzp.on('payment.failed', (response) => {
                alert(`Payment failed: ${response.error.description}`);
            });
            rzp.open();
        });
    }

    // ===================================================================================
    // SECTION 5: MAIN EXECUTION FLOW
    // ===================================================================================

    /**
     * The main function to set up the entire checkout page.
     */
    async function main() {
        if (!initializeFirebase()) {
            UI.payButton.disabled = true;
            return;
        }

        if (!getCheckoutDataFromStorage()) {
            showPageMessage('Oops!', 'No project data found in your session. Please choose a template to begin.', 'Choose a Template', 'templates.html');
            return;
        }

        renderOrderSummary();

        state.razorpayApiKey = await fetchRazorpayApiKey();
        if (state.razorpayApiKey) {
            initializePayment();
        } else {
            UI.payButton.innerHTML = '<i class="fas fa-times-circle"></i> Payments Unavailable';
            UI.payButton.disabled = true;
            alert('The payment gateway is currently unavailable. Please contact support.');
        }

        UI.applyCouponBtn.addEventListener('click', () => {
            state.appliedCoupon ? handleRemoveCoupon() : handleApplyCoupon();
        });
    }

    main(); // Start the application
});