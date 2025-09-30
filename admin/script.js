/**
 * @file Definitive, Fully Functional Admin Dashboard Script
 * @author Mujtaba Alam (Professionally Architected)
 * @version 13.0.0 (AI Template Management)
 * @description Added a section to view and manage user-generated AI templates,
 *              including preview and delete functionality. All previous features are retained.
 */
'use strict';

(function() {

    // ===================================================================================
    // SECTION 1: APPLICATION INITIALIZATION & CONFIGURATION
    // ===================================================================================

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
    const auth = firebase.auth();
    const db = firebase.firestore();

    const appState = {
        orders: [], messages: [], clients: new Map(), coupons: [], updateRequests: [], aiTemplates: [],
        revenueChart: null, currentUser: null, currentOrderInModal: null
    };

    const DOM = {
        // Core App
        loadingSpinner: document.getElementById('loading-spinner'),
        dashboardContainer: document.getElementById('admin-dashboard'),
        mainContent: document.querySelector('.admin-main-content'),
        // Navigation & Header
        sidebar: document.getElementById('admin-sidebar'),
        mobileOverlay: document.getElementById('mobile-menu-overlay'),
        pageTitle: document.getElementById('page-title'),
        navLinks: document.querySelectorAll('.nav-link'),
        pageSections: document.querySelectorAll('.page-section'),
        adminWelcomeMsg: document.getElementById('admin-welcome-msg'),
        logoutBtn: document.getElementById('logout-btn'),
        menuToggleBtn: document.getElementById('menu-toggle-btn'),
        // Tables & Filters
        allOrdersTableBody: document.getElementById('all-orders-table-body'),
        updateRequestsTableBody: document.getElementById('update-requests-table-body'),
        couponsTableBody: document.getElementById('coupons-table-body'),
        clientsTableBody: document.getElementById('clients-table-body'),
        messagesTableBody: document.getElementById('messages-table-body'),
        aiTemplatesTableBody: document.getElementById('ai-templates-table-body'),
        filterStatusSelect: document.getElementById('filter-status'),
        searchOrdersInput: document.getElementById('search-orders'),
        // Order Modal
        orderModal: document.getElementById('order-modal'),
        modalCustomerName: document.getElementById('modal-customer-name'),
        modalTemplateName: document.getElementById('modal-template-name'),
        modalContactEmail: document.getElementById('modal-contact-email'),
        modalContactWhatsapp: document.getElementById('modal-contact-whatsapp'),
        modalSubtotalPrice: document.getElementById('modal-subtotal-price'),
        modalTotalPrice: document.getElementById('modal-total-price'),
        modalCouponLine: document.getElementById('modal-coupon-line'),
        modalCouponCode: document.getElementById('modal-coupon-code'),
        modalPriceHr: document.getElementById('modal-price-hr'),
        modalCustomizations: document.getElementById('modal-customizations'),
        modalPaymentDetails: document.getElementById('modal-payment-details'),
        modalCloseBtn: document.querySelector('#order-modal .close-button'),
        // Forms
        createCouponForm: document.getElementById('create-coupon-form'),
        couponFormStatus: document.getElementById('coupon-form-status'),
        settingsForm: document.getElementById('settings-form'),
        razorpayKeyInput: document.getElementById('razorpay-key-id'),
        geminiApiKeyInput: document.getElementById('gemini-api-key'),
        settingsFormStatus: document.getElementById('settings-form-status'),
        // Invoice Elements
        invoiceContainer: document.getElementById('invoice-container-for-render'),
        invoiceContentForRender: document.getElementById('invoice-content-render'),
        downloadPdfBtn: document.getElementById('download-pdf-btn'),
        downloadJpgBtn: document.getElementById('download-jpg-btn'),
    };

    // ===================================================================================
    // SECTION 2: CORE APPLICATION LOGIC (AUTH, ROUTING, INIT)
    // ===================================================================================

    document.addEventListener('DOMContentLoaded', () => {
        auth.onAuthStateChanged(handleAuthStateChange);
        window.addEventListener('hashchange', handleRouteChange);
    });

    function handleAuthStateChange(user) {
        if (user) {
            appState.currentUser = user;
            initializeDashboard();
        } else {
            window.location.href = '../login.html';
        }
    }

    function initializeDashboard() {
        DOM.loadingSpinner.style.display = 'none';
        DOM.dashboardContainer.style.display = 'flex';
        const userFirstName = appState.currentUser.email.split('@')[0];
        DOM.adminWelcomeMsg.textContent = `Welcome, ${userFirstName}`;
        setupEventListeners();
        fetchAllData();
        handleRouteChange();
    }

    function setupEventListeners() {
        DOM.menuToggleBtn.addEventListener('click', toggleMobileMenu);
        DOM.mobileOverlay.addEventListener('click', toggleMobileMenu);
        DOM.navLinks.forEach(link => {
            link.addEventListener('click', event => {
                event.preventDefault();
                window.location.hash = link.dataset.page;
                if (window.innerWidth <= 992) toggleMobileMenu();
            });
        });
        DOM.logoutBtn.addEventListener('click', () => auth.signOut());
        if (DOM.createCouponForm) DOM.createCouponForm.addEventListener('submit', handleCreateCoupon);
        if (DOM.settingsForm) DOM.settingsForm.addEventListener('submit', handleSaveSettings);
        if (DOM.filterStatusSelect) DOM.filterStatusSelect.addEventListener('change', populateOrdersTable);
        if (DOM.searchOrdersInput) DOM.searchOrdersInput.addEventListener('input', populateOrdersTable);
        DOM.mainContent.addEventListener('click', handleMainContentClicks);
        DOM.mainContent.addEventListener('change', handleMainContentChanges);
        DOM.downloadPdfBtn.addEventListener('click', () => downloadInvoice('pdf'));
        DOM.downloadJpgBtn.addEventListener('click', () => downloadInvoice('jpg'));
        DOM.modalCloseBtn.addEventListener('click', closeOrderModal);
        window.addEventListener('click', (event) => {
            if (event.target === DOM.orderModal) closeOrderModal();
        });
    }

    function handleRouteChange() {
        const hash = window.location.hash.slice(1) || 'dashboard-page';
        const pageId = hash.split('?')[0];
        DOM.pageSections.forEach(section => {
            section.classList.toggle('active', section.id === pageId);
        });
        updateActiveNavLink(pageId);
    }

    function updateActiveNavLink(currentPageId) {
        let pageTitleFound = false;
        DOM.navLinks.forEach(link => {
            const isLinkActive = link.dataset.page === currentPageId;
            link.classList.toggle('active', isLinkActive);
            if (isLinkActive) {
                DOM.pageTitle.textContent = link.textContent.trim();
                pageTitleFound = true;
            }
        });
        if (!pageTitleFound) DOM.pageTitle.textContent = 'Dashboard Overview';
    }

    function toggleMobileMenu() {
        DOM.sidebar.classList.toggle('active');
        DOM.mobileOverlay.classList.toggle('active');
    }

    // ===================================================================================
    // SECTION 4: DATA FETCHING & PROCESSING
    // ===================================================================================

    function fetchAllData() {
        fetchCollection('orders', 'createdAt', 'desc', data => { appState.orders = data; processOrderData(); });
        fetchCollection('contact_messages', 'timestamp', 'desc', data => { appState.messages = data; populateMessagesTable(); });
        fetchCollection('coupons', 'createdAt', 'desc', data => { appState.coupons = data; populateCouponsTable(); });
        fetchCollection('update_requests', 'requestedAt', 'desc', data => { appState.updateRequests = data; populateUpdateRequestsTable(); });
        fetchCollection('ai_templates', 'createdAt', 'desc', data => { appState.aiTemplates = data; populateAiTemplatesTable(); });
        loadSettings();
    }

    async function loadSettings() {
        if (!DOM.settingsForm) return;
        try {
            const doc = await db.collection('settings').doc('api_keys').get();
            if (doc.exists) {
                const data = doc.data();
                DOM.razorpayKeyInput.value = data.razorpayKeyId || '';
                DOM.geminiApiKeyInput.value = data.geminiApiKey || '';
            }
        } catch (error) {
            console.error("Error loading settings:", error);
            updateFormStatus(DOM.settingsFormStatus, 'Could not load settings.', 'error');
        }
    }

    function fetchCollection(name, orderByField, orderDir, callback) {
        db.collection(name).orderBy(orderByField, orderDir).onSnapshot(
            snapshot => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
            error => console.error(`Error fetching ${name}:`, error)
        );
    }

    function processOrderData() {
        calculateStats();
        initializeChart();
        populateOrdersTable();
        processAndPopulateClients();
    }

    function calculateStats() {
        let totalRevenue = 0, pendingOrders = 0, completedProjects = 0;
        appState.orders.forEach(order => {
            if (order.status === 'Completed') {
                const price = order.finalPrice ?? order.priceBreakdown?.totalPrice ?? order.estimatedPrice;
                if (typeof price === 'number') totalRevenue += price;
                completedProjects++;
            }
            if (['Pending Payment', 'In Progress', 'Awaiting User Payment'].includes(order.status)) pendingOrders++;
        });
        document.getElementById('total-revenue').textContent = formatCurrency(totalRevenue);
        document.getElementById('pending-orders').textContent = pendingOrders;
        document.getElementById('completed-projects').textContent = completedProjects;
    }

    function processAndPopulateClients() {
        appState.clients.clear();
        appState.orders.forEach(order => {
            const email = order.contactDetails?.email;
            if(email && !appState.clients.has(email)) {
                appState.clients.set(email, { name: order.contactDetails.name, whatsapp: order.contactDetails.whatsapp, orderCount: 0, email: email });
            }
            if(email) appState.clients.get(email).orderCount++;
        });
        populateClientsTable();
    }

    function initializeChart() {
        const dailyRevenue = new Map();
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dailyRevenue.set(date.toLocaleDateString('en-IN'), 0);
        }
        appState.orders.forEach(order => {
            if (order.status === 'Completed' && order.createdAt) {
                const price = order.finalPrice ?? order.priceBreakdown?.totalPrice ?? order.estimatedPrice;
                const orderDate = formatDate(order.createdAt);
                if (typeof price === 'number' && dailyRevenue.has(orderDate)) {
                    dailyRevenue.set(orderDate, dailyRevenue.get(orderDate) + price);
                }
            }
        });
        if (appState.revenueChart) appState.revenueChart.destroy();
        const ctx = document.getElementById('revenue-chart').getContext('2d');
        appState.revenueChart = new Chart(ctx, {
            type: 'line', data: { labels: Array.from(dailyRevenue.keys()), datasets: [{ label: 'Revenue', data: Array.from(dailyRevenue.values()), borderColor: 'var(--primary-color)', backgroundColor: 'rgba(0, 123, 255, 0.1)', tension: 0.2, fill: true }], },
            options: { responsive: true, maintainAspectRatio: false },
        });
    }

    // ===================================================================================
    // SECTION 6: UI RENDERING (TABLES)
    // ===================================================================================

    function populateOrdersTable() {
        const filter = DOM.filterStatusSelect.value;
        const search = DOM.searchOrdersInput.value.toLowerCase();
        const filteredOrders = appState.orders.filter(o => (filter === 'all' || o.status === filter) && (o.contactDetails.name.toLowerCase().includes(search) || (o.selectedTemplate || '').toLowerCase().includes(search)));
        renderTable(DOM.allOrdersTableBody, filteredOrders, 6, "No orders match criteria.", o => {
            const price = o.finalPrice ?? o.priceBreakdown?.totalPrice ?? o.estimatedPrice ?? 0;
            return `<td>${escapeHTML(o.contactDetails.name)}</td><td>${escapeHTML(o.selectedTemplate||'N/A')}</td><td>${formatCurrency(price)}</td><td>${createStatusDropdown('order-status-select',o.id,o.status,['Pending Payment','In Progress','Completed','Cancelled','Awaiting User Payment'])}</td><td>${formatDate(o.createdAt)}</td><td class="actions-cell"><button class="action-btn view-btn" data-id="${o.id}" title="View Details"><i class="fas fa-eye"></i></button></td>`;
        });
    }

    function populateUpdateRequestsTable() {
        renderTable(DOM.updateRequestsTableBody, appState.updateRequests, 4, "No update requests found.", req => `<td>${formatDate(req.requestedAt)}</td><td>${escapeHTML(req.orderId)}</td><td class="message-cell">${escapeHTML(req.updateRequestText)}</td><td>${createStatusDropdown('update-status-select', req.id, req.status, ['Pending Review', 'In Progress', 'Completed', 'Rejected'])}</td>`);
    }

    function populateCouponsTable() {
        renderTable(DOM.couponsTableBody, appState.coupons, 5, "No coupons created.", c => {
            const val = c.type === 'percentage' ? `${c.value}%` : formatCurrency(c.value);
            const status = c.isActive ? `<span style="color:var(--success-color);">Active</span>` : `<span style="color:var(--danger-color);">Inactive</span>`;
            const btn = `<button class="neumorphic-btn ${c.isActive ? "deactivate-coupon-btn":"activate-coupon-btn"}" data-id="${c.id}">${c.isActive ? "Deactivate" : "Activate"}</button>`;
            return `<td>${escapeHTML(c.code)}</td><td>${escapeHTML(c.type)}</td><td>${val}</td><td>${status}</td><td>${btn}</td>`;
        });
    }

    function populateClientsTable() {
        renderTable(DOM.clientsTableBody, Array.from(appState.clients.values()), 4, "No clients found.", c => `<td>${escapeHTML(c.name)}</td><td>${escapeHTML(c.email)}</td><td>${escapeHTML(c.whatsapp)}</td><td>${c.orderCount}</td>`);
    }

    function populateMessagesTable() {
        renderTable(DOM.messagesTableBody, appState.messages, 4, "No messages.", m => `<td>${escapeHTML(m.name)}</td><td>${escapeHTML(m.email)}</td><td class="message-cell">${escapeHTML(m.message)}</td><td>${formatDate(m.timestamp)}</td>`);
    }


    function populateAiTemplatesTable() {
        renderTable(DOM.aiTemplatesTableBody, appState.aiTemplates, 4, "No AI templates have been generated yet.", template => `
            <td>${escapeHTML(template.name)}</td>
            <td>${escapeHTML(template.userEmail)}</td>
            <td>${formatDate(template.createdAt)}</td>
            <td class="actions-cell">
                <a href="preview.html?id=${template.id}" target="_blank" class="action-btn" title="Preview"><i class="fas fa-eye"></i></a>
                <button class="action-btn delete-ai-template-btn" data-id="${template.id}" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
        `);
    }

    // ===================================================================================
    // SECTION 7: EVENT HANDLERS
    // ===================================================================================

    function handleMainContentClicks(e) {
        const viewBtn = e.target.closest('.view-btn');
        if (viewBtn) showOrderModal(appState.orders.find(o => o.id === viewBtn.dataset.id));
        
        const couponActionBtn = e.target.closest('.deactivate-coupon-btn, .activate-coupon-btn');
        if (couponActionBtn) handleCouponStatusToggle(couponActionBtn.dataset.id, couponActionBtn.classList.contains('activate-coupon-btn'));
        
        const deleteAiBtn = e.target.closest('.delete-ai-template-btn');
        if (deleteAiBtn) {
            if (confirm('Are you sure you want to permanently delete this AI template?')) {
                handleDeleteAiTemplate(deleteAiBtn.dataset.id);
            }
        }
    }

    function handleMainContentChanges(e) {
        if (e.target.classList.contains('order-status-select')) handleStatusChange('orders', e.target.dataset.id, e.target.value);
        if (e.target.classList.contains('update-status-select')) handleStatusChange('update_requests', e.target.dataset.id, e.target.value);
    }
    
    async function handleDeleteAiTemplate(id) {
        try {
            await db.collection('ai_templates').doc(id).delete();
        } catch (error) {
            console.error("Error deleting AI template:", error);
            alert("Failed to delete the template.");
        }
    }

    async function handleCreateCoupon(e) {
        e.preventDefault();
        const form = e.target;
        const coupon = { code: form.elements["coupon-code"].value.toUpperCase().trim(), type: form.elements["discount-type"].value, value: parseFloat(form.elements["coupon-value"].value), isActive: true, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (!coupon.code || isNaN(coupon.value) || coupon.value <= 0) return updateFormStatus(DOM.couponFormStatus, "Please fill all fields correctly.", "error");
        try {
            await db.collection("coupons").add(coupon);
            updateFormStatus(DOM.couponFormStatus, "Coupon created successfully!", "success");
            form.reset();
        } catch (error) {
            console.error("Error creating coupon: ", error);
            updateFormStatus(DOM.couponFormStatus, "Error creating coupon.", "error");
        }
    }

    async function handleSaveSettings(e) {
        e.preventDefault();
        const razorpayKey = DOM.razorpayKeyInput.value.trim();
        const geminiKey = DOM.geminiApiKeyInput.value.trim();
        if (!razorpayKey || !geminiKey) return updateFormStatus(DOM.settingsFormStatus, 'Both API Keys are required.', 'error');
        try {
            await db.collection('settings').doc('api_keys').set({ razorpayKeyId: razorpayKey, geminiApiKey: geminiKey }, { merge: true });
            updateFormStatus(DOM.settingsFormStatus, 'Settings saved successfully!', 'success');
        } catch (error) {
            console.error("Error saving settings:", error);
            updateFormStatus(DOM.settingsFormStatus, 'Failed to save settings.', 'error');
        }
    }

    async function handleStatusChange(collection, docId, newStatus) {
        try {
            await db.collection(collection).doc(docId).update({ status: newStatus });
        } catch (error) {
            console.error(`Error updating status for ${docId} in ${collection}:`, error);
            alert("Failed to update status.");
        }
    }

    async function handleCouponStatusToggle(id, shouldBeActive) {
        try {
            await db.collection("coupons").doc(id).update({ isActive: shouldBeActive });
        } catch (error) {
            console.error("Error toggling coupon status:", error);
            alert("Failed to update coupon status.");
        }
    }

    // ===================================================================================
    // SECTION 8: MODAL & INVOICE LOGIC
    // ===================================================================================
    
    function showOrderModal(order) {
        if (!order) return;
        appState.currentOrderInModal = order;
        DOM.modalCustomerName.textContent = `Order for ${order.contactDetails.name}`;
        DOM.modalContactEmail.textContent = order.contactDetails.email || 'N/A';
        DOM.modalContactWhatsapp.textContent = order.contactDetails.whatsapp || 'N/A';
        const subtotal = order.priceBreakdown?.basePrice ?? order.estimatedPrice ?? 0;
        const finalAmount = order.finalPrice ?? order.priceBreakdown?.totalPrice ?? subtotal;
        DOM.modalSubtotalPrice.textContent = formatCurrency(subtotal);
        DOM.modalTotalPrice.textContent = formatCurrency(finalAmount);
        DOM.modalTemplateName.textContent = order.selectedTemplate || 'N/A';
        renderModalCustomizations(order.fullCustomizations || {});
        renderModalPaymentDetails(order.paymentDetails);
        const hasCoupon = order.appliedCoupon && order.appliedCoupon.code;
        DOM.modalCouponLine.style.display = hasCoupon ? 'block' : 'none';
        DOM.modalPriceHr.style.display = hasCoupon ? 'block' : 'none';
        if (hasCoupon) DOM.modalCouponCode.textContent = order.appliedCoupon.code;
        DOM.orderModal.style.display = 'flex';
    }

    function closeOrderModal() {
        DOM.orderModal.style.display = 'none';
        appState.currentOrderInModal = null;
    }

    function renderModalCustomizations(customizations) {
        let html = "<h4>Customizations</h4>";
        const entries = Object.entries(customizations).filter(([key, value]) => key !== 'contact' && value && (typeof value !== 'object' || Object.keys(value).length > 0) && (!Array.isArray(value) || value.length > 0));
        if (entries.length > 0) {
            html += entries.map(([key, value]) => {
                const fKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                return `<div><strong>${escapeHTML(fKey)}:</strong><br><span>${escapeHTML(Array.isArray(value) ? value.join(', ') : String(value))}</span></div>`;
            }).join('');
        } else { html += "<span>No customizations specified.</span>"; }
        DOM.modalCustomizations.innerHTML = html;
    }

    function renderModalPaymentDetails(details) {
        let html = "<h4>Payment Details</h4>";
        if (details && details.paymentId) {
            html += `<p><i class="fas fa-check-circle" style="color: var(--success-color);"></i> <strong>Status:</strong> Paid</p><p><i class="fas fa-id-card"></i> <strong>Payment ID:</strong> ${escapeHTML(details.paymentId)}</p><p><i class="far fa-calendar-alt"></i> <strong>Paid At:</strong> ${formatDate(details.paidAt)}</p>`;
        } else { html += '<p><i class="fas fa-hourglass-half" style="color: var(--warning-color);"></i> <strong>Status:</strong> Payment not yet completed.</p>'; }
        DOM.modalPaymentDetails.innerHTML = html;
    }

    function downloadInvoice(format) {
        const order = appState.currentOrderInModal;
        if (!order) return alert("No order selected.");
        populateInvoiceHTML(order);
        const invoiceElement = DOM.invoiceContentForRender;
        const fileName = `Invoice-${order.id.slice(0, 8)}-${order.contactDetails.name.replace(/\s+/g, '_')}`;
        DOM.invoiceContainer.style.visibility = 'visible';
        html2canvas(invoiceElement, { scale: 3, useCORS: true }).then(canvas => {
            DOM.invoiceContainer.style.visibility = 'hidden';
            if (format === 'pdf') {
                const imgData = canvas.toDataURL('image/jpeg', 1.0);
                const pdf = new jspdf.jsPDF({ orientation: 'p', unit: 'px', format: [canvas.width, canvas.height] });
                pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
                pdf.save(`${fileName}.pdf`);
            } else {
                const link = document.createElement('a');
                link.download = `${fileName}.jpg`;
                link.href = canvas.toDataURL('image/jpeg', 0.95);
                link.click();
            }
        }).catch(err => {
            console.error('Error generating invoice:', err);
            alert('Could not generate the invoice.');
            DOM.invoiceContainer.style.visibility = 'hidden';
        });
    }

    function populateInvoiceHTML(order) {
        document.getElementById('invoice-customer-name').textContent = order.contactDetails.name || 'N/A';
        document.getElementById('invoice-customer-email').textContent = order.contactDetails.email || 'N/A';
        document.getElementById('invoice-customer-whatsapp').textContent = order.contactDetails.whatsapp || 'N/A';
        document.getElementById('invoice-number').textContent = `INV-${new Date().getFullYear()}-${order.id.slice(0, 4).toUpperCase()}`;
        document.getElementById('invoice-order-date').textContent = formatDate(order.createdAt);
        document.getElementById('invoice-payment-status').textContent = (order.paymentDetails?.paymentId) ? 'Paid' : 'Pending';
        const breakdownBody = document.getElementById('invoice-breakdown-body');
        const breakdown = order.priceBreakdown;
        let breakdownHTML = '';
        const subtotal = breakdown?.basePrice ?? order.estimatedPrice ?? 0;
        let calculatedTotalBeforeDiscount = subtotal;
        breakdownHTML += `<tr><td>Template: ${escapeHTML(order.selectedTemplate)}</td><td>${formatCurrency(subtotal)}</td></tr>`;
        if (breakdown?.addOns?.logo > 0) { calculatedTotalBeforeDiscount += breakdown.addOns.logo; breakdownHTML += `<tr><td>Logo Design Add-on</td><td>${formatCurrency(breakdown.addOns.logo)}</td></tr>`; }
        if (breakdown?.addOns?.content > 0) { calculatedTotalBeforeDiscount += breakdown.addOns.content; breakdownHTML += `<tr><td>Content Creation Add-on</td><td>${formatCurrency(breakdown.addOns.content)}</td></tr>`; }
        if (breakdown?.addOns?.extraPages > 0) { calculatedTotalBeforeDiscount += breakdown.addOns.extraPages; breakdownHTML += `<tr><td>Extra Pages Fee</td><td>${formatCurrency(breakdown.addOns.extraPages)}</td></tr>`; }
        if (order.appliedCoupon?.code) {
            const finalPrice = order.finalPrice ?? breakdown?.totalPrice ?? subtotal;
            const discountAmount = calculatedTotalBeforeDiscount - finalPrice;
            if (discountAmount > 0) breakdownHTML += `<tr><td>Coupon Applied (${escapeHTML(order.appliedCoupon.code)})</td><td>-${formatCurrency(Math.abs(discountAmount))}</td></tr>`;
        }
        const finalTotal = order.finalPrice ?? breakdown?.totalPrice ?? subtotal;
        breakdownHTML += `<tr class="total-row"><td><strong>Total Paid</strong></td><td><strong>${formatCurrency(finalTotal)}</strong></td></tr>`;
        breakdownBody.innerHTML = breakdownHTML;
    }

    // ===================================================================================
    // SECTION 9: UTILITY FUNCTIONS
    // ===================================================================================
    
    function renderTable(tbody, data, colSpan, noDataMsg, rowRenderer) {
        if (!tbody) return;
        tbody.innerHTML = data.length > 0 ? data.map(item => `<tr data-id="${item.id}">${rowRenderer(item)}</tr>`).join('') : `<tr><td colspan="${colSpan}" style="text-align:center;">${noDataMsg}</td></tr>`;
    }
    const formatCurrency = (amount = 0) => `₹${Number(amount).toLocaleString('en-IN')}`;
    const formatDate = (ts) => ts && ts.seconds ? new Date(ts.seconds * 1000).toLocaleDateString('en-IN') : 'N/A';
    function updateFormStatus(el, msg, type) {
        el.textContent = msg;
        el.className = `form-status ${type}`;
        setTimeout(() => { el.textContent = ''; el.className = 'form-status'; }, 4000);
    }
    const escapeHTML = (str) => { const p = document.createElement('p'); p.textContent = str ?? ''; return p.innerHTML; };
    function createStatusDropdown(className, id, currentStatus, options) {
        return `<select class="status-select ${className}" data-id="${id}">${options.map(opt => `<option value="${opt}" ${currentStatus === opt ? 'selected' : ''}>${opt}</option>`).join('')}</select>`;
    }
})();