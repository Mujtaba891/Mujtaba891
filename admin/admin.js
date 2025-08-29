/**
 * @file Main script for the full admin dashboard.
 * @author Mujtaba Alam
 * @version 7.0.0 (Feature Reversion)
 * @description Stable version with invoice functionality removed. All core features working.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    const firebaseConfig = { 
        apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg", 
        authDomain: "mujtaba-alam.firebaseapp.com", 
        projectId: "mujtaba-alam", 
        storageBucket: "mujtaba-alam.appspot.com", 
        messagingSenderId: "221609343134", 
        appId: "1:221609343134:web:d64123479f43e6bc66638f" 
    };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    
    const auth = firebase.auth();
    const db = firebase.firestore();

    const appState = { orders: [], messages: [], clients: [], coupons: [], revenueChart: null };

    const formatCurrency = (amount) => `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatDate = (timestamp) => timestamp ? new Date(timestamp.seconds * 1000).toLocaleDateString('en-IN') : 'N/A';

    auth.onAuthStateChanged(user => {
        const loadingSpinner = document.getElementById('loading-spinner');
        const dashboard = document.getElementById('admin-dashboard');
        if (user) {
            loadingSpinner.style.display = 'none';
            dashboard.style.display = 'flex';
            initializeDashboard(user);
        } else {
            window.location.href = '../login.html';
        }
    });

    function initializeDashboard(user) {
        document.getElementById('admin-welcome-msg').textContent = `Welcome, ${user.email.split('@')[0]}`;
        setupNavigation();
        setupEventListeners();
        fetchAllData();
    }

    function setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        const pageSections = document.querySelectorAll('.page-section');
        const pageTitle = document.getElementById('page-title');
        const sidebar = document.getElementById('admin-sidebar');
        const overlay = document.getElementById('mobile-menu-overlay');

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetPageId = link.dataset.page;
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                pageSections.forEach(section => section.classList.toggle('active', section.id === targetPageId));
                pageTitle.textContent = link.textContent.trim();
                if (window.innerWidth <= 992) {
                    sidebar.classList.remove('active');
                    overlay.classList.remove('active');
                }
            });
        });
    }

    function setupEventListeners() {
        const menuToggle = document.getElementById('menu-toggle-btn');
        const sidebar = document.getElementById('admin-sidebar');
        const overlay = document.getElementById('mobile-menu-overlay');
        
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });

        document.getElementById('create-coupon-form').addEventListener('submit', handleCreateCoupon);
        document.getElementById('filter-status').addEventListener('change', populateOrdersTable);
        document.getElementById('search-orders').addEventListener('input', populateOrdersTable);
        document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
        
        const mainContent = document.querySelector('.admin-main-content');
        mainContent.addEventListener('click', e => {
            const target = e.target;
            const viewBtn = target.closest('.view-btn');
            const couponActionBtn = target.closest('.deactivate-coupon-btn, .activate-coupon-btn');

            if (viewBtn) {
                showOrderModal(appState.orders.find(o => o.id === viewBtn.dataset.id));
            }
            if (couponActionBtn) {
                handleCouponStatusToggle(couponActionBtn.dataset.id, couponActionBtn.classList.contains('activate-coupon-btn'));
            }
        });
        mainContent.addEventListener('change', e => {
            if (e.target.classList.contains('status-select')) {
                handleStatusChange(e.target.dataset.id, e.target.value);
            }
        });
    }

    function fetchAllData() {
        db.collection('orders').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
            appState.orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            processAllData();
        }, err => console.error("Error fetching orders: ", err));

        db.collection('contact_messages').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
            appState.messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateMessagesTable();
        }, err => console.error("Error fetching messages: ", err));

        db.collection('coupons').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
            appState.coupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateCouponsTable();
        }, err => console.error("Error fetching coupons: ", err));
    }

    function processAllData() {
        calculateStats();
        initializeChart();
        populateOrdersTable();
        processAndPopulateClients();
    }

    function calculateStats() {
        let totalRevenue = 0, pendingOrders = 0, completedProjects = 0;
        appState.orders.forEach(order => {
            if (order.status === 'Completed') {
                const revenueFromOrder = order.finalPrice !== undefined ? order.finalPrice : order.estimatedPrice;
                if (typeof revenueFromOrder === 'number') {
                    totalRevenue += revenueFromOrder;
                }
                completedProjects++;
            }
            if (['Pending Payment', 'In Progress', 'Awaiting User Payment'].includes(order.status)) {
                pendingOrders++;
            }
        });
        document.getElementById('total-revenue').textContent = formatCurrency(totalRevenue);
        document.getElementById('pending-orders').textContent = pendingOrders;
        document.getElementById('completed-projects').textContent = completedProjects;
    }

    function initializeChart() {
        const ctx = document.getElementById('revenue-chart').getContext('2d');
        const last30Days = new Map();
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            last30Days.set(d.toLocaleDateString('en-IN'), 0);
        }

        appState.orders.forEach(order => {
            if (order.status === 'Completed' && order.createdAt) {
                const revenueFromOrder = order.finalPrice !== undefined ? order.finalPrice : order.estimatedPrice;
                if (typeof revenueFromOrder === 'number') {
                    const date = formatDate(order.createdAt);
                    if (last30Days.has(date)) {
                        last30Days.set(date, last30Days.get(date) + revenueFromOrder);
                    }
                }
            }
        });
        
        if (appState.revenueChart) appState.revenueChart.destroy();
        appState.revenueChart = new Chart(ctx, {
            type: 'line',
            data: { labels: Array.from(last30Days.keys()), datasets: [{ label: 'Revenue', data: Array.from(last30Days.values()), borderColor: 'var(--primary-color)', backgroundColor: 'rgba(0, 123, 255, 0.1)', tension: 0.2, fill: true }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function populateOrdersTable() {
        const tableBody = document.getElementById('all-orders-table-body');
        const filter = document.getElementById('filter-status').value;
        const search = document.getElementById('search-orders').value.toLowerCase();
        
        tableBody.innerHTML = '';
        const filteredOrders = appState.orders.filter(order => (filter === 'all' || order.status === filter) && (order.contactDetails.name.toLowerCase().includes(search) || order.contactDetails.email.toLowerCase().includes(search)));

        if (filteredOrders.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No orders match criteria.</td></tr>`; return;
        }

        filteredOrders.forEach(order => {
            const row = document.createElement('tr');
            const statusOptions = ['Pending Payment', 'Awaiting User Payment', 'In Progress', 'Completed', 'Cancelled'];
            const statusDropdown = `<select class="status-select" data-id="${order.id}">${statusOptions.map(opt => `<option value="${opt}" ${order.status === opt ? 'selected' : ''}>${opt}</option>`).join('')}</select>`;
            const displayPrice = order.finalPrice !== undefined ? order.finalPrice : order.estimatedPrice;
            row.innerHTML = `
                <td>${order.contactDetails.name}</td>
                <td>${order.selectedTemplate || 'N/A'}</td>
                <td>${formatCurrency(displayPrice)}</td>
                <td>${statusDropdown}</td>
                <td>${formatDate(order.createdAt)}</td>
                <td class="actions-cell">
                    <button class="action-btn view-btn" data-id="${order.id}" title="View Details"><i class="fas fa-eye"></i></button>
                </td>`;
            tableBody.appendChild(row);
        });
    }

    function populateCouponsTable() {
        const tableBody = document.getElementById('coupons-table-body');
        tableBody.innerHTML = '';
        if (appState.coupons.length === 0) { tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No coupons created.</td></tr>`; return; }
        appState.coupons.forEach(coupon => {
            const row = document.createElement('tr');
            const valueDisplay = coupon.type === 'percentage' ? `${coupon.value}%` : formatCurrency(coupon.value);
            const statusDisplay = coupon.isActive ? '<span style="color:var(--success-color);">Active</span>' : '<span style="color:var(--danger-color);">Inactive</span>';
            const actionButton = `<button class="neumorphic-btn ${coupon.isActive ? 'deactivate-coupon-btn' : 'activate-coupon-btn'}" style="padding: 5px 10px; font-size: 0.8rem;" data-id="${coupon.id}">${coupon.isActive ? 'Deactivate' : 'Activate'}</button>`;
            row.innerHTML = `<td>${coupon.code}</td><td>${coupon.type}</td><td>${valueDisplay}</td><td>${statusDisplay}</td><td>${actionButton}</td>`;
            tableBody.appendChild(row);
        });
    }

    function processAndPopulateClients() {
        const clientsMap = new Map();
        appState.orders.forEach(order => {
            const email = order.contactDetails.email;
            if (!clientsMap.has(email)) { clientsMap.set(email, { name: order.contactDetails.name, whatsapp: order.contactDetails.whatsapp, orderCount: 0 }); }
            clientsMap.get(email).orderCount++;
        });
        const tableBody = document.getElementById('clients-table-body');
        tableBody.innerHTML = '';
        clientsMap.forEach((client, email) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${client.name}</td><td>${email}</td><td>${client.whatsapp}</td><td>${client.orderCount}</td>`;
            tableBody.appendChild(row);
        });
    }

    function populateMessagesTable() {
        const tableBody = document.getElementById('messages-table-body');
        tableBody.innerHTML = '';
        if (appState.messages.length === 0) { tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No messages.</td></tr>`; return; }
        appState.messages.forEach(msg => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${msg.name}</td><td>${msg.email}</td><td class="message-cell">${msg.message}</td><td>${formatDate(msg.timestamp)}</td>`;
            tableBody.appendChild(row);
        });
    }

    async function handleStatusChange(orderId, newStatus) { try { await db.collection('orders').doc(orderId).update({ status: newStatus }); } catch (error) { console.error("Error updating status: ", error); alert("Failed to update status."); } }
    async function handleCreateCoupon(e) { e.preventDefault(); const form = e.target; const couponData = { code: form.elements['coupon-code'].value.toUpperCase().trim(), type: form.elements['discount-type'].value, value: parseFloat(form.elements['coupon-value'].value), isActive: true, createdAt: firebase.firestore.FieldValue.serverTimestamp() }; const statusEl = document.getElementById('coupon-form-status'); if (!couponData.code || isNaN(couponData.value)) { statusEl.textContent = "Please fill fields correctly."; statusEl.className = 'form-status error'; return; } try { await db.collection('coupons').add(couponData); statusEl.textContent = "Coupon created!"; statusEl.className = 'form-status success'; form.reset(); } catch (error) { console.error("Error creating coupon: ", error); statusEl.textContent = "Error creating coupon."; statusEl.className = 'form-status error'; } setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'form-status'; }, 4000); }
    async function handleCouponStatusToggle(id, shouldBeActive) { try { await db.collection('coupons').doc(id).update({ isActive: shouldBeActive }); } catch (error) { console.error("Error toggling coupon status: ", error); alert("Failed to update coupon status."); } }

    function showOrderModal(order) {
        if (!order) return;
        const modal = document.getElementById('order-modal');
        document.getElementById('modal-customer-name').textContent = `Order for ${order.contactDetails.name}`;
        document.getElementById('modal-template-name').textContent = order.selectedTemplate || 'N/A';
        document.getElementById('modal-contact-email').textContent = order.contactDetails.email;
        document.getElementById('modal-contact-whatsapp').textContent = order.contactDetails.whatsapp;
        
        const subtotalEl = document.getElementById('modal-subtotal-price');
        const totalPriceEl = document.getElementById('modal-total-price');
        const priceHrEl = document.getElementById('modal-price-hr');
        const couponLineEl = document.getElementById('modal-coupon-line');
        const couponCodeEl = document.getElementById('modal-coupon-code');

        couponLineEl.style.display = 'none';
        priceHrEl.style.display = 'none';

        subtotalEl.textContent = formatCurrency(order.estimatedPrice);
        const finalAmount = order.finalPrice !== undefined ? order.finalPrice : order.estimatedPrice;
        totalPriceEl.textContent = formatCurrency(finalAmount);

        if (order.appliedCoupon && order.appliedCoupon.code) {
            couponCodeEl.textContent = order.appliedCoupon.code;
            couponLineEl.style.display = 'block';
            priceHrEl.style.display = 'block';
        }

        const customizationsDiv = document.getElementById('modal-customizations');
        customizationsDiv.innerHTML = '';
        const customizations = order.fullCustomizations || {};
        const customizationEntries = Object.entries(customizations).filter(([key, value]) => key !== 'contact' && value && (typeof value !== 'object' || Object.keys(value).length > 0) && (!Array.isArray(value) || value.length > 0));
        
        if (customizationEntries.length > 0) {
            customizationsDiv.innerHTML = "<h4>Customizations</h4>" + customizationEntries.map(([key, value]) => {
                const friendlyKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                return `<div><strong>${friendlyKey}:</strong><br><span>${Array.isArray(value) ? value.join(', ') : value}</span></div>`;
            }).join('');
        } else {
            customizationsDiv.innerHTML = '<h4>Customizations</h4><span>No customizations specified.</span>';
        }

        const paymentDiv = document.getElementById('modal-payment-details');
        if (order.paymentDetails && order.paymentDetails.paymentId) {
            paymentDiv.innerHTML = `<h4>Payment Details</h4><p><i class="fas fa-check-circle" style="color: var(--success-color);"></i> <strong>Status:</strong> Paid</p><p><i class="fas fa-id-card"></i> <strong>Payment ID:</strong> ${order.paymentDetails.paymentId}</p><p><i class="far fa-calendar-alt"></i> <strong>Paid At:</strong> ${formatDate(order.paymentDetails.paidAt)}</p>`;
        } else {
            paymentDiv.innerHTML = `<h4>Payment Details</h4><p><i class="fas fa-hourglass-half" style="color: var(--warning-color);"></i> <strong>Status:</strong> Payment not yet completed.</p>`;
        }

        modal.style.display = 'flex';
        modal.querySelector('.close-button').onclick = () => { modal.style.display = 'none'; };
        window.onclick = (event) => { if (event.target === modal) { modal.style.display = "none"; } };
    }

});