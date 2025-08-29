/**
 * @file Script for the checkout.html page with coupon functionality.
 * @author Mujtaba Alam
 * @version 6.0.0 (Rule Compliant)
 * @description Updated to comply with new Firestore security rules. Sends 'finalPrice'
 *              on update instead of modifying 'estimatedPrice'.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
    let db;
    const checkoutState = {
        basePrice: 0,
        finalPrice: 0,
        appliedCoupon: null,
        checkoutData: null
    };

    const UIElements = {
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

    function initializeFirebase() {
        try {
            const firebaseConfig = { apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg", authDomain: "mujtaba-alam.firebaseapp.com", projectId: "mujtaba-alam", storageBucket: "mujtaba-alam.appspot.com", messagingSenderId: "221609343134", appId: "1:221609343134:web:d64123479f43e6bc66638f" };
            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            return true;
        } catch (error) {
            console.error("Firebase init failed:", error);
            alert("Connection error. Please try again.");
            return false;
        }
    }

    const formatCurrency = (amount) => `₹${Math.round(amount).toLocaleString('en-IN')}`;
    const getCheckoutData = () => {
        try {
            checkoutState.checkoutData = JSON.parse(localStorage.getItem('checkoutData'));
            return checkoutState.checkoutData;
        } catch (e) {
            return null;
        }
    };

    function renderOrderSummary(data) {
        if (!data || !data.price || !data.summary) return;
        checkoutState.basePrice = data.price;
        checkoutState.finalPrice = data.price;
        UIElements.summaryList.innerHTML = `<div><span>${data.summary[0].question}</span><strong>${data.summary[0].text}</strong></div>`;
        updatePriceUI();
    }

    function updatePriceUI() {
        let discount = 0;
        if (checkoutState.appliedCoupon) {
            if (checkoutState.appliedCoupon.type === 'percentage') {
                discount = (checkoutState.basePrice * checkoutState.appliedCoupon.value) / 100;
            } else {
                discount = checkoutState.appliedCoupon.value;
            }
        }
        
        checkoutState.finalPrice = Math.max(0, checkoutState.basePrice - discount);

        UIElements.subtotalPrice.textContent = formatCurrency(checkoutState.basePrice);
        UIElements.totalPrice.textContent = formatCurrency(checkoutState.finalPrice);

        if (discount > 0) {
            UIElements.discountAmount.textContent = `- ${formatCurrency(discount)}`;
            UIElements.discountDisplay.style.display = 'flex';
        } else {
            UIElements.discountDisplay.style.display = 'none';
        }
    }

    async function handleApplyCoupon() {
        const code = UIElements.couponInput.value.toUpperCase().trim();
        if (!code) { UIElements.couponStatus.textContent = 'Please enter a code.'; return; }

        UIElements.applyCouponBtn.disabled = true;
        UIElements.couponStatus.textContent = 'Validating...';

        try {
            const snapshot = await db.collection('coupons').where('code', '==', code).get();
            if (snapshot.empty) {
                UIElements.couponStatus.textContent = 'Invalid coupon code.';
                UIElements.couponStatus.className = 'coupon-status error';
                checkoutState.appliedCoupon = null;
            } else {
                const couponData = snapshot.docs[0].data();
                if (couponData.isActive) {
                    checkoutState.appliedCoupon = couponData;
                    UIElements.couponStatus.textContent = `Success! '${couponData.code}' applied.`;
                    UIElements.couponStatus.className = 'coupon-status success';
                    UIElements.couponInput.disabled = true;
                    UIElements.applyCouponBtn.textContent = 'Remove';
                } else {
                    UIElements.couponStatus.textContent = 'This coupon is currently inactive.';
                    UIElements.couponStatus.className = 'coupon-status error';
                    checkoutState.appliedCoupon = null;
                }
            }
        } catch (error) {
            console.error("Error validating coupon:", error);
            UIElements.couponStatus.textContent = 'Could not validate coupon. Try again.';
            UIElements.couponStatus.className = 'coupon-status error';
        }
        updatePriceUI();
        UIElements.applyCouponBtn.disabled = false;
    }
    
    function handleRemoveCoupon() {
        checkoutState.appliedCoupon = null;
        updatePriceUI();
        UIElements.couponStatus.textContent = 'Coupon removed.';
        UIElements.couponStatus.className = 'coupon-status';
        UIElements.couponInput.disabled = false;
        UIElements.couponInput.value = '';
        UIElements.applyCouponBtn.textContent = 'Apply';
    }

    // ===================================================================
    // --- THIS IS THE CRITICAL UPDATE FOR THE NEW RULES ---
    // ===================================================================
        async function updateOrderAfterPayment(paymentResponse) {
        if (!db) return;
        const orderId = checkoutState.checkoutData.orderId;
        const orderRef = db.collection('orders').doc(orderId);
        
        const updateData = {
            status: 'In Progress',
            paymentDetails: {
                paymentId: paymentResponse.razorpay_payment_id,
                gateway: 'Razorpay',
                paidAt: firebase.firestore.FieldValue.serverTimestamp()
            }
        };

        // If a coupon was used, add the final price and coupon details.
        // This is allowed by your security rules and is the critical part of the fix.
        if (checkoutState.appliedCoupon) {
            updateData.finalPrice = checkoutState.finalPrice; // The discounted price
            updateData.appliedCoupon = { // The coupon details
                code: checkoutState.appliedCoupon.code,
                type: checkoutState.appliedCoupon.type,
                value: checkoutState.appliedCoupon.value
            };
        }

        try {
            // This update will now succeed because it follows the security rules.
            await orderRef.update(updateData);
        } catch (error) {
            console.error(`Critical: Failed to update order ${orderId} after payment.`, error);
        }
    }

    function initializePayment() {
        UIElements.payButton.addEventListener('click', () => {
            const data = checkoutState.checkoutData;
            const options = {
                key: 'rzp_test_Elr0SJAHeTD4Jj',
                amount: checkoutState.finalPrice * 100,
                currency: "INR",
                name: "Mujtaba Alam - Web Services",
                description: `Payment for ${data.summary[0].text}`,
                handler: function (response) {
                    updateOrderAfterPayment(response).then(() => {
                        localStorage.removeItem('checkoutData');
                        let myOrders = JSON.parse(localStorage.getItem('myOrders')) || [];
                        myOrders = myOrders.filter(id => id !== data.orderId);
                        localStorage.setItem('myOrders', JSON.stringify(myOrders));
                        document.body.innerHTML = `<div class="checkout-container neumorphic-outset"><h2><i class="fas fa-check-circle" style="color: var(--success-color);"></i> Thank You!</h2><p>Your payment was successful. The project is now In Progress. You can view its status on the My Orders page.</p><a href="index.html" class="neumorphic-btn">Back to Home</a></div>`;
                    });
                },
                prefill: { name: data.contact.name, email: data.contact.email, contact: data.contact.whatsapp },
                notes: { firebase_order_id: data.orderId },
                theme: { color: "#007BFF" }
            };

            const rzp1 = new Razorpay(options);
            rzp1.on('payment.failed', (e) => { alert(`Payment failed: ${e.error.description}`); });
            rzp1.open();
        });
    }

    function setupCouponButton() {
        UIElements.applyCouponBtn.addEventListener('click', () => {
            checkoutState.appliedCoupon ? handleRemoveCoupon() : handleApplyCoupon();
        });
    }

    function setupCheckoutPage() {
        if (!initializeFirebase()) {
            if (UIElements.payButton) UIElements.payButton.disabled = true;
            return;
        }

        if (getCheckoutData()) {
            renderOrderSummary(checkoutState.checkoutData);
            initializePayment();
            setupCouponButton();
        } else {
            document.body.innerHTML = `<div class="checkout-container neumorphic-outset"><h2>Oops!</h2><p>No project data found in your session.</p><a href="templates.html" class="neumorphic-btn">Choose a Template</a></div>`;
        }
    }

    setupCheckoutPage();
});