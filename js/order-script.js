/**
 * @file Main script for the order.html customization page.
 * @author Mujtaba Alam
 * @version 6.0.0 (Expanded Questionnaire)
 * @description Expanded the quiz to 9 questions and 15 page options for a more detailed order process.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    const TEMPLATE_PLANS = { 'clinic': { name: 'Clinic', price: 11999, pageLimit: 7 }, 'daycare': { name: 'Daycare Website', price: 10999, pageLimit: 7 }, 'educenter': { name: 'Educenter', price: 13999, pageLimit: 7 }, 'ecommerce': { name: 'Electro eCommerce', price: 24999, pageLimit: 15 }, 'etrain': { name: 'E-Train Master', price: 18999, pageLimit: 15 }, 'karma': { name: 'Karma Master', price: 6999, pageLimit: 3 }, 'kiddy': { name: 'Kiddy Master', price: 9999, pageLimit: 7 }, 'meditrust': { name: 'MediTrust', price: 12999, pageLimit: 7 }, 'organic': { name: 'Organic', price: 21999, pageLimit: 15 }, 'passion': { name: 'Passion', price: 5999, pageLimit: 3 }, 'topic-listing': { name: 'Topic Listing', price: 4999, pageLimit: 3 }, 'villa-agency': { name: 'Villa Agency', price: 14999, pageLimit: 7 }, 'glossy-touch': { name: 'Glossy Touch', price: 7999, pageLimit: 3 }, 'personal-shape': { name: 'Personal Shape', price: 4999, pageLimit: 3 }, 'nexus-flow': { name: 'Nexus Flow', price: 20999, pageLimit: 15 } };
    
    // --- UPDATED & EXPANDED QUESTIONS ---
    const QUIZ_QUESTIONS = [
        { id: 'siteName', question: "What is the name of your site?", type: 'text', placeholder: "e.g., Mujtaba's Creations" },
        { id: 'siteDesc', question: "Briefly describe your website's purpose.", type: 'textarea', placeholder: "e.g., A portfolio to showcase my web development projects." },
        // --- UPDATED WITH 15 PAGES ---
        { id: 'pages', question: "Select the pages you need.", type: 'checkbox', options: ['Home', 'About Us', 'Services', 'Projects', 'Blog', 'Contact Us', 'Team', 'Testimonials', 'FAQ', 'Gallery', 'Careers', 'Pricing', 'Events', 'Partners', 'Shop'] },
        { id: 'domain', question: "Choose your domain option:", type: 'radio', options: ['Get a free subdomain (e.g., mysite.mujtaba.com)', 'Register a new custom domain (e.g., www.mysite.com)'] },
        // --- NEW QUESTIONS START HERE ---
        { id: 'logo', question: "Do you have a brand logo?", type: 'radio', options: ['Yes, I have a logo', 'No, I need one designed'] },
        { id: 'branding', question: "Do you have specific brand colors or fonts?", type: 'text', placeholder: "e.g., Blue (#007BFF), White, and Poppins font" },
        { id: 'content', question: "Are you providing the text and images for the pages?", type: 'radio', options: ['Yes, all content is ready', 'I need help with content writing/sourcing images'] },
        { id: 'features', question: "Any special features needed?", type: 'textarea', placeholder: "e.g., Live chat integration, appointment booking, etc." },
        // --- FINAL QUESTION ---
        { id: 'contact', question: "Finally, please provide your contact details.", type: 'contact' }
    ];

    const quizState = { currentQuestionIndex: 0, userAnswers: {}, selectedTemplateId: null, templateInfo: {}, db: null };
    const DOM = { quizView: document.getElementById('quiz-view'), questionText: document.getElementById('question-text'), optionsContainer: document.getElementById('options-container'), progressText: document.getElementById('progress-text'), progressBar: document.getElementById('progress-bar'), navContainer: document.querySelector('.quiz-navigation'), nextBtn: document.getElementById('next-btn'), backBtn: document.getElementById('back-btn'), loadingSpinner: document.getElementById('loading-spinner') };

    function initializeFirebase() { try { const firebaseConfig = { apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg", authDomain: "mujtaba-alam.firebaseapp.com", projectId: "mujtaba-alam", storageBucket: "mujtaba-alam.appspot.com", messagingSenderId: "221609343134", appId: "1:221609343134:web:d64123479f43e6bc66638f" }; if (!firebase.apps.length) firebase.initializeApp(firebaseConfig); quizState.db = firebase.firestore(); return true; } catch (error) { console.error("Firebase initialization failed:", error); DOM.optionsContainer.innerHTML = `<p style="color: red;">Error: Could not connect to the database.</p>`; return false; } }
    
    function renderQuestion() {
        const question = QUIZ_QUESTIONS[quizState.currentQuestionIndex];
        DOM.questionText.textContent = question.question;
        DOM.optionsContainer.innerHTML = '';
        DOM.navContainer.innerHTML = `<button id="back-btn" class="neumorphic-btn">Back</button><button id="next-btn" class="neumorphic-btn primary">Next</button>`;
        DOM.backBtn = document.getElementById('back-btn');
        DOM.nextBtn = document.getElementById('next-btn');
        DOM.backBtn.addEventListener('click', handleBackClick);
        DOM.nextBtn.addEventListener('click', handleNextClick);
        
        let inputHTML = '';
        const answer = quizState.userAnswers[question.id] || '';

        switch (question.type) {
            case 'text':
                inputHTML = `<input type="text" id="${question.id}" class="full-width-input" placeholder="${question.placeholder}" value="${answer}">`;
                break;
            case 'textarea':
                inputHTML = `<textarea id="${question.id}" class="full-width-input" rows="5" placeholder="${question.placeholder}">${answer}</textarea>`;
                break;
            case 'radio':
                inputHTML = question.options.map(opt => `<label><input type="radio" name="${question.id}" value="${opt}" ${answer === opt ? 'checked' : ''}><div class="option-label">${opt}</div></label>`).join('');
                break;
            case 'checkbox':
                const pageLimit = quizState.templateInfo.pageLimit;
                inputHTML = `<p class="section-subtitle">You can select up to ${pageLimit} pages for this plan.</p>`;
                inputHTML += question.options.map(opt => `<label><input type="checkbox" name="${question.id}" value="${opt}" ${(Array.isArray(answer) && answer.includes(opt)) ? 'checked' : ''}><div class="option-label">${opt}</div></label>`).join('');
                break;
            case 'contact':
                const contact = quizState.userAnswers.contact || {};
                inputHTML = `<div class="contact-form-grid"><input type="text" id="contact-name" placeholder="Your Full Name*" required value="${contact.name || ''}"><input type="email" id="contact-email" placeholder="Your Email Address*" required value="${contact.email || ''}"><input type="tel" id="contact-whatsapp" placeholder="Your WhatsApp Number*" required value="${contact.whatsapp || ''}"></div>`;
                DOM.navContainer.innerHTML = `<button id="back-btn" class="neumorphic-btn">Back</button><div><button id="pay-later-btn" class="neumorphic-btn">Save Order</button><button id="checkout-btn" class="neumorphic-btn primary">Continue to Checkout</button></div>`;
                document.getElementById('back-btn').addEventListener('click', handleBackClick);
                document.getElementById('pay-later-btn').addEventListener('click', () => handleFinalSubmit('payLater'));
                document.getElementById('checkout-btn').addEventListener('click', () => handleFinalSubmit('checkout'));
                break;
        }
        DOM.optionsContainer.innerHTML = inputHTML;
        if (question.type === 'checkbox') addCheckboxLimiter();
        updateProgress();
    }

    function addCheckboxLimiter() {
        const checkboxes = DOM.optionsContainer.querySelectorAll('input[type="checkbox"]');
        if (checkboxes.length === 0) return;
        const pageLimit = quizState.templateInfo.pageLimit;
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const checkedCount = DOM.optionsContainer.querySelectorAll('input[type="checkbox"]:checked').length;
                if (checkedCount > pageLimit) {
                    alert(`You can only select a maximum of ${pageLimit} pages for this plan.`);
                    checkbox.checked = false;
                }
            });
        });
    }

    function handleNextClick() { if (!saveCurrentAnswer()) return; quizState.currentQuestionIndex++; renderQuestion(); }
    function handleBackClick() { if (quizState.currentQuestionIndex > 0) { quizState.currentQuestionIndex--; renderQuestion(); } }

    function saveCurrentAnswer() {
        const question = QUIZ_QUESTIONS[quizState.currentQuestionIndex];
        let answer;
        switch (question.type) {
            case 'text':
            case 'textarea':
                answer = document.getElementById(question.id).value.trim();
                // Allow empty for non-required fields like 'branding' and 'features'
                if (!answer && (question.id === 'siteName' || question.id === 'siteDesc')) {
                    alert('Please fill in the field.'); return false;
                }
                break;
            case 'radio':
                const radio = DOM.optionsContainer.querySelector(`input[name="${question.id}"]:checked`);
                if (!radio) { alert('Please select an option.'); return false; }
                answer = radio.value;
                break;
            case 'checkbox':
                answer = Array.from(DOM.optionsContainer.querySelectorAll(`input[name="${question.id}"]:checked`)).map(cb => cb.value);
                if (answer.length === 0) { alert('Please select at least one page.'); return false; }
                break;
            case 'contact':
                const name = document.getElementById('contact-name').value.trim();
                const email = document.getElementById('contact-email').value.trim();
                const whatsapp = document.getElementById('contact-whatsapp').value.trim();
                if (!name || !email || !whatsapp) { alert('Please fill all contact fields.'); return false; }
                answer = { name, email, whatsapp };
                break;
        }
        quizState.userAnswers[question.id] = answer;
        return true;
    }

    async function handleFinalSubmit(action) {
        if (!saveCurrentAnswer()) return;
        DOM.quizView.style.display = 'none';
        DOM.loadingSpinner.style.display = 'block';

        const orderData = {
            contactDetails: quizState.userAnswers.contact,
            estimatedPrice: quizState.templateInfo.price,
            status: 'Pending Payment',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            selectedTemplate: quizState.templateInfo.name,
            fullCustomizations: quizState.userAnswers,
            templateId: quizState.selectedTemplateId
        };

        try {
            const docRef = await quizState.db.collection("orders").add(orderData);
            let myOrders = JSON.parse(localStorage.getItem('myOrders')) || [];
            if (!myOrders.includes(docRef.id)) myOrders.push(docRef.id);
            localStorage.setItem('myOrders', JSON.stringify(myOrders));

            if (action === 'checkout') {
                const checkoutData = { price: orderData.estimatedPrice, orderId: docRef.id, summary: [{question: 'Template', text: orderData.selectedTemplate}], contact: orderData.contactDetails };
                localStorage.setItem('checkoutData', JSON.stringify(checkoutData));
                window.location.href = 'checkout.html';
            } else {
                window.location.href = 'my-orders.html';
            }
        } catch (error) {
            console.error("Firebase Error:", error);
            alert(`Could not save your project. Error: ${error.message}`);
            DOM.quizView.style.display = 'block';
            DOM.loadingSpinner.style.display = 'none';
        }
    }
    
    function updateProgress() { const totalSteps = QUIZ_QUESTIONS.length; const progressPercentage = (quizState.currentQuestionIndex / (totalSteps - 1)) * 100; DOM.progressText.textContent = `Step ${quizState.currentQuestionIndex + 1} of ${totalSteps}`; DOM.progressBar.style.width = `${progressPercentage}%`; DOM.backBtn.style.display = quizState.currentQuestionIndex === 0 ? 'none' : 'inline-block'; }
    
    function initializeApp() {
        const urlParams = new URLSearchParams(window.location.search);
        const templateId = urlParams.get('template');
        const templateData = TEMPLATE_PLANS[templateId];
        if (!templateId || !templateData) { document.body.innerHTML = `<div class="quiz-container neumorphic-outset"><h2>Oops!</h2><p>No template selected or template is invalid.</p><a href="templates.html" class="neumorphic-btn primary" style="margin-top: 20px;">Choose Template</a></div>`; return; }
        quizState.selectedTemplateId = templateId;
        quizState.templateInfo = templateData;
        if (initializeFirebase()) renderQuestion();
    }
    initializeApp();
});