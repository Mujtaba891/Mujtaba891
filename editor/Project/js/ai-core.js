// js/ai-core.js
import { doc, updateDoc, collection, addDoc, serverTimestamp, getDocs, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { db, config } from './firebase-config.js';
import { s } from './state.js';
import { $ } from './utils.js';
import { notify, showLoader, updateUIForLoadedProject, updateChatInputVisual, renderMentionedAssets } from './ui.js';
import { GEMINI_MODEL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './constants.js';
import { saveVersion } from './versions.js';

const throttle = (func, limit) => {
    let inThrottle;
    return function () {
        if (!inThrottle) {
            func.apply(this, arguments);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
};

const throttledPreviewUpdate = throttle(() => {
    if ($('preview-frame')) {
        $('preview-frame').srcdoc = s.html;
    }
}, 200);

const detectFeaturesAndIntent = (text = '') => {
    const q = text.toLowerCase();
    const has = (regex) => regex.test(q);
    if (has(/\b(ecommerce|e-commerce|shop|store|sell products)\b/)) return { intent: 'ecommerce', hasForms: true };
    if (has(/\b(landing page|promo|launch page)\b/)) return { intent: 'landing-page', hasForms: has(/\b(contact|form|signup|lead)\b/) };
    if (has(/\b(portfolio|gallery|photographer|designer|artist)\b/)) return { intent: 'portfolio', hasForms: has(/\b(contact|form)\b/) };
    if (has(/\b(blog|articles|news|content)\b/)) return { intent: 'blog', hasForms: has(/\b(subscribe|form)\b/) };
    return { intent: 'generic', hasForms: has(/\b(form|upload|contact|submit|signup|login|register)\b/) };
};
const has3DRequest = (text = '') => /\b3d\b/i.test(text);

export const renderChatHistory = () => {
    const historyEl = $('chat-history');
    if (!historyEl) return;
    historyEl.innerHTML = s.chatHistory.map((msg, index) => {
        if (msg.role === 'user') {
            return `<div class="user-message" data-message-index="${index}">${msg.text.replace(/\n/g, '<br>')}
                        <div class="chat-actions">
                            <button class="btn-icon" data-action="edit" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                            <button class="btn-icon" data-action="copy" title="Copy"><i class="fas fa-copy"></i></button>
                            <button class="btn-icon" data-action="rerun" title="Rerun"><i class="fas fa-sync-alt"></i></button>
                            <button class="btn-icon" data-action="delete" title="Delete"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>`;
        } else {
            return `<div class="ai-message">${msg.text.replace(/\n/g, '<br>')}</div>`;
        }
    }).join('');
    historyEl.scrollTop = historyEl.scrollHeight;
};

const constructPromptWithMentions = (rawText) => {
    let promptForAI = rawText;
    // Process mentions in reverse to avoid index shifting issues during replacement
    s.chatMentions.slice().reverse().forEach((mention, revIndex) => {
        const index = s.chatMentions.length - 1 - revIndex;
        const marker = `[${index + 1}]`;
        const textToReplace = `${mention.data.name} ${marker}`;
        
        let contextInstruction = '';
        if (mention.type === 'image') {
            contextInstruction = `CRITICAL ASSET INSTRUCTION: For the user-mentioned asset "${mention.data.name}", you MUST use this exact URL: ${mention.data.url}. `;
        } else if (mention.type === 'collection') {
            contextInstruction = `CRITICAL DATABASE INSTRUCTION: For any form related to "${mention.data.name}", you MUST use this exact ID in the hidden input: ${mention.data.id}. `;
        }
        
        promptForAI = promptForAI.replace(textToReplace, '').trim();
        promptForAI = contextInstruction + promptForAI;
    });
    return promptForAI;
};

export const addUserMessageToChat = (text) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    s.chatHistory.push({ role: 'user', text: trimmedText });
    renderChatHistory();
    const promptForAI = constructPromptWithMentions(trimmedText);
    const chatInput = $('chat-input');
    if (chatInput) {
        chatInput.value = '';
        chatInput.style.height = 'auto';
    }
    s.chatMentions = [];
    updateChatInputVisual();
    renderMentionedAssets();
    generateWithStreaming(promptForAI);
};

// --- THIS IS THE UPGRADED AI "BRAIN" ---
const advancedSystemInstructions = `
You are 'Stylo Pro', an elite AI web designer and full-stack developer. Your persona is that of a product-aware, user-centric designer from a top-tier agency. Your goal is not just to write code, but to create a 'wow' experience by generating complete, beautiful, and fully functional single-file HTML websites.

--- CORE DIRECTIVES (NON-NEGOTIABLE) ---
1.  **NO MARKDOWN**: Your entire response MUST be raw HTML code only. Start with \`<!DOCTYPE html>\` and end with \`</html>\`.
2.  **NO APOLOGIES / REFUSALS**: You are an expert. Never apologize or say you cannot do something. Fulfill the request using the provided instructions.
3.  **NO LAZINESS**: Never generate placeholder content, short sections, or incomplete code. Every website must be rich, detailed, and production-ready. A landing page must have at least 4-5 distinct, well-designed sections with varied layouts.
4.  **PROACTIVE INFERENCE**: If a user's request is vague (e.g., "make a site for a cat"), you must infer a professional solution. Create a brand name (e.g., "Purrfect Paws"), write compelling marketing copy, choose an appropriate aesthetic, and build a complete site. Never ask for clarification.

--- DESIGN & AESTHETICS PHILOSOPHY ---
1.  **MODERN & CLEAN**: All designs must be modern, responsive, and aesthetically pleasing. Use TailwindCSS via its Play CDN for all styling.
2.  **TYPOGRAPHY & COLOR**: Use professional, high-quality fonts from Google Fonts.
3.  **CRITICAL COLOR RULE**: You are FORBIDDEN from inventing color names (e.g., 'text-primary-blue'). You MUST either:
    a) Use Tailwind's default color palette ONLY (e.g., \`bg-slate-800\`, \`text-sky-400\`).
    b) If you need a custom color, define it within the \`tailwind.config\` script as shown in the TECHNICAL MANDATES.
4.  **PURPOSEFUL ANIMATION**: Websites must feel alive. Use JavaScript \`IntersectionObserver\` to trigger "fade-in" effects on scroll for elements with a \`.scroll-animate\` class.
5.  **IMAGE PLACEHOLDERS**: Never use broken links. Always use Pexels for high-quality, relevant placeholders. Example: \`https://images.pexels.com/photos/1036808/pexels-photo-1036808.jpeg\`.

--- TECHNICAL MANDATES ---
1.  **SINGLE-FILE ARCHITECTURE**: All CSS MUST be in a single \`<style type="text/tailwindcss">\` tag. All JavaScript MUST be in a single \`<script type="module">\` tag at the end of the \`<body>\`.
2.  **JAVASCRIPT LIBRARIES**:
    *   **TailwindCSS**: \`<script src="https://cdn.tailwindcss.com"></script>\` MUST be in the \`<head>\`.
    *   **Tailwind Config**: To use custom colors, you MUST include this script block in the \`<head>\` and define your colors.
        \`\`\`html
        <script>
          tailwind.config = { theme: { extend: { colors: { 'custom-blue': '#243c5a' } } } }
        </script>
        \`\`\`
    *   **Three.js (for 3D)**: If 3D is requested, you MUST include the Three.js importmap and module script.

--- BLUEPRINT FOR **NEW** WEBSITES ---
When creating a website from scratch, you MUST select and adhere to one of these blueprints.

    **BLUEPRINT 1: THE LANDING PAGE / BROCHURE SITE**
    -   **Goal**: Marketing, lead generation, information.
    -   **Required Sections**: Header, Hero, Features/Services, Social Proof, an additional relevant section (e.g., About, FAQ, Gallery), Final CTA, Footer.
    -   **Functionality**: If a form is needed, use the UNIFIED DATA HANDLING PATTERN. No e-commerce features.

    **BLUEPRINT 2: THE E-COMMERCE SITE**
    -   **Goal**: Selling Products.
    -   **Required Sections**: Header (with Cart icon/count), Product Grid, Admin Panel (with form to add products), Shopping Cart modal.
    -   **Functionality**: This is a full application. It MUST use the UNIFIED DATA HANDLING PATTERN for all product, order, and form management.

--- UNIFIED DATA HANDLING PATTERN (CRITICAL FOR FUNCTIONALITY) ---
This is the most important set of instructions. Failure to follow these rules will result in a non-functional website, which is a critical error.

1.  **THE HIDDEN INPUT IS MANDATORY**: Every single form that saves data MUST include a hidden input field: \`<input type="hidden" name="_collectionId" value="THE_SPECIFIC_ID_PROVIDED_IN_THE_PROMPT">\`.
2.  **YOU WILL BE GIVEN THE ID**: The user's prompt will contain one or more "CRITICAL DATABASE INSTRUCTION" lines. These lines provide the exact, unique ID you MUST use. You MUST read these instructions and use the correct ID for the corresponding form.
    *   *Example Instruction:* "CRITICAL DATABASE INSTRUCTION: For any contact form, you MUST use this exact ID: DAvMFvECxMOIQRskwOdW"
    *   *Your Action:* The contact form's HTML must contain \`<input type="hidden" name="_collectionId" value="DAvMFvECxMOIQRskwOdW">\`.
3.  **THE JAVASCRIPT BACKBONE**: If the website has any forms or e-commerce features, you MUST include the following COMPLETE and UNALTERED JavaScript code block within your single \`<script type="module">\` tag.

    \`\`\`javascript
    // --- UNIVERSAL JAVASCRIPT ENGINE v3.1 ---
    import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
    import { getFirestore, collection, doc, addDoc, getDocs, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
    const firebaseConfig = '--FIREBASE_CONFIG_REPLACE_ME--';
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/--CLOUDINARY_NAME--/image/upload';
    const CLOUDINARY_PRESET = '--CLOUDINARY_PRESET--';
    const PROJECT_ID = '--PROJECT_ID--';
    const PRODUCTS_COLLECTION_ID = '--PRODUCTS_ID--';
    const ORDERS_COLLECTION_ID = '--ORDERS_ID--';

    async function handleFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const collectionIdInput = form.querySelector('input[name="_collectionId"]');
        if (!collectionIdInput) return;
        const collectionId = collectionIdInput.value;
        if (!collectionId || collectionId.includes('--')) {
            alert('Error: This form is not connected to a database yet.'); return;
        }
        const btn = form.querySelector('[type="submit"]');
        const originalBtnText = btn.textContent;
        btn.disabled = true; btn.textContent = 'Submitting...';
        try {
            const fd = new FormData(form);
            const dataToSubmit = {};
            for (const [key, value] of fd.entries()) {
                if (key === '_collectionId') continue;
                if (value instanceof File && value.size > 0) {
                    const cloudFd = new FormData();
                    cloudFd.append('file', value);
                    cloudFd.append('upload_preset', CLOUDINARY_PRESET);
                    const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: cloudFd });
                    if (!res.ok) throw new Error(\`Cloudinary Error: \${(await res.json()).error.message}\`);
                    const cloudData = await res.json();
                    dataToSubmit[key] = { name: value.name, url: cloudData.secure_url, publicId: cloudData.public_id };
                } else { dataToSubmit[key] = value; }
            }
            const submissionPath = \`ai_templates/\${PROJECT_ID}/project_collections/\${collectionId}/submissions\`;
            await addDoc(collection(db, submissionPath), { formData: dataToSubmit, createdAt: serverTimestamp() });
            alert('Submission successful!');
            form.reset();
            if (form.closest('#admin-panel')) await refreshAllData();
            if (form.id === 'checkout-form') { cart = []; updateCart(); document.getElementById('cart-modal')?.classList.add('hidden'); }
        } catch (e) { console.error('Submission Error:', e); alert(\`Error: \${e.message}\`);
        } finally { btn.disabled = false; btn.textContent = originalBtnText; }
    }

    async function renderCollectionItems(containerId, collectionId, renderer) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!collectionId || collectionId.includes('--')) {
            container.innerHTML = '<div class="p-4 rounded-md bg-yellow-100 text-yellow-800"><strong>Database Not Connected</strong></div>'; return;
        }
        container.innerHTML = '<p class="text-center text-gray-400 p-4">Loading...</p>';
        try {
            const q = query(collection(db, \`ai_templates/\${PROJECT_ID}/project_collections/\${collectionId}/submissions\`), orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q);
            if (snapshot.empty) { container.innerHTML = '<p class="text-center text-gray-500 p-4">No items found.</p>'; return; }
            container.innerHTML = snapshot.docs.map(doc => renderer(doc.id, doc.data().formData)).join('');
        } catch (e) { console.error(\`Error rendering \${containerId}: \`, e); container.innerHTML = '<p class="text-center text-red-500 p-4">Could not load items.</p>'; }
    }

    const productRenderer = (id, data) => \`<div class="border rounded-lg overflow-hidden shadow-lg group"><img src="\${data.image?.url || 'https://source.unsplash.com/400x300/?product'}" alt="\${data.name}" class="w-full h-48 object-cover"><div class="p-4"><h3 class="font-bold text-lg truncate">\${data.name}</h3><div class="flex justify-between items-center mt-4"><span class="font-bold text-xl">$\${parseFloat(data.price||0).toFixed(2)}</span><button data-id="\${id}" data-name="\${data.name}" data-price="\${data.price}" class="add-to-cart-btn bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Add to Cart</button></div></div></div>\`;
    const adminProductRenderer = (id, data) => \`<div class="flex items-center justify-between p-2 border-b gap-2"><img src="\${data.image?.url || 'https://source.unsplash.com/100x100/?product'}" alt="\${data.name}" class="w-12 h-12 rounded-md object-cover"><span class="flex-1 truncate">\${data.name}</span><span class="font-semibold">$\${parseFloat(data.price||0).toFixed(2)}</span><button data-id="\${id}" class="delete-product-btn text-red-500 hover:text-red-700 p-1">Delete</button></div>\`;
    
    let cart = JSON.parse(localStorage.getItem('stylo-cart') || '[]');
    function updateCart() { localStorage.setItem('stylo-cart', JSON.stringify(cart)); renderCart(); }
    function addToCart(id, name, price) { const existing = cart.find(i => i.id === id); if(existing){ existing.quantity++; } else { cart.push({ id, name, price: parseFloat(price), quantity: 1 }); } updateCart(); }
    function renderCart() {
        const cont = document.getElementById('cart-items'), totalEl = document.getElementById('cart-total'), countEl = document.getElementById('cart-count');
        if (countEl) countEl.textContent = cart.reduce((s, i) => s + i.quantity, 0);
        if (!cont || !totalEl) return;
        if (cart.length === 0) { cont.innerHTML = '<p>Your cart is empty.</p>'; } else {
            cont.innerHTML = cart.map(i => \`<div class="flex justify-between p-2 border-b"><span>\${i.name} (x\${i.quantity})</span><span>$\${(i.price * i.quantity).toFixed(2)}</span></div>\`).join('');
        }
        totalEl.textContent = cart.reduce((s, i) => s + (i.price * i.quantity), 0).toFixed(2);
        const checkoutForm = document.getElementById('checkout-form');
        if(checkoutForm && checkoutForm.elements.items) checkoutForm.elements.items.value = JSON.stringify(cart);
    }

    async function refreshAllData() {
       await Promise.all([
           renderCollectionItems('public-products-list', PRODUCTS_COLLECTION_ID, productRenderer),
           renderCollectionItems('admin-products-list', PRODUCTS_COLLECTION_ID, adminProductRenderer)
       ]);
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('form').forEach(form => form.addEventListener('submit', handleFormSubmit));
        document.querySelectorAll('a[href^="#"]').forEach(anchor => anchor.addEventListener('click', function (e) { e.preventDefault(); document.querySelector(this.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' }); }));
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('animate-fade-in'); observer.unobserve(entry.target); } });
        }, { threshold: 0.1 });
        document.querySelectorAll('.scroll-animate').forEach(el => observer.observe(el));
        if(document.getElementById('public-products-list')) {
            renderCart();
            document.body.addEventListener('click', async (e) => {
                if (e.target.classList.contains('add-to-cart-btn')) { const { id, name, price } = e.target.dataset; addToCart(id, name, price); }
                if (e.target.classList.contains('delete-product-btn')) {
                    if (confirm('Delete this product?')) {
                        try {
                            await deleteDoc(doc(db, \`ai_templates/\${PROJECT_ID}/project_collections/\${PRODUCTS_COLLECTION_ID}/submissions\`, e.target.dataset.id));
                            await refreshAllData();
                        } catch (err) { console.error('Delete error:', err); alert('Failed to delete product.'); }
                    }
                }
            });
            refreshAllData();
        }
    });
    \`\`\`

--- CRITICAL: EDITING & REFINEMENT PROTOCOL ---
When the prompt provides you with "CURRENT HTML", you MUST follow these rules.
1.  **PRESERVE, DON'T REPLACE**: Your primary goal is to act as a surgeon. You MUST take the provided "CURRENT HTML" and apply the user's changes to it.
2.  **NO NEW WEBSITES**: You are FORBIDDEN from generating a new website from scratch in this mode. You MUST NOT discard the existing code, layout, style, or script tags.
3.  **SURGICAL CHANGES**: Locate the most logical place in the existing HTML and make precise changes.
4.  **RETURN THE FULL CODE**: After making your change, you MUST return the COMPLETE, modified HTML file.
5.  **MAINTAIN SCRIPT & STYLE**: The existing \`<style>\` and \`<script>\` tags MUST be preserved perfectly.
`;

export const generateWithStreaming = async (promptForAI) => {
    if (s.isGenerating) return;
    if (!s.user) return notify('Please sign in first.', 'error');
    if (!s.editId) {
        notify('Please create or load a project first.', 'error');
        const newProjectBtn = $('new-project-btn');
        if (newProjectBtn) { newProjectBtn.style.animation = 'pulse-bright 1.5s infinite'; setTimeout(() => { newProjectBtn.style.animation = ''; }, 3000); }
        return;
    }
    if (!s.apiKey) return notify('Could not find API key.', 'error');
    if (s.currentUserRole === 'viewer') return notify("You have view-only access.", "error");

    showLoader(true);
    await updateDoc(doc(db, "ai_templates", s.editId), { isBeingEditedBy: { uid: s.user.uid, name: s.user.displayName || s.user.email } });
    
    const { intent, hasForms } = detectFeaturesAndIntent(promptForAI);
    
    let productsCollectionId = '', ordersCollectionId = '', contactCollectionId = '';
    let databaseInstructions = '';

    if (s.editId && hasForms) {
        try {
            const projectCollections = s.currentProjectData.projectCollections || [];
            const projectCollectionsPath = `ai_templates/${s.editId}/project_collections`;
            const findOrCreateCollection = async (name) => {
                let existingCol = projectCollections.find(c => c.name.toLowerCase() === name.toLowerCase());
                if (existingCol) return existingCol.id;
                const newRef = await addDoc(collection(db, projectCollectionsPath), { name, createdAt: serverTimestamp() });
                s.currentProjectData.projectCollections.push({ id: newRef.id, name });
                notify(`A "${name}" database was created.`, 'success');
                return newRef.id;
            };

            if (intent === 'ecommerce') {
                productsCollectionId = await findOrCreateCollection('Products');
                ordersCollectionId = await findOrCreateCollection('Orders');
            } else if (hasForms) {
                contactCollectionId = await findOrCreateCollection('Leads');
            }

            if (contactCollectionId) databaseInstructions += `\nCRITICAL DATABASE INSTRUCTION: For any contact/leads/inquiry form, use this ID: ${contactCollectionId}`;
            if (productsCollectionId) databaseInstructions += `\nCRITICAL DATABASE INSTRUCTION: For any form that adds new products, use this ID: ${productsCollectionId}`;
            if (ordersCollectionId) databaseInstructions += `\nCRITICAL DATABASE INSTRUCTION: For any checkout/order form, use this ID: ${ordersCollectionId}`;
            
        } catch (error) { notify(`Error setting up databases: ${error.message}`, 'error'); }
    }

    const personaInstruction = $('ai-persona-input')?.value?.trim() ? `Persona: "${$('ai-persona-input').value.trim()}"` : '';
    
    const finalUserTurnText = s.html && s.html.trim()
        ? `${personaInstruction}\n--- EDITING MODE ---\nRequest: "${promptForAI}".${databaseInstructions}\nFollow the "EDITING & REFINEMENT PROTOCOL".\n\nCURRENT HTML:\n${s.html}`
        : `${personaInstruction}\n--- NEW WEBSITE MODE ---\nRequest: "${promptForAI}".${databaseInstructions}\nFollow the most appropriate blueprint.`;

    const requestBody = {
        "contents": [
            { "role": "user", "parts": [{ "text": advancedSystemInstructions }] },
            { "role": "model", "parts": [{ "text": "Understood. I am Stylo Pro. I will follow all instructions to generate a complete, functional HTML file." }] },
            { "role": "user", "parts": [{ "text": finalUserTurnText }] }
        ]
    };
    
    if (s.html && s.html.trim()) {
        $('preview-frame').srcdoc = '<body><p style="font-family: sans-serif; text-align: center; padding: 2rem;">Applying changes...</p></body>';
        s.html = ''; 
    }

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?key=${s.apiKey}`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error?.message || 'Generation failed.');
        }

        let htmlStream = '';
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.includes('"text":')) {
                    try {
                        const jsonText = line.substring(line.indexOf(':') + 1).trim().replace(/",?$/, '"');
                        htmlStream += JSON.parse(jsonText);
                        s.html = htmlStream;
                        throttledPreviewUpdate();
                    } catch (e) { /* Ignore parsing errors */ }
                }
            }
        }
        s.html = htmlStream;

        s.html = s.html
            .replace(/'--FIREBASE_CONFIG_REPLACE_ME--'/g, JSON.stringify(config))
            .replace(/--CLOUDINARY_NAME--/g, CLOUDINARY_CLOUD_NAME)
            .replace(/--CLOUDINARY_PRESET--/g, CLOUDINARY_UPLOAD_PRESET)
            .replace(/const PROJECT_ID = '.*';/g, `const PROJECT_ID = '${s.editId || ''}';`)
            .replace(/--PRODUCTS_ID--/g, productsCollectionId || '')
            .replace(/--ORDERS_ID--/g, ordersCollectionId || '');
            
        const doctypeIndex = s.html.indexOf('<!DOCTYPE html>');
        if (doctypeIndex > 0) s.html = s.html.substring(doctypeIndex);

        if ($('preview-frame')) $('preview-frame').srcdoc = s.html;

        const aiResponseMessage = "Here are the requested refinements. What would you like to do next?";
        s.chatHistory.push({ role: 'ai', text: aiResponseMessage });
        renderChatHistory();

    } catch (e) {
        notify(`AI Error: ${e.message}`, 'error');
        s.chatHistory.push({ role: 'ai', text: "Sorry, I encountered an error. Please try again or rephrase your request." });
        renderChatHistory();
    } finally {
        if (s.editId) {
            try {
                await updateDoc(doc(db, "ai_templates", s.editId), {
                    htmlContent: s.html,
                    chatHistory: s.chatHistory,
                    isBeingEditedBy: null,
                    isDirty: true
                });
                await saveVersion('AI Edit');
            } catch (updateError) {
                notify("Could not save AI-generated changes.", 'error');
            }
        }
        showLoader(false);
    }
};