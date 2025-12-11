'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // Configuration for Firebase and OpenRouter API
    const CONFIG = {
        firebase: {
            apiKey: "AIzaSyCrimPYJOBcmx-ynWJ9g2GqjrT9ANsTrpg", 
            authDomain: "mujtaba-alam.firebaseapp.com", 
            projectId: "mujtaba-alam", 
            storageBucket: "mujtaba-alam.appspot.com", 
            messagingSenderId: "221609343134", 
            appId: "1:221609343134:web:d64123479f43e6bc66638f"
        },
        openRouterEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
        // Using a reliable model on OpenRouter
        aiModel: 'google/gemini-2.0-flash-001',
        // FIX: Fallback key added here to prevent button disappearing if DB read fail
    };

    // Application state
    const state = {
        db: null,
        openRouterApiKey: null,
        isChatOpen: false,
        isFirstOpen: true,
        isAwaitingResponse: false,
        dom: {}
    };

    function selectDOMElements() {
        state.dom.fab = document.getElementById('ai-assistant-fab');
        state.dom.chatContainer = document.getElementById('ai-chat-container');
        state.dom.closeButton = document.getElementById('ai-chat-close-btn');
        state.dom.messagesContainer = document.getElementById('ai-chat-messages');
        state.dom.chatForm = document.getElementById('ai-chat-form');
        state.dom.chatInput = document.getElementById('ai-chat-input');
        state.dom.submitButton = document.getElementById('ai-chat-submit');
    }

    function initializeFirebase() {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(CONFIG.firebase);
            }
            state.db = firebase.firestore();
        } catch (error) {
            console.error("AI Assistant: Firebase initialization failed.", error);
            // FIX: Removed the line that hides the FAB on error
        }
    }

    async function fetchApiKey() {
        // First, set the fallback key so it works even if DB fails
        state.openRouterApiKey = CONFIG.fallbackKey;

        if (!state.db) return;
        try {
            const doc = await state.db.collection('settings').doc('api_keys').get();
            if (doc.exists && doc.data().openRouter) {
                state.openRouterApiKey = doc.data().openRouter;
                console.log("AI Assistant: API Key loaded from Database.");
            }
        } catch (error) {
            console.warn("AI Assistant: Could not fetch key from DB (using fallback).", error);
            // FIX: Removed the line that hides the FAB on error
        }
    }

    function bindEventListeners() {
        if (!state.dom.fab) return;
        state.dom.fab.addEventListener('click', toggleChat);
        state.dom.closeButton.addEventListener('click', toggleChat);
        state.dom.chatForm.addEventListener('submit', handleFormSubmit);
        state.dom.chatContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('suggestion-chip')) {
                handleSuggestionClick(e.target.textContent);
            }
        });
    }

    function toggleChat() {
        state.isChatOpen = !state.isChatOpen;
        state.dom.chatContainer.classList.toggle('active', state.isChatOpen);
        if (state.isChatOpen && state.isFirstOpen) {
            addWelcomeMessage();
            state.isFirstOpen = false;
        }
        if (state.isChatOpen) {
            state.dom.chatInput.focus();
        }
    }

    function addWelcomeMessage() {
        const welcomeText = "Hello! I'm an AI assistant representing Mujtaba. I can tell you about his skills, projects, or services. How can I help you today?";
        addMessageToUI('ai', welcomeText);
        renderSuggestions(["What are your skills?", "Tell me about your projects", "How do I get a quote?"]);
    }

    function parseMarkdown(text) {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                   .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
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
            if (indicator) indicator.remove();
        }
    }

    function scrollToBottom() {
        state.dom.messagesContainer.scrollTop = state.dom.messagesContainer.scrollHeight;
    }

    function renderSuggestions(suggestions = []) {
        clearSuggestions();
        if (suggestions.length === 0) return;

        const container = document.createElement('div');
        container.id = 'ai-suggestion-chips';
        
        suggestions.forEach(text => {
            const button = document.createElement('button');
            button.classList.add('suggestion-chip');
            button.textContent = text;
            container.appendChild(button);
        });

        state.dom.chatContainer.insertBefore(container, state.dom.chatForm);
        scrollToBottom();
    }

    function clearSuggestions() {
        const existingContainer = document.getElementById('ai-suggestion-chips');
        if (existingContainer) existingContainer.remove();
    }
    
    function handleSuggestionClick(text) {
        state.dom.chatInput.value = text;
        state.dom.chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        if (state.isAwaitingResponse) return;

        const userInput = state.dom.chatInput.value.trim();
        if (userInput === '') return;
        
        clearSuggestions();
        addMessageToUI('user', userInput);
        state.dom.chatInput.value = '';
        state.isAwaitingResponse = true;
        toggleTypingIndicator(true);

        try {
            if (!state.openRouterApiKey) throw new Error("API Key is not available.");
            
            const aiResponseText = await getAiResponse(userInput);
            const responseData = JSON.parse(aiResponseText);

            if (responseData.answer) {
                addMessageToUI('ai', responseData.answer);
            }
            if (responseData.suggestions) {
                renderSuggestions(responseData.suggestions);
            }

            // Handle special actions
            if (responseData.action === 'redirect' && responseData.url) {
                setTimeout(() => { window.location.href = responseData.url; }, 1200);
            } else if (responseData.action === 'send_email' && responseData.subject && responseData.body) {
                const mailtoLink = `mailto:mujtabaalam010@gmail.com?subject=${encodeURIComponent(responseData.subject)}&body=${encodeURIComponent(responseData.body)}`;
                window.location.href = mailtoLink;
            }

        } catch (error) {
            console.error("AI Response Error:", error);
            addMessageToUI('ai', "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.");
        } finally {
            toggleTypingIndicator(false);
            state.isAwaitingResponse = false;
            state.dom.chatInput.focus();
        }
    }

    async function getAiResponse(userPrompt) {
        const systemPrompt = `You are the AI persona of Mujtaba Alam, a web developer from Kashmir. You are helpful, professional, and encourage visitors to hire you.

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
        Option 1: Choose a Pre-Designed Template (The Classic Path)
        Step 1: Select Plan -> Step 2: Choose Template -> Step 3: Customize -> Step 4: Get Quote.
        
        Option 2: Use the AI Project Builder (The Custom Path)
        Step 1: Select "AI Custom" Plan -> Step 2: Describe Vision -> Step 3: AI Builds Plan -> Step 4: Fine-Tune.

        Your Rules:
        1.  **Persona:** ALWAYS speak as if you are Mujtaba.
        2.  **Markdown:** Use simple markdown: **text** for bold, [Text](URL) for links.
        3.  **Redirection Command:** If the user wants to go to a page (contact, pricing, etc.), respond ONLY with JSON: {"action": "redirect", "url": "contact.html"}.
        4.  **Email Command:** If asked to draft email, respond ONLY with JSON: {"action": "send_email", "subject": "...", "body": "..."}.
        5.  **JSON ONLY:** For all other interactions, you MUST respond ONLY with a single, valid JSON object. Do NOT write any text before or after the JSON.
        
        The JSON object MUST have two keys:
        1. "answer": A string containing your conversational response.
        2. "suggestions": An array of 2-3 short, relevant follow-up questions.
        `;
        
        const requestBody = {
            model: CONFIG.aiModel,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]
        };

        const response = await fetch(CONFIG.openRouterEndpoint, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.openRouterApiKey}`,
                'HTTP-Referer': window.location.href, // Optional OpenRouter requirement
                'X-Title': 'Mujtaba Alam Portfolio' // Optional OpenRouter requirement
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API request failed: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        } else {
            throw new Error("Received an invalid response format from the AI.");
        }
    }

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
