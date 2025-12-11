'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // =================================================================================
    // SECTION 1: APPLICATION CONFIGURATION & STATE
    // =================================================================================

    const CONFIG = {
        firebase: {
            apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg", authDomain: "mujtaba-alam.firebaseapp.com", projectId: "mujtaba-alam", storageBucket: "mujtaba-alam.appspot.com", messagingSenderId: "221609343134", appId: "1:221609343134:web:d64123479f43e6bc66638f"
        },
        openRouterEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
        aiModel: 'google/gemini-2.0-flash-001',
        // FIX: Added fallback key for Order Quiz suggestion
        addOnCosts: { logoDesign: 2499, contentCreation: 4999, perExtraPage: 799 },
        templates: { 'clinic':{name:'Clinic',price:11999,pageLimit:7},'daycare':{name:'Daycare Website',price:10999,pageLimit:7},'educenter':{name:'Educenter',price:13999,pageLimit:7},'ecommerce':{name:'Electro eCommerce',price:24999,pageLimit:15},'etrain':{name:'E-Train Master',price:18999,pageLimit:15},'karma':{name:'Karma Master',price:6999,pageLimit:3},'kiddy':{name:'Kiddy Master',price:9999,pageLimit:7},'meditrust':{name:'MediTrust',price:12999,pageLimit:7},'organic':{name:'Organic',price:21999,pageLimit:15},'passion':{name:'Passion',price:5999,pageLimit:3},'topic-listing':{name:'Topic Listing',price:4999,pageLimit:3},'villa-agency':{name:'Villa Agency',price:14999,pageLimit:7},'glossy-touch':{name:'Glossy Touch',price:7999,pageLimit:3},'personal-shape':{name:'Personal Shape',price:4999,pageLimit:3},'nexus-flow':{name:'Nexus Flow',price:20999,pageLimit:15} },
        questions: [
            { id: 'siteName', question: "What is the name of your site?", type: 'text', placeholder: "e.g., Mujtaba's Creations", required: true },
            { id: 'siteDesc', question: "Briefly describe your website's purpose.", type: 'textarea', placeholder: "e.g., A portfolio for my projects", required: true, triggersAI: true },
            { id: 'pages', question: "Select the pages you need.", type: 'checkbox', options: ['Home','About Us','Services','Projects','Blog','Contact Us','Team','Testimonials','FAQ','Gallery','Careers','Pricing','Events','Partners','Shop'] },
            { id: 'domain', question: "Choose your domain option:", type: 'radio', options: ['Get a free subdomain (e.g., mysite.mujtaba.com)', 'Register a new custom domain (e.g., www.mysite.com)'] },
            { id: 'logo', question: "Do you have a brand logo?", type: 'radio', options: ['Yes, I have a logo', 'No, I need one designed'] },
            { id: 'branding', question: "Brand colors or fonts? (Optional)", type: 'text', placeholder: "e.g., Blue (#007BFF), Poppins font" },
            { id: 'content', question: "Are you providing the text and images?", type: 'radio', options: ['Yes, all content is ready', 'I need help with content writing/sourcing images'] },
            { id: 'features', question: "Any special features? (Optional)", type: 'textarea', placeholder: "e.g., Live chat, appointment booking..." },
            { id: 'contact', question: "Finally, please confirm your contact details.", type: 'contact' }
        ]
    };

    const state = {
        firebase: { auth: null, db: null },
        quiz: {
            currentQuestionIndex: 0, userAnswers: {}, selectedTemplateId: null, templateInfo: {}, currentUser: null, isSubmitting: false, basePrice: 0, totalPrice: 0,
            addOns: { logo: 0, content: 0, extraPages: 0 },
            openRouterApiKey: null,
        },
        dom: {
            mainContainer: document.getElementById('quiz-container'), quizView: document.getElementById('quiz-view'), questionText: document.getElementById('question-text'), optionsContainer: document.getElementById('options-container'), validationError: document.getElementById('validation-error-message'), progressText: document.getElementById('progress-text'), progressBar: document.getElementById('progress-bar'), navContainer: document.querySelector('.quiz-navigation'), loadingSpinner: document.getElementById('loading-spinner'),
            summary: { basePrice: document.getElementById('summary-base-price'), logoItem: document.getElementById('summary-logo-item'), logoCost: document.getElementById('summary-logo-cost'), contentItem: document.getElementById('summary-content-item'), contentCost: document.getElementById('summary-content-cost'), pagesItem: document.getElementById('summary-pages-item'), pagesCount: document.getElementById('summary-extra-pages-count'), pagesCost: document.getElementById('summary-pages-cost'), totalPrice: document.getElementById('summary-total-price') }
        }
    };

    // =================================================================================
    // SECTION 2: INITIALIZATION & AUTHENTICATION
    // =================================================================================

    async function main() {
        if (!initializeFirebase()) return;
        state.quiz.openRouterApiKey = await fetchOpenRouterApiKey();
        handleAuthentication();
    }

    function initializeFirebase() {
        try {
            if (!firebase.apps.length) firebase.initializeApp(CONFIG.firebase);
            state.firebase.auth = firebase.auth();
            state.firebase.db = firebase.firestore();
            return true;
        } catch (error) {
            console.error("CRITICAL: Firebase Init Failed.", error);
            document.body.innerHTML = `<h1>Error connecting to services.</h1>`;
            return false;
        }
    }

    function handleAuthentication() {
        state.firebase.auth.onAuthStateChanged(user => {
            if (user) {
                state.quiz.currentUser = user;
                state.dom.mainContainer.style.display = 'block';
                initializeAppQuiz();
            } else {
                window.location.href = `login-customer.html?redirect=${encodeURIComponent(window.location.href)}`;
            }
        });
    }

    async function fetchOpenRouterApiKey() {
        // FIX: Return fallback immediately if no DB or on error
        try {
            const doc = await state.firebase.db.collection('settings').doc('api_keys').get();
            if (doc.exists && doc.data().openRouter) {
                return doc.data().openRouter;
            }
        } catch (error) {
            console.warn("Using fallback API key due to DB error:", error);
        }
        return CONFIG.fallbackKey;
    }

    function initializeAppQuiz() {
        const urlParams = new URLSearchParams(window.location.search);
        let templateId = urlParams.get('template');
        let templateInfo;

        if (templateId === 'ai-generated') {
            try {
                const aiTemplateData = localStorage.getItem('aiGeneratedTemplate');
                if (!aiTemplateData) throw new Error("AI template data not found in session.");
                
                templateInfo = JSON.parse(aiTemplateData);
                templateId = templateInfo.id;
                
                CONFIG.templates[templateId] = templateInfo;
                localStorage.removeItem('aiGeneratedTemplate');

            } catch (error) {
                console.error("Failed to load AI-generated template:", error);
                state.dom.mainContainer.innerHTML = `<div class="neumorphic-outset" style="padding:30px;text-align:center;"><h2>Error Loading AI Plan</h2><p>There was an issue loading your custom-generated plan.</p><a href="templates.html?plan=ai" class="neumorphic-btn primary" style="margin-top:20px;">Try Again</a></div>`;
                return;
            }
        } else if (!CONFIG.templates[templateId]) {
            state.dom.mainContainer.innerHTML = `<div class="neumorphic-outset" style="padding:30px;text-align:center;"><h2>Invalid Template</h2><p>Please go back and choose a valid template.</p><a href="templates.html" class="neumorphic-btn primary" style="margin-top:20px;">Choose Template</a></div>`;
            return;
        } else {
            templateInfo = CONFIG.templates[templateId];
        }
        
        state.quiz.selectedTemplateId = templateId;
        state.quiz.templateInfo = templateInfo;
        state.quiz.basePrice = templateInfo.price;
        
        if (templateId.startsWith('ai-')) {
            state.quiz.userAnswers.siteName = templateInfo.name || '';
            state.quiz.userAnswers.siteDesc = templateInfo.description || '';
        }

        if (templateInfo.pages && Array.isArray(templateInfo.pages)) {
            state.quiz.userAnswers.pages = templateInfo.pages;
        }
        
        updatePriceSummary();
        renderCurrentQuestion();
    }

    // =================================================================================
    // SECTION 3: QUIZ RENDERING & DYNAMIC UI
    // =================================================================================

    function renderCurrentQuestion() {
        const question = CONFIG.questions[state.quiz.currentQuestionIndex];
        state.dom.questionText.textContent = question.question;
        state.dom.optionsContainer.innerHTML = generateQuestionHTML(question);
        attachInteractiveListeners();
        renderNavigation();
        updateProgress();
    }
    
    function generateQuestionHTML(question) {
        const savedAnswer = state.quiz.userAnswers[question.id] || '';
        switch (question.type) {
            case 'text': return `<input type="text" id="${question.id}" class="full-width-input" placeholder="${question.placeholder||''}" value="${escapeHTML(savedAnswer)}">`;
            case 'textarea': return `<textarea id="${question.id}" class="full-width-input" rows="5" placeholder="${question.placeholder||''}">${escapeHTML(savedAnswer)}</textarea>`;
            case 'radio': return question.options.map(opt => `<label><input type="radio" name="${question.id}" value="${opt}" ${savedAnswer===opt?'checked':''}><div class="option-label">${opt}</div></label>`).join('');
            case 'checkbox':
                const limit = state.quiz.templateInfo.pageLimit;
                const checkboxHtml = question.options.map(opt => `<label><input type="checkbox" name="${question.id}" value="${opt}" ${(Array.isArray(savedAnswer) && savedAnswer.includes(opt))?'checked':''}><div class="option-label">${opt}</div></label>`).join('');
                return `<p class="section-subtitle">You can select up to ${limit} pages for this plan. Additional pages cost extra.</p>${checkboxHtml}`;
            case 'contact':
                const contact = savedAnswer || {};
                const name = contact.name || state.quiz.currentUser.displayName || '';
                const email = contact.email || state.quiz.currentUser.email || '';
                return `<div class="contact-form-grid"><input type="text" id="contact-name" placeholder="Your Full Name*" required value="${escapeHTML(name)}"><input type="email" id="contact-email" placeholder="Your Email Address*" required value="${escapeHTML(email)}"><input type="tel" id="contact-whatsapp" placeholder="Your WhatsApp Number*" required value="${contact.whatsapp||''}"></div>`;
            default: return '<p>Error: Unknown question type.</p>';
        }
    }

    function renderNavigation() {
        const isFirstStep = state.quiz.currentQuestionIndex === 0;
        const isLastStep = state.quiz.currentQuestionIndex === CONFIG.questions.length - 1;
        state.dom.navContainer.innerHTML = `<button id="back-btn" class="neumorphic-btn" style="visibility:${isFirstStep ? 'hidden' : 'visible'};">Back</button>${isLastStep ? `<div><button id="save-order-btn" class="neumorphic-btn">Save for Later</button><button id="checkout-btn" class="neumorphic-btn primary">Proceed to Checkout</button></div>` : `<button id="next-btn" class="neumorphic-btn primary">Next</button>`}`;
        attachNavigationListeners();
    }

    function updateProgress() {
        const totalSteps = CONFIG.questions.length;
        const currentStep = state.quiz.currentQuestionIndex + 1;
        state.dom.progressText.textContent = `Step ${currentStep} of ${totalSteps}`;
        state.dom.progressBar.style.width = `${(currentStep / totalSteps) * 100}%`;
    }

    // =================================================================================
    // SECTION 4: AI INTEGRATION & EVENT HANDLING
    // =================================================================================

    function attachNavigationListeners() {
        const backBtn = state.dom.navContainer.querySelector('#back-btn');
        const nextBtn = state.dom.navContainer.querySelector('#next-btn');
        backBtn?.addEventListener('click', () => { if (state.quiz.currentQuestionIndex > 0) { state.quiz.currentQuestionIndex--; renderCurrentQuestion(); } });
        nextBtn?.addEventListener('click', async () => {
            if (!validateAndSaveCurrentAnswer(true)) return;
            const currentQuestion = CONFIG.questions[state.quiz.currentQuestionIndex];
            if (currentQuestion.triggersAI && state.quiz.openRouterApiKey) {
                await handleAiSuggestionGeneration();
            } else {
                state.quiz.currentQuestionIndex++;
                renderCurrentQuestion();
            }
        });
        state.dom.navContainer.querySelector('#save-order-btn')?.addEventListener('click', () => handleFinalSubmit('save'));
        state.dom.navContainer.querySelector('#checkout-btn')?.addEventListener('click', () => handleFinalSubmit('checkout'));
    }

    async function handleAiSuggestionGeneration() {
        const siteName = state.quiz.userAnswers.siteName;
        const siteDesc = state.quiz.userAnswers.siteDesc;
        if (!siteName || !siteDesc) {
            state.quiz.currentQuestionIndex++;
            renderCurrentQuestion();
            return;
        }
        const nextBtn = state.dom.navContainer.querySelector('#next-btn');
        nextBtn.disabled = true;
        nextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating AI Suggestions...';
        try {
            const pageOptions = CONFIG.questions.find(q => q.id === 'pages').options;
            const prompt = `Based on the following website details, suggest some customizations. Website Name: "${siteName}". Website Description: "${siteDesc}". Please provide your response ONLY as a valid JSON object with three keys: 1. "pages": An array of strings with recommended page names from this list: [${pageOptions.map(o => `"${o}"`).join(', ')}]. Include essential pages like 'Home' and 'Contact Us'. 2. "branding": A short string suggestion for brand colors or fonts. 3. "features": A short string suggestion for one or two special features. Example: {"pages": ["Home", "About Us", "Services", "Contact Us", "Blog"],"branding": "A clean look with deep blue (#2c3e50) and a modern sans-serif font like Lato.","features": "A simple contact form and a photo gallery for projects."}`;
            
            const response = await fetch(CONFIG.openRouterEndpoint, {
                method: 'POST', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.quiz.openRouterApiKey}`,
                    'HTTP-Referer': window.location.href,
                    'X-Title': 'Order Quiz'
                },
                body: JSON.stringify({ 
                    model: CONFIG.aiModel,
                    messages: [{ role: "user", content: prompt }] 
                })
            });

            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
            
            const data = await response.json();
            const suggestionText = data.choices[0].message.content;
            
            const cleanedJsonString = suggestionText.replace(/```json/g, '').replace(/```/g, '').trim();
            const suggestions = JSON.parse(cleanedJsonString);
            applyAiSuggestions(suggestions);
        } catch (error) {
            console.error("AI suggestion failed:", error);
        } finally {
            nextBtn.disabled = false;
            nextBtn.innerHTML = 'Next';
            state.quiz.currentQuestionIndex++;
            renderCurrentQuestion();
        }
    }

    function applyAiSuggestions(suggestions) {
        if (suggestions.pages && Array.isArray(suggestions.pages)) state.quiz.userAnswers.pages = suggestions.pages;
        if (suggestions.branding && typeof suggestions.branding === 'string') state.quiz.userAnswers.branding = suggestions.branding;
        if (suggestions.features && typeof suggestions.features === 'string') state.quiz.userAnswers.features = suggestions.features;
        calculateAllCosts();
    }

    function attachInteractiveListeners() {
        const question = CONFIG.questions[state.quiz.currentQuestionIndex];
        if (['logo', 'content', 'pages'].includes(question.id)) {
            state.dom.optionsContainer.querySelectorAll('input').forEach(input => input.addEventListener('change', calculateAllCosts));
        }
    }

    function calculateAllCosts() {
        validateAndSaveCurrentAnswer(false);
        const { userAnswers, templateInfo, addOns } = state.quiz;
        addOns.logo = (userAnswers.logo === 'No, I need one designed') ? CONFIG.addOnCosts.logoDesign : 0;
        addOns.content = (userAnswers.content === 'I need help with content writing/sourcing images') ? CONFIG.addOnCosts.contentCreation : 0;
        const extraPageCount = Math.max(0, (userAnswers.pages?.length || 0) - templateInfo.pageLimit);
        addOns.extraPages = extraPageCount * CONFIG.addOnCosts.perExtraPage;
        updatePriceSummary(extraPageCount);
    }

    function updatePriceSummary(extraPageCount = 0) {
        const { basePrice, addOns } = state.quiz;
        const { summary } = state.dom;
        state.quiz.totalPrice = basePrice + addOns.logo + addOns.content + addOns.extraPages;
        summary.basePrice.textContent = formatCurrency(basePrice);
        summary.totalPrice.textContent = formatCurrency(state.quiz.totalPrice);
        summary.logoCost.textContent = formatCurrency(addOns.logo);
        summary.logoItem.style.display = addOns.logo > 0 ? 'flex' : 'none';
        summary.contentCost.textContent = formatCurrency(addOns.content);
        summary.contentItem.style.display = addOns.content > 0 ? 'flex' : 'none';
        summary.pagesCost.textContent = formatCurrency(addOns.extraPages);
        summary.pagesCount.textContent = extraPageCount;
        summary.pagesItem.style.display = addOns.extraPages > 0 ? 'flex' : 'none';
    }

    function validateAndSaveCurrentAnswer(showError = true) {
        const question = CONFIG.questions[state.quiz.currentQuestionIndex];
        let answer, isValid = true, error = '';
        const setErr = msg => { isValid = false; if (showError) error = msg; };
        switch (question.type) {
            case 'text': case 'textarea': answer = document.getElementById(question.id).value.trim(); if (question.required && !answer) setErr('This field is required.'); break;
            case 'radio': const r = state.dom.optionsContainer.querySelector(`input[name="${question.id}"]:checked`); if (!r) setErr('Please select an option.'); else answer = r.value; break;
            case 'checkbox': answer = Array.from(state.dom.optionsContainer.querySelectorAll(`input[name="${question.id}"]:checked`)).map(cb => cb.value); if (answer.length === 0) setErr('Please select at least one page.'); break;
            case 'contact': const n = document.getElementById('contact-name').value.trim(), e = document.getElementById('contact-email').value.trim(), w = document.getElementById('contact-whatsapp').value.trim(); if (!n || !e || !w) setErr('Please fill all contact fields.'); else if (!/^\S+@\S+\.\S+$/.test(e)) setErr('Please enter a valid email.'); else answer = { name: n, email: e, whatsapp: w }; break;
        }
        if (isValid) { state.quiz.userAnswers[question.id] = answer; hideValidationError(); return true; }
        else { if (showError) showValidationError(error); return false; }
    }

    // =================================================================================
    // SECTION 5: DATA SUBMISSION
    // =================================================================================

    async function handleFinalSubmit(action) {
        if (state.quiz.isSubmitting || !validateAndSaveCurrentAnswer(true)) return;
        state.quiz.isSubmitting = true;
        state.dom.quizView.style.display = 'none';
        state.dom.loadingSpinner.style.display = 'block';
        const { currentUser, userAnswers, templateInfo, selectedTemplateId, basePrice, addOns, totalPrice } = state.quiz;
        const orderData = {
            userId: currentUser.uid, userEmail: currentUser.email, contactDetails: userAnswers.contact,
            priceBreakdown: { basePrice, addOns, totalPrice }, status: 'Pending Payment',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            selectedTemplate: templateInfo.name, templateId: selectedTemplateId, fullCustomizations: userAnswers,
        };
        try {
            const docRef = await state.firebase.db.collection("orders").add(orderData);
            if (action === 'checkout') {
                const checkoutData = { price: totalPrice, orderId: docRef.id, summary: [{question:'Template',text:templateInfo.name}], contact: userAnswers.contact };
                localStorage.setItem('checkoutData', JSON.stringify(checkoutData));
                window.location.href = 'checkout.html';
            } else { window.location.href = 'my-orders.html'; }
        } catch (error) {
            console.error("CRITICAL: Order submission failed:", error);
            showValidationError(`Failed to save order: ${error.message}. Please try again.`);
            state.quiz.isSubmitting = false;
            state.dom.quizView.style.display = 'block';
            state.dom.loadingSpinner.style.display = 'none';
        }
    }
    
    // =================================================================================
    // SECTION 6: UTILITY HELPERS & SCRIPT EXECUTION
    // =================================================================================
    
    const formatCurrency = (amount = 0) => `₹${Number(amount).toLocaleString('en-IN')}`;
    const escapeHTML = (str) => {
        if (!str) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    };
    const showValidationError = msg => { state.dom.validationError.textContent = msg; state.dom.validationError.style.display = 'block'; };
    const hideValidationError = () => { state.dom.validationError.style.display = 'none'; };
    
    main();


});
