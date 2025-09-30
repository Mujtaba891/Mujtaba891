'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // Configuration for Firebase and Gemini API
    const CONFIG = {
        firebase: {
            apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg", 
            authDomain: "mujtaba-alam.firebaseapp.com", 
            projectId: "mujtaba-alam", 
            storageBucket: "mujtaba-alam.appspot.com", 
            messagingSenderId: "221609343134", 
            appId: "1:221609343134:web:d64123479f43e6bc66638f"
        },
        geminiApiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key='
    };

    // Application state
    const state = {
        db: null,
        geminiApiKey: null,
        isChatOpen: false,
        isFirstOpen: true,
        isAwaitingResponse: false,
        dom: {}
    };

    /**
     * Selects and stores all necessary DOM elements.
     */
    function selectDOMElements() {
        state.dom.fab = document.getElementById('ai-assistant-fab');
        state.dom.chatContainer = document.getElementById('ai-chat-container');
        state.dom.closeButton = document.getElementById('ai-chat-close-btn');
        state.dom.messagesContainer = document.getElementById('ai-chat-messages');
        state.dom.chatForm = document.getElementById('ai-chat-form');
        state.dom.chatInput = document.getElementById('ai-chat-input');
        state.dom.submitButton = document.getElementById('ai-chat-submit');
    }

    /**
     * Initializes the Firebase application and Firestore.
     */
    function initializeFirebase() {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(CONFIG.firebase);
            }
            state.db = firebase.firestore();
        } catch (error) {
            console.error("AI Assistant: Firebase initialization failed.", error);
            if (state.dom.fab) state.dom.fab.style.display = 'none';
        }
    }

    /**
     * Fetches the Gemini API key from Firestore.
     */
    async function fetchApiKey() {
        if (!state.db) return;
        try {
            const doc = await state.db.collection('settings').doc('api_keys').get();
            if (doc.exists && doc.data().geminiApiKey) {
                state.geminiApiKey = doc.data().geminiApiKey;
            } else {
                console.warn("AI Assistant: Gemini API Key not found in Firestore. AI features will be disabled.");
                if (state.dom.fab) state.dom.fab.style.display = 'none';
            }
        } catch (error) {
            console.error("AI Assistant: Error fetching API key. This is likely due to Firestore security rules.", error);
            if (state.dom.fab) state.dom.fab.style.display = 'none';
        }
    }

    /**
     * Binds all necessary event listeners.
     */
    function bindEventListeners() {
        if (!state.dom.fab) return;
        state.dom.fab.addEventListener('click', toggleChat);
        state.dom.closeButton.addEventListener('click', toggleChat);
        state.dom.chatForm.addEventListener('submit', handleFormSubmit);
    }
    
    function toggleChat() {
        state.isChatOpen = !state.isChatOpen;
        state.dom.chatContainer.classList.toggle('active', state.isChatOpen);
        if (state.isChatOpen && state.isFirstOpen) {
            addWelcomeMessage();
            state.isFirstOpen = false;
        }
        if(state.isChatOpen) {
            state.dom.chatInput.focus();
        }
    }
    
    function addWelcomeMessage() {
        const welcomeText = "Hello! I'm an AI assistant representing Mujtaba. Feel free to ask me about my skills, projects, or services. You can even ask me to draft an email to him for you!";
        addMessageToUI('ai', welcomeText);
    }
    
    function parseMarkdown(text) {
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        return text;
    }

    function addMessageToUI(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message', `${sender}-message`);
        messageDiv.innerHTML = parseMarkdown(text);
        state.dom.messagesContainer.appendChild(messageDiv);
        scrollToBottom();
    }

    function toggleTypingIndicator(show) {
        let indicator = state.dom.messagesContainer.querySelector('.typing-indicator');
        if (show) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.classList.add('chat-message', 'ai-message', 'typing-indicator');
                indicator.innerHTML = '<span></span><span></span><span></span>';
                state.dom.messagesContainer.appendChild(indicator);
                scrollToBottom();
            }
        } else {
            if (indicator) {
                indicator.remove();
            }
        }
    }

    function scrollToBottom() {
        state.dom.messagesContainer.scrollTop = state.dom.messagesContainer.scrollHeight;
    }
    
    async function handleFormSubmit(e) {
        e.preventDefault();
        if (state.isAwaitingResponse) return;

        const userInput = state.dom.chatInput.value.trim();
        if (userInput === '') return;

        addMessageToUI('user', userInput);
        state.dom.chatInput.value = '';
        state.isAwaitingResponse = true;
        toggleTypingIndicator(true);

        try {
            if (!state.geminiApiKey) {
                throw new Error("API Key is not available. Check Firestore rules and key validity.");
            }
            const aiResponse = await getAiResponse(userInput);
            
            const jsonMatch = aiResponse.match(/{[\s\S]*}/);
            if (jsonMatch) {
                try {
                    const responseJson = JSON.parse(jsonMatch[0]);
                    if (responseJson.action === 'redirect' && responseJson.url) {
                        addMessageToUI('ai', `Sure! Taking you to the ${responseJson.url.replace('.html', '')} page now...`);
                        setTimeout(() => { window.location.href = responseJson.url; }, 1200);
                        return; 
                    }
                    // NEW: Handle the new 'send_email' action
                    if (responseJson.action === 'send_email' && responseJson.subject && responseJson.body) {
                        const recipient = 'mujtabaalam010@gmail.com';
                        const subject = encodeURIComponent(responseJson.subject);
                        const body = encodeURIComponent(responseJson.body);
                        const mailtoLink = `mailto:${recipient}?subject=${subject}&body=${body}`;
                        
                        addMessageToUI('ai', "Great! I've drafted an email for you. I'm opening your default email client now so you can review and send it.");
                        window.location.href = mailtoLink;
                        return;
                    }
                } catch (error) {
                    addMessageToUI('ai', aiResponse);
                }
            } else {
                addMessageToUI('ai', aiResponse);
            }

        } catch (error) {
            console.error("AI Response Error:", error.message);
            addMessageToUI('ai', "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.");
        } finally {
            toggleTypingIndicator(false);
            state.isAwaitingResponse = false;
            state.dom.chatInput.focus();
        }
    }

    async function getAiResponse(userPrompt) {
        // UPDATED: Added a new rule for sending emails.
        const systemPrompt = `You are the AI persona of Mujtaba Alam, a web developer from Kashmir. You must speak in the first person ("I", "my", "me"). Your goal is to be helpful, professional, and encourage visitors to hire you or explore the site.

        My Information:
        - My Skills: HTML5, CSS3, JavaScript (ES6), Supabase, Firebase, and Canva for design.
        - My Services: Web Development, UI/UX Design (with my signature neumorphic style), and Performance & SEO optimization.
        - Projects: ORA Docs App; link(https://ora2.vercel.app/), Article Globe (blogging site); link(https://articleglobe3.vercel.app/), Baba Hardware (local business site); link(https://babahardware.netlify.app) for more projects you can visit my Github Directory; link(https://github.com/Mujtaba891?tab=repositories).
        - Location: Kashmir, India.
        - Contact: mujtabaalam010@gmail.com, +91 9797060239
        -phone: +91 9797060239
        - For colaboration: vist https://md-colab.vercel.app/
        -portfolio: https://mujtabaalam.vercel.app/
        Social Media: Github (https://github.com/Mujtaba891), LinkedIn (https://www.linkedin.com/in/mujtaba-alam-239589382/), Twitter (https://x.com/mujtaba47639658), Instagram (https://www.instagram.com/mujtabaalam25/), Youtube (https://www.youtube.com/@MujtabaAlam25), Watsapp (https://wa.me/+919797060239), Email (mailto:mujtabaalam0102gmail.com)

        Overview of the New "Get a Quote" Flow
        This implementation creates two clear paths for your clients:

        Option 1: Choose a Pre-Designed Template (The Classic Path)
        This is the best option if you'd like to start with a professional design.
        Step 1: Select Your Plan
        Head over to my Pricing Page. Here you can choose a base package that fits your budget and needs (like Starter, Pro, or Advanced). This helps narrow down the best templates for you.
        Step 2: Choose Your Favorite Template
        After selecting a plan, you'll see a gallery of professional templates. Browse through them and select the design that you like the most as a starting point.
        Step 3: Customize Your Project
        You'll be guided through a simple quiz where you can customize everything. You'll answer questions about the pages you need, your brand colors, and any special features you want to add.
        Step 4: Get Your Final Quote
        As you make your selections, you'll see the total estimated price update in real-time. Once you're finished, you can save the project to your account or proceed directly to checkout.
        
        Option 2: Use the AI Project Builder (The Custom Path)
        This is perfect if you have a unique idea and want a plan built just for you.
        Step 1: Select the "AI Custom" Plan
        Go to the Pricing Page and choose the card labeled "AI Custom". This will take you to my AI-powered project builder.
        Step 2: Describe Your Vision
        You'll see a simple text box. In your own words, describe the website you want to create. For example: "I need a clean, modern website for my local bakery. It should have a menu, a gallery, and a contact page with a map."
        Step 3: Let My AI Build Your Plan
        Click "Generate My Plan," and my AI will instantly create a custom project plan for you, including a suggested name, a base price, and a list of recommended pages.
        Step 4: Fine-Tune the Details
        You'll be taken to the same customization quiz as in Option 1, but with all the key details from your AI-generated plan already filled in for you! You can then make any final adjustments.
        

        Your Rules:
        1.  **Persona:** ALWAYS speak as if you are Mujtaba.
        2.  **Markdown:** Use simple markdown: **text** for bold, [Text](URL) for links.
        3.  **Redirection Command:** If the user wants to go to a page (contact, pricing, etc.), respond ONLY with this JSON: {"action": "redirect", "url": "contact.html"}.
        4.  **NEW Email Command:** If a user asks you to write or draft an email for them to send to me (e.g., for collaboration, a project inquiry), you MUST respond ONLY with a JSON object like this: {"action": "send_email", "subject": "Collaboration Inquiry", "body": "Hello Mujtaba,\\n\\nI found your portfolio and I'm interested in collaborating on a project..."}. Generate a relevant subject and a professional, concise body based on the user's request.
        5.  **Stay On Topic:** If asked about unrelated topics, politely steer the conversation back to web development.
        6.  **Be Concise:** Keep answers direct.`;
        
        const apiEndpoint = `${CONFIG.geminiApiEndpoint}${state.geminiApiKey}`;

        const requestBody = {
            contents: [{
                parts: [{ text: `System Instructions:\n${systemPrompt}\n\nUser Question:\n${userPrompt}` }]
            }]
        };

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API request failed with status ${response.status}: ${errorData.error.message}`);
        }

        const data = await response.json();
        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
             return data.candidates[0].content.parts[0].text;
        } else {
            console.warn("AI Response format was unexpected:", data);
            return "I'm sorry, I received an unusual response. Could you please try rephrasing?";
        }
    }

    /**
     * Main initialization function for the AI Assistant.
     */
    async function init() {
        selectDOMElements();
        if (!state.dom.fab) {
            console.log("AI Assistant FAB not found. Aborting initialization.");
            return;
        }
        initializeFirebase();
        await fetchApiKey();
        bindEventListeners();
    }

    init();
});