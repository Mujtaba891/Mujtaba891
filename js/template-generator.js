/**
 * @file AI-Powered Template Page Script (templates.html)
 * @author Mujtaba Alam
 * @version 1.1.0 (Bug Fixes & UX Improvements)
 * @description This script dynamically displays either a grid of pre-made templates or an
 *              AI-powered generator based on the URL parameter. It fixes bugs related to
 *              template visibility and AI form interactivity.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // =================================================================================
    // SECTION 1: CONFIGURATION AND STATE
    // =================================================================================

    const CONFIG = {
        firebase: {
            apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg",
            authDomain: "mujtaba-alam.firebaseapp.com",
            projectId: "mujtaba-alam",
            storageBucket: "mujtaba-alam.appspot.com",
            messagingSenderId: "221609343134",
            appId: "1:221609343134:web:d64123479f43e6bc66638f"
        },
        geminiApiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=',
        staticTemplates: [
            { id: 'clinic', name: 'Clinic', plan: 'pro', price: 11999, pages: 7, domain: 'Free Subdomain', img: 'Template Images/CLINIC.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/Clinic/Clinic' },
            { id: 'daycare', name: 'Daycare Website', plan: 'pro', price: 10999, pages: 7, domain: 'Free Subdomain', img: 'Template Images/daycare-website-template.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/daycare-website-template/daycare-website-template' },
            { id: 'educenter', name: 'Educenter', plan: 'pro', price: 13999, pages: 7, domain: 'Free Subdomain', img: 'Template Images/educenter-master.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/educenter-master/educenter-master' },
            { id: 'ecommerce', name: 'Electro eCommerce', plan: 'advanced', price: 24999, pages: 15, domain: 'Custom Domain Included', img: 'Template Images/Electro-Free-Bootstrap-eCommerce-Website-Templates.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/Electro-Free-Bootstrap-eCommerce-Website-Templates/Electro-Free-Bootstrap-eCommerce-Website-Templates' },
            { id: 'etrain', name: 'E-Train Master', plan: 'advanced', price: 18999, pages: 15, domain: 'Custom Domain Included', img: 'Template Images/etrain-master.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/etrain-master/etrain-master' },
            { id: 'karma', name: 'Karma Master', plan: 'starter', price: 6999, pages: 3, domain: 'Free Subdomain', img: 'Template Images/karma-master.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/karma-master/karma-master' },
            { id: 'kiddy', name: 'Kiddy Master', plan: 'pro', price: 9999, pages: 7, domain: 'Free Subdomain', img: 'Template Images/kiddy-master.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/kiddy-master/kiddy-master' },
            { id: 'meditrust', name: 'MediTrust', plan: 'pro', price: 12999, pages: 7, domain: 'Free Subdomain', img: 'Template Images/MediTrust.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/MediTrust/MediTrust' },
            { id: 'organic', name: 'Organic', plan: 'advanced', price: 21999, pages: 15, domain: 'Custom Domain Included', img: 'Template Images/organic-1.0.0.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/organic-1.0.0/organic-1.0.0' },
            { id: 'passion', name: 'Passion', plan: 'starter', price: 5999, pages: 3, domain: 'Free Subdomain', img: 'Template Images/Passion.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/Passion/Passion' },
            { id: 'villa-agency', name: 'Villa Agency', plan: 'pro', price: 14999, pages: 7, domain: 'Free Subdomain', img: 'Template Images/templatemo_591_villa_agency.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/templatemo_591_villa_agency/templatemo_591_villa_agency/index.html' },
            { id: 'glossy-touch', name: 'Glossy Touch', plan: 'starter', price: 7999, pages: 3, domain: 'Free Subdomain', img: 'Template Images/templatemo_592_glossy_touch.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/templatemo_592_glossy_touch/templatemo_592_glossy_touch/index.html' },
            { id: 'personal-shape', name: 'Personal Shape', plan: 'starter', price: 4999, pages: 3, domain: 'Free Subdomain', img: 'Template Images/templatemo_593_personal_shape.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/templatemo_593_personal_shape/templatemo_593_personal_shape/index.html' },
            { id: 'nexus-flow', name: 'Nexus Flow', plan: 'advanced', price: 20999, pages: 15, domain: 'Custom Domain Included', img: 'Template Images/templatemo_594_nexus_flow.png', previewUrl: 'https://mujtabaalam.netlify.app/Templates/templatemo_594_nexus_flow/templatemo_594_nexus_flow/index.html' }
        ]
    };

    const state = {
        db: null,
        geminiApiKey: null,
        isGenerating: false
    };

    const DOM = {
        pageContent: document.getElementById('page-content')
    };

    // =================================================================================
    // SECTION 2: INITIALIZATION AND ROUTING
    // =================================================================================
    
    async function main() {
        initializeFirebase();
        state.geminiApiKey = await fetchGeminiApiKey();
        
        const urlParams = new URLSearchParams(window.location.search);
        const planFilter = urlParams.get('plan');

        if (planFilter === 'ai') {
            renderAiGenerator();
        } else {
            renderStaticTemplates(planFilter);
        }
    }

    function initializeFirebase() {
        try {
            if (!firebase.apps.length) firebase.initializeApp(CONFIG.firebase);
            state.db = firebase.firestore();
        } catch (error) {
            console.error("Firebase Init Failed.", error);
            DOM.pageContent.innerHTML = `<h1>Error connecting to services. Please refresh the page.</h1>`;
        }
    }

    async function fetchGeminiApiKey() {
        if (!state.db) return null;
        try {
            const doc = await state.db.collection('settings').doc('api_keys').get();
            if (doc.exists && doc.data().geminiApiKey) {
                return doc.data().geminiApiKey;
            } else {
                console.warn("Gemini API Key not found in Firestore. AI features will be disabled.");
                return null;
            }
        } catch (error) {
            console.error("Error fetching Gemini API key:", error);
            return null;
        }
    }

    // =================================================================================
    // SECTION 3: UI RENDERING & EVENT LISTENERS
    // =================================================================================

    function renderStaticTemplates(planFilter) {
        let templatesToDisplay = planFilter 
            ? CONFIG.staticTemplates.filter(t => t.plan === planFilter) 
            : CONFIG.staticTemplates;

        // Ensure we always show something, even if the filter is invalid
        if (templatesToDisplay.length === 0) {
            templatesToDisplay = CONFIG.staticTemplates;
        }

        const templateCardsHTML = templatesToDisplay.map(template => `
            <div class="template-card animate-on-scroll">
                <img src="${template.img}" alt="${template.name}" class="template-image">
                <div class="template-info">
                    <h3>${template.name}</h3>
                    <ul class="template-details-list">
                        <li><i class="fas fa-file-alt"></i> Up to ${template.pages} Pages</li>
                        <li><i class="fas fa-globe"></i> ${template.domain || 'Free Subdomain'}</li>
                        <li><i class="fas fa-tag"></i> Starts at ₹${template.price.toLocaleString('en-IN')}</li>
                    </ul>
                    <div class="template-actions">
                         <button class="neumorphic-btn secondary preview-btn" data-url="${template.previewUrl}">Preview</button>
                         <a href="order.html?template=${template.id}" class="neumorphic-btn primary">Customize</a>
                    </div>
                </div>
            </div>
        `).join('');

        DOM.pageContent.innerHTML = `
            <h2 class="animate-on-scroll">Choose a Template</h2>
            <p class="section-subtitle animate-on-scroll">Select a design that best fits your vision. You'll customize it in the next step.</p>
            <div class="templates-grid">${templateCardsHTML}</div>
            <div class="back-to-home-container">
                <a href="pricing.html" class="back-to-home"><i class="fas fa-arrow-left"></i> Back to Plans</a>
            </div>
        `;
        
        // Post-render attachments
        attachAnimationObserver();
        attachPreviewListeners();
    }

    function renderAiGenerator() {
        DOM.pageContent.innerHTML = `
            <div class="ai-generator-container">
                <h2 class="animate-on-scroll"><i class="fas fa-magic"></i> AI Template Generator</h2>
                <p class="section-subtitle animate-on-scroll">
                    Can't find a template you like? Describe your perfect website, and let our AI build a custom plan for you.
                </p>
                <form id="ai-form" class="ai-form neumorphic-inset">
                    <label for="website-description">Describe your website in a few sentences:</label>
                    <textarea id="website-description" rows="5" placeholder="For example: 'I need a modern website for my new coffee shop in downtown. It should have a menu page, a gallery of our cafe, an 'About Us' story, and a contact page with a map.'" required></textarea>
                    <p id="ai-error" class="ai-error"></p>
                    <button type="submit" id="generate-btn" class="neumorphic-btn primary large">
                        <i class="fas fa-cogs"></i> Generate My Plan
                    </button>
                </form>
                 <div class="back-to-home-container">
                    <a href="pricing.html" class="back-to-home"><i class="fas fa-arrow-left"></i> Back to Plans</a>
                </div>
            </div>
        `;

        if (!state.geminiApiKey) {
            document.getElementById('generate-btn').disabled = true;
            document.getElementById('website-description').disabled = true;
            document.getElementById('ai-error').textContent = 'The AI Generator is currently unavailable. Please check back later.';
        } else {
            document.getElementById('ai-form').addEventListener('submit', handleAiFormSubmit);
        }
        
        // Post-render attachments
        attachAnimationObserver();
    }

    function attachAnimationObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.1 });
        document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
    }

    function attachPreviewListeners() {
        // These elements are defined in the templates.html file, not here in JS.
        const previewModal = document.getElementById('preview-modal');
        const closePreviewBtn = document.getElementById('close-preview');
        const previewFrame = document.getElementById('preview-frame');
        const previewUrlText = document.getElementById('preview-url-text');
        
        if (!previewModal) return; // Exit if modal is not on the page

        document.querySelectorAll('.preview-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const url = e.currentTarget.dataset.url;
                previewFrame.src = url;
                previewUrlText.textContent = url;
                previewModal.style.display = 'flex';
            });
        });
        
        const closeModal = () => {
            previewFrame.src = 'about:blank';
            previewModal.style.display = 'none';
        };
        
        closePreviewBtn.addEventListener('click', closeModal);
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) closeModal();
        });
    }
    
    // =================================================================================
    // SECTION 4: AI LOGIC
    // =================================================================================

    function handleAiFormSubmit(event) {
        event.preventDefault();
        if (state.isGenerating) return;

        const descriptionInput = document.getElementById('website-description');
        const generateBtn = document.getElementById('generate-btn');
        const errorP = document.getElementById('ai-error');
        
        const description = descriptionInput.value.trim();
        if (description.length < 50) {
            errorP.textContent = 'Please provide a more detailed description (at least 50 characters).';
            return;
        }
        errorP.textContent = '';
        state.isGenerating = true;
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building Your Plan...';

        generateAiTemplate(description);
    }

    async function generateAiTemplate(description) {
        const generateBtn = document.getElementById('generate-btn'); // Get reference for finally block
        const errorP = document.getElementById('ai-error');
        try {
            const prompt = `
                Analyze the following user request for a website and generate a website plan.
                User Request: "${description}"
                Your task is to respond ONLY with a valid JSON object containing four keys:
                1. "name": A creative and professional name for this website template (e.g., "Artisan Cafe Pro", "Modern Legal Solutions").
                2. "price": An estimated base price in INR. This should be an integer between 7999 and 29999, based on the complexity. A simple portfolio should be cheaper than a complex e-commerce site.
                3. "pageLimit": An integer representing the number of pages included in the base price (between 4 and 10).
                4. "pages": An array of strings with recommended page names based on the user's description. Always include "Home" and "Contact Us".
                Example Response for a coffee shop request:
                {
                  "name": "Urban Grind Cafe",
                  "price": 12999,
                  "pageLimit": 6,
                  "pages": ["Home", "Our Menu", "Gallery", "About Us", "Events", "Contact Us"]
                }
            `;

            const response = await fetch(`${CONFIG.geminiApiEndpoint}${state.geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
            
            const data = await response.json();
            const suggestionText = data.candidates[0].content.parts[0].text;
            const cleanedJsonString = suggestionText.replace(/```json/g, '').replace(/```/g, '').trim();
            const aiTemplate = JSON.parse(cleanedJsonString);

            aiTemplate.id = `ai-${Date.now()}`;
            localStorage.setItem('aiGeneratedTemplate', JSON.stringify(aiTemplate));
            window.location.href = `order.html?template=ai-generated`;

        } catch (error) {
            console.error("AI Template Generation Failed:", error);
            errorP.textContent = 'Sorry, we couldn\'t generate a plan from that description. Please try rephrasing your request.';
        } finally {
            state.isGenerating = false;
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-cogs"></i> Generate My Plan';
        }
    }

    // =================================================================================
    // SECTION 5: SCRIPT EXECUTION
    // =================================================================================

    main();
});