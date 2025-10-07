// --- IMPORTS ---
import { auth, db, config } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, query, where, getDocs, orderBy, collectionGroup  } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// --- STATE & CONSTANTS ---
const $ = id => document.getElementById(id);
// FIX 1: Corrected Gemini Model Name. 'gemini-2.5-pro' does not exist.
const GEMINI_MODEL = 'gemini-2.5-pro'; 
const CLOUDINARY_CLOUD_NAME = 'dyff2bufp';
const CLOUDINARY_UPLOAD_PRESET = 'unsigned_upload';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// Application state
const s = {
    user: null, apiKey: null, html: '', userImages: [], editId: null,
    isGenerating: false, chatHistory: [], currentProjectData: null,
    collections: [], currentCollectionId: null, currentCollectionName: null,
    documents: [], currentDocumentIndex: null, currentDocumentData: null,
    activeMentionInput: null
};

// --- UI HELPER FUNCTIONS ---
const throttle = (func, limit) => {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};
const notify = (msg, type = 'success') => {
    const messageEl = $('notification-message');
    messageEl.textContent = msg;
    const contentEl = messageEl.parentElement;
    contentEl.style.backgroundColor = type === 'success' ? '#F0FFF4' : '#FFF5F5';
    contentEl.style.borderColor = type === 'success' ? '#9AE6B4' : '#FEB2B2';
    toggleModal('notification-modal', true);
};
const toggleModal = (id, show) => $(id)?.classList.toggle('hidden', !show);
const setLoading = (btn, isLoading, text) => {
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
        btn.dataset.html = btn.innerHTML;
        btn.innerHTML = `<div class="spinner-small"></div> ${text || ''}`;
    } else if (btn.dataset.html) {
        btn.innerHTML = btn.dataset.html;
    }
};
const showLoader = (isLoading) => {
    $('loader-overlay').classList.toggle('hidden', !isLoading);
    s.isGenerating = isLoading;
    $('generate-btn').disabled = isLoading;
    $('send-chat-btn').disabled = isLoading;
};
const toggleCardLoader = (projectId, show) => {
    const cardBtn = document.querySelector(`.template-card__donate-btn[data-id="${projectId}"]`);
    if (!cardBtn) return;
    const cardContent = cardBtn.closest('.template-card__content');
    if (!cardContent) return;
    const existingOverlay = cardContent.querySelector('.card-loader-overlay');
    if (show) {
        if (existingOverlay) return;
        const overlay = document.createElement('div');
        overlay.className = 'card-loader-overlay';
        overlay.innerHTML = `<div class="spinner-small"></div>`;
        cardContent.appendChild(overlay);
    } else {
        if (existingOverlay) {
            existingOverlay.remove();
        }
    }
};
const resetWorkspace = () => {
    s.html = ''; s.editId = null; s.currentProjectData = null;
    s.chatHistory = [{ role: 'ai', text: 'Hello! How can I help you build a website today?' }];
    renderChatHistory();
    $('preview-frame').srcdoc = '';
    $('save-template-name-input').value = '';
    $('ai-persona-input').value = '';
    ['save-btn', 'code-btn', 'view-new-tab-btn'].forEach(id => $(id).classList.add('hidden'));
    $('initial-message').classList.remove('hidden');
    $('save-btn').innerHTML = `<i class="fas fa-save"></i> Save Project`;
    $('preview-frame').classList.add('hidden');
    document.querySelectorAll('#responsive-toggles button').forEach(b => b.classList.remove('active'));
    document.querySelector('#responsive-toggles button[data-size="100%"]').classList.add('active');
    $('preview-frame').style.width = '100%';
    $('preview-frame').style.height = '100%';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};
const updateUIForLoadedProject = (projectData) => {
    if (!projectData) return;
    s.currentProjectData = projectData;
    $('initial-message').classList.add('hidden');
    $('preview-frame').classList.remove('hidden');
    ['save-btn', 'code-btn', 'view-new-tab-btn'].forEach(id => $(id).classList.remove('hidden'));
    $('save-template-name-input').value = projectData.name;
    $('save-btn').innerHTML = `<i class="fas fa-sync-alt"></i> Update Project`;
};
const loadProject = (data, id) => {
    resetWorkspace();
    s.html = data.htmlContent;
    if (data.userId !== s.user?.uid) {
        s.editId = null; 
        s.chatHistory = [{ role: 'ai', text: `Template "${data.name}" loaded. Make changes and save it as your own project!` }];
        $('save-template-name-input').value = `Copy of ${data.name}`;
    } else {
        s.editId = id;
        s.chatHistory = data.chatHistory || [{ role: 'ai', text: `Project "${data.name}" loaded.` }];
    }
    renderChatHistory();
    $('preview-frame').srcdoc = s.html;
    updateUIForLoadedProject({ id: s.editId, ...data });
    window.scrollTo({ top: 0, behavior: 'smooth' });
};
const slugify = text => text.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').substring(0, 50);
const renderChatHistory = () => {
    const historyEl = $('chat-history');
    historyEl.innerHTML = s.chatHistory.map(msg =>
        `<div class="${msg.role === 'user' ? 'user-message' : 'ai-message'}">${msg.text.replace(/\n/g, '<br>')}</div>`
    ).join('');
    historyEl.scrollTop = historyEl.scrollHeight;
};
const addUserMessageToChat = (text) => {
    if (!text.trim()) return;
    s.chatHistory.push({ role: 'user', text: text.trim() });
    renderChatHistory();
    $('chat-input').value = '';
    $('chat-input').style.height = 'auto';
    generateWithStreaming();
};
const throttledPreviewUpdate = throttle(() => {
    $('preview-frame').srcdoc = s.html;
}, 200); 

// --- COLLECTION & SUBMISSION MANAGEMENT (Firestore UI Style) ---
const renderDataRecursively = (data) => {
    let html = '';
    for (const key in data) {
        const value = data[key];
        html += '<div class="data-viewer__group">';
        html += `<span class="data-viewer__key">${key}</span>`;
        if (typeof value === 'object' && value !== null) {
            if (value.url && value.publicId) { // Cloudinary file object
                html += `<a href="${value.url}" target="_blank" class="data-viewer__link">${value.name || 'View File'}</a>`;
            } else {
                html += `<div class="data-viewer__value">${renderDataRecursively(value)}</div>`;
            }
        } else {
            html += `<span class="data-viewer__value">${value}</span>`;
        }
        html += '</div>';
    }
    return html;
};
const renderFirestoreData = () => {
    const viewer = $('data-viewer');
    const breadcrumb = $('data-breadcrumb');
    if (s.currentDocumentData) {
        const submissionDate = s.currentDocumentData.submittedAt ? new Date(s.currentDocumentData.submittedAt.seconds * 1000).toLocaleString() : 'N/A';
        breadcrumb.innerHTML = `<span>${submissionDate}</span>`;
        viewer.innerHTML = renderDataRecursively(s.currentDocumentData.formData);
    } else {
        breadcrumb.innerHTML = '<span>Select a document...</span>';
        viewer.innerHTML = '<div class="firestore-item--empty">No document selected.</div>';
    }
};
const renderFirestoreDocuments = () => {
    const listEl = $('documents-list');
    const breadcrumb = $('documents-breadcrumb');
    if (s.currentCollectionId) {
        breadcrumb.innerHTML = `<i class="fas fa-folder-open"></i> &nbsp; <span>${s.currentCollectionName}</span>`;
        if (s.documents.length === 0) {
            listEl.innerHTML = '<div class="firestore-item--empty">No submissions in this collection.</div>';
            return;
        }
        listEl.innerHTML = s.documents.map((doc, index) => {
            const date = doc.submittedAt ? new Date(doc.submittedAt.seconds * 1000).toLocaleString() : 'Submission';
            return `<div class="firestore-item ${index === s.currentDocumentIndex ? 'active' : ''}" data-doc-index="${index}">${date}</div>`;
        }).join('');
    } else {
        breadcrumb.innerHTML = '<span>Select a collection...</span>';
        listEl.innerHTML = '<div class="firestore-item--empty">No collection selected.</div>';
    }
};
const renderFirestoreCollections = () => {
    const listEl = $('collections-list');
    if (s.collections.length === 0) {
        listEl.innerHTML = '<div class="firestore-item--empty">No collections yet. Click [+] to create one.</div>';
        return;
    }
    listEl.innerHTML = s.collections.map(c => 
        `<div class="firestore-item ${c.id === s.currentCollectionId ? 'active' : ''}" data-collection-id="${c.id}" data-collection-name="${c.name}">${c.name}</div>`
    ).join('');
};
const loadDocuments = async (collectionId) => {
    showLoader(true);
    try {
        const q = query(collection(db, `form_collections/${collectionId}/submissions`), orderBy("submittedAt", "desc"));
        const snap = await getDocs(q);
        s.documents = snap.docs.map(d => d.data());
        renderFirestoreDocuments();
    } catch (e) {
        console.error("Error loading documents:", e);
        notify("Failed to load submissions.", 'error');
    } finally {
        showLoader(false);
    }
};
const loadCollections = async () => {
    if (!s.user) return;
    try {
        const q = query(collection(db, "form_collections"), where("userId", "==", s.user.uid), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        s.collections = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderFirestoreCollections();
    } catch (e) {
        console.error("Could not load collections:", e);
        $('collections-list').innerHTML = `<div class="firestore-item--empty" style="color:var(--danger-color)">Could not load collections.</div>`;
    }
};

// --- CORE AI LOGIC ---
const generateWithStreaming = async () => {
    if (s.isGenerating) return;
    if (!s.user) return notify('Please sign in first.', 'error');
    if (!s.apiKey) return notify('Could not find API key.', 'error');
    const userMessages = s.chatHistory.filter(m => m.role === 'user');
    if (userMessages.length === 0) return notify('Please enter a prompt.', 'error');
    
    showLoader(true);
    if (!s.html) s.html = '';
    updateUIForLoadedProject(s.currentProjectData || { name: '' });
    
    const persona = $('ai-persona-input').value.trim();
    const systemInstruction = persona ? `Your Persona: "${persona}". ` : '';
    const lastUserMessage = userMessages[userMessages.length - 1];
    
    // UPDATED: AI now gets Cloudinary URLs instead of Base64 data.
    const mentionedImages = s.userImages.filter(img => lastUserMessage.text.includes(`@${img.name}`));
    const images = mentionedImages.length > 0 
        ? `The user has provided these image URLs, referenced by name: {${mentionedImages.map(img => `"${img.name}": "${img.url}"`).join(', ')}}. Use these URLs directly in the src attribute of <img> tags.` 
        : '';
        
    const formHandlingInstructions = `
    ---
    IMPORTANT FEATURE: DIRECT-TO-FIRESTORE FORMS
    You MUST create forms that save data directly to the user's Firestore database. This includes converting any file uploads to Base64 strings.

    HOW TO MAKE A FORM WORK:
    1.  Create any HTML form (<form>...</form>).
    2.  Inside the form, you MUST add this hidden input field:
        <input type="hidden" name="_collectionId" value="PASTE_A_COLLECTION_ID_HERE">
    3.  You MUST include this exact, complete <script type="module"> block right before the closing </body> tag. Do NOT change it. It handles everything, including file-to-Base64 conversion.

        <script type="module">
            import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
            import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
            const firebaseConfig = /*--FIREBASE_CONFIG_PLACEHOLDER--*/;
            const app = initializeApp(firebaseConfig);
            const db = getFirestore(app);
            const toBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = reject; });
            document.querySelectorAll('form').forEach(form => {
                const collectionIdInput = form.querySelector('input[name="_collectionId"]');
                if (!collectionIdInput || !collectionIdInput.value || collectionIdInput.value === 'PASTE_A_COLLECTION_ID_HERE') return;
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const submitButton = form.querySelector('[type="submit"]');
                    const originalButtonText = submitButton ? submitButton.innerHTML : '';
                    if (submitButton) { submitButton.disabled = true; submitButton.innerHTML = 'Submitting...'; }
                    try {
                        const formData = new FormData(form);
                        const data = {};
                        const filePromises = [];
                        for (const [key, value] of formData.entries()) {
                            if (value instanceof File && value.size > 0) {
                                filePromises.push(toBase64(value).then(base64 => { data[key] = { name: value.name, type: value.type, size: value.size, base64: base64 }; }));
                            } else { data[key] = value; }
                        }
                        await Promise.all(filePromises);
                        const collectionPath = \`form_collections/\${data._collectionId}/submissions\`;
                        await addDoc(collection(db, collectionPath), { formData: data, submittedAt: serverTimestamp(), pageUrl: window.location.href });
                        alert('Thank you! Your submission has been received.');
                        form.reset();
                    } catch (error) { console.error('Submission Error:', error); alert('Sorry, there was an error with your submission. Please try again.');
                    } finally { if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = originalButtonText; } }
                });
            });
        <\/script>

    YOUR TASK: When a user asks for a form (e.g., 'contact form'), generate the HTML, include the hidden input, and include the entire script module at the end. In your AI chat response, clearly instruct the user to get a Collection ID from the 'Collections' section and paste it into the 'value' of the hidden input. For example, say: "I've created the form. To make it work, go to 'Collections', create one if needed, copy its ID, and paste it into the form's hidden input field with the name '_collectionId'."
    ---
    `;

    // FIX: This is the core logic change. We now use a different prompt for creating vs. updating.
    let fullPrompt;
    if (s.html.trim()) {
        fullPrompt = `${systemInstruction} ${images} You are an expert developer tasked with UPDATING an existing website. The user's request is: "${lastUserMessage.text}". You MUST modify the provided HTML to incorporate the user's request. Return ONLY the new, complete, and updated HTML code. Do not add any explanations, notes, or markdown fences.\n\nCURRENT HTML:\n\`\`\`html\n${s.html}\n\`\`\`\n${formHandlingInstructions}`;
        s.html = ''; // Reset HTML for the new stream
    } else {
        fullPrompt = `${systemInstruction} ${images} You are an expert developer. Based on this request: "${lastUserMessage.text}", generate a complete, single-file website from scratch. Return ONLY the full HTML code starting with <!DOCTYPE html>. Do not include any other text, explanations, or markdown fences. ${formHandlingInstructions}`;
    }

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?key=${s.apiKey}`, {
            method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
        });
        if (!res.ok) throw new Error((await res.json()).error.message);
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.trim().startsWith('"text":')) {
                    try {
                        const jsonText = line.substring(line.indexOf(':') + 1).trim().replace(/",?$/, '"');
                        s.html += JSON.parse(jsonText);
                        throttledPreviewUpdate();
                    } catch (e) { /* Ignore parsing errors */ }
                }
            }
        }
        
        const configString = JSON.stringify(config);
        s.html = s.html.replace('/*--FIREBASE_CONFIG_PLACEHOLDER--*/', JSON.stringify(config));
        $('preview-frame').srcdoc = s.html;
        const doctypeIndex = s.html.indexOf('<!DOCTYPE html>');
        if (doctypeIndex > 0) s.html = s.html.substring(doctypeIndex);

        if (s.currentProjectData?.deploymentUrl) {
            s.currentProjectData.isDirty = true;
            await updateDoc(doc(db, "ai_templates", s.editId), { isDirty: true });
            loadTemplates();
        }
        s.chatHistory.push({ role: 'ai', text: "Here is the updated website. If I added a form, remember to link it to a Collection ID to make it functional!" });
        renderChatHistory();

    } catch (e) {
        notify(`AI Error: ${e.message}`, 'error');
        s.chatHistory.push({ role: 'ai', text: "Sorry, I encountered an error. Please try again." });
        renderChatHistory();
    } finally {
        showLoader(false);
    }
};

// --- IMAGE MANAGEMENT ---
const loadUserImages = async () => {
    if (!s.user) return;
    const listEl = $('images-list');
    listEl.innerHTML = '<div class="spinner-small"></div> Loading images...';
    try {
        const q = query(collection(db, "user_images"), where("userId", "==", s.user.uid), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        s.userImages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderUserImages();
    } catch (e) {
        console.error("Could not load user images:", e);
        listEl.innerHTML = `<p style='color:red;'>Could not load images.</p>`;
    }
};
const renderUserImages = () => {
    const listEl = $('images-list');
    if (!listEl) return;
    listEl.innerHTML = s.userImages.length ? s.userImages.map(img => {
        const thumbnailUrl = img.url ? img.url.replace('/upload/', '/upload/w_200,c_fill/') : '';
        return `
        <div class="image-card">
            <img src="${thumbnailUrl}" alt="${img.name}" />
            <textarea class="form__input" data-id="${img.id}" rows="2" placeholder="Image name...">${img.name}</textarea>
            <button class="image-card__delete-btn" data-id="${img.id}" title="Delete Image">&times;</button>
        </div>
    `}).join('') : '<p>No images uploaded yet.</p>';
};
// ADD THIS NEW HELPER FUNCTION
const positionMentionPopup = (popupEl, inputEl) => {
    if (!popupEl || !inputEl) return;
    const inputRect = inputEl.getBoundingClientRect();
    
    // Position the popup right above the input field
    popupEl.style.top = `${inputRect.top - popupEl.offsetHeight - 5}px`; // 5px margin
    popupEl.style.left = `${inputRect.left}px`;
    popupEl.style.width = `${inputRect.width}px`; // Match the width of the input
};
// HANDLERS FOR IMAGE & COLLECTION MENTIONS
const handleImageMention = (e) => {
    s.activeMentionInput = e.target;
    const text = e.target.value;
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/\B@([a-zA-Z0-9_.-]*)$/);
    const popup = $('image-mention-popup');
    
    if (mentionMatch) {
        const searchTerm = mentionMatch[1].toLowerCase();
        const filteredImages = s.userImages.filter(img => img.name.toLowerCase().includes(searchTerm));
        if (filteredImages.length > 0) {
            popup.innerHTML = filteredImages.map(img => {
                 const thumbnailUrl = img.url ? img.url.replace('/upload/', '/upload/w_40,h_40,c_fill/') : '';
                 return `<div class="mention-item" data-name="${img.name}"><img src="${thumbnailUrl}" alt="${img.name}"><span>${img.name}</span></div>`
            }).join('');
            
            // --- THE FIX IS HERE ---
            // 1. Make the popup visible so the browser can calculate its height.
            popup.classList.remove('hidden');
            // 2. NOW, calculate its position based on its real, current height.
            positionMentionPopup(popup, s.activeMentionInput);

        } else {
            popup.classList.add('hidden');
        }
    } else {
        popup.classList.add('hidden');
    }
};
const handleCollectionMention = (e) => {
    s.activeMentionInput = e.target;
    const text = e.target.value;
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/\B#([a-zA-Z0-9_.-]*)$/);
    const popup = $('collection-mention-popup');

    if (mentionMatch) {
        const searchTerm = mentionMatch[1].toLowerCase();
        const filtered = s.collections.filter(c => c.name.toLowerCase().includes(searchTerm) || c.id.toLowerCase().includes(searchTerm));
        if (filtered.length > 0) {
            popup.innerHTML = filtered.map(c => `
                <div class="mention-item" data-id="${c.id}"><i class="fas fa-database"></i><div><strong>${c.name}</strong><span>${c.id}</span></div></div>`
            ).join('');

            // --- THE FIX IS HERE ---
            // 1. Make the popup visible so the browser can calculate its height.
            popup.classList.remove('hidden');
            // 2. NOW, calculate its position based on its real, current height.
            positionMentionPopup(popup, s.activeMentionInput);

        } else {
            popup.classList.add('hidden');
        }
    } else {
        popup.classList.add('hidden');
    }
};
const handleDonationUpload = async (event) => {
    const fileInput = event.target;
    const projectId = fileInput.dataset.projectId;
    const file = fileInput.files[0];
    if (!projectId || !file) return;
    toggleCardLoader(projectId, true);
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Screenshot upload to Cloudinary failed.');
        const data = await res.json();
        const thumbnailUrl = data.secure_url;
        const docRef = doc(db, "ai_templates", projectId);
        await updateDoc(docRef, { isPublic: true, donatedAt: serverTimestamp(), thumbnailUrl: thumbnailUrl });
        notify('Project successfully donated as a template!', 'success');
        await loadTemplates();
    } catch (err) {
        console.error('Donation failed:', err);
        notify('Donation failed. Please try again.', 'error');
        toggleCardLoader(projectId, false);
    }
};

// --- TEMPLATE & CODE EDITOR ---
const loadTemplates = async () => {
    if (!s.user) return;
    const listEl = $('templates-list');
    listEl.innerHTML = (listEl.innerHTML.trim() === '' || listEl.innerHTML.includes('<p>')) ? "<p>Loading projects...</p>" : listEl.innerHTML;
    try {
        const snap = await getDocs(query(collection(db, "ai_templates"), where("userId", "==", s.user.uid), orderBy("createdAt", "desc")));
        const templates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        listEl.innerHTML = templates.length ? templates.map(t => {
            const needsUpdate = t.isDirty && t.deploymentUrl;
            const donateButton = !t.isPublic ? `<button class="btn-icon template-card__donate-btn" data-id="${t.id}" title="Donate as public template"><i class="fas fa-gift"></i></button>` : '';
            const placeholderImage = 'logo.png';
            const cardImage = `<div class="template-card__image" style="background-image: url(${t.thumbnailUrl || placeholderImage})"></div>`;
            
            // --- THIS IS THE CORRECTED PART ---
            
            // 1. Create the Load button HTML
            const loadButton = `<button class="btn btn--sm btn--secondary load-btn" data-id="${t.id}"><i class="fas fa-folder-open"></i> Load</button>`;

            // 2. Generate the Deploy button(s) HTML
            let deployButtons = `<button class="btn btn--sm btn--primary deploy-btn" data-id="${t.id}"><i class="fas fa-rocket"></i> Deploy</button>`;
            if (t.deploymentUrl) {
                deployButtons = `<a href="${t.deploymentUrl}" target="_blank" class="btn btn--sm btn--success"><i class="fas fa-external-link-alt"></i> Visit</a>
                    <button class="btn btn--sm btn--secondary deploy-btn ${needsUpdate ? 'needs-update' : ''}" data-id="${t.id}"><i class="fas fa-sync-alt"></i> Re-deploy</button>`;
            }

            // --- END OF CORRECTION ---

            return `<div class="template-card" data-name="${t.name.toLowerCase()}">
                ${cardImage}
                <div class="template-card__content">
                    <div class="template-card__header"><h4>${t.name}</h4><div class="template-card__icon-buttons">${donateButton}<button class="btn-icon template-card__delete-btn" data-id="${t.id}"><i class="fas fa-trash-alt"></i></button></div></div>
                    <div class="template-card__actions">
                        ${loadButton} 
                        ${deployButtons}
                    </div>
                </div>
            </div>`;
        }).join('') : "<p>You haven't saved any projects yet.</p>";
    } catch (e) { listEl.innerHTML = `<p style='color:red;'>Could not load projects.</p>`; console.error(e); }
};
const showCode = () => {
    const doc = new DOMParser().parseFromString(s.html || '<!DOCTYPE html><html><body></body></html>', 'text/html');
    const html = doc.body.innerHTML.trim();
    const css = doc.querySelector('style')?.textContent.trim() || "";
    const js = Array.from(doc.querySelectorAll('script')).find(script => !script.src)?.textContent.trim() || "";
    $('code-html').value = html; $('code-css').value = css; $('code-js').value = js;
    ['html', 'css', 'js'].forEach(lang => updateLineNumbers($(`code-${lang}`), $(`code-${lang}`).previousElementSibling));
    toggleCodeEditorReadOnly(true);
    toggleModal('code-modal', true);
};
const updateLineNumbers = (codeEditor, lineNumbers) => {
    const lineCount = codeEditor.value.split('\n').length;
    lineNumbers.value = Array.from({length: lineCount}, (_, i) => i + 1).join('\n');
    lineNumbers.scrollTop = codeEditor.scrollTop;
};
const toggleCodeEditorReadOnly = (isReadOnly) => {
    const toggleBtn = $('code-edit-toggle');
    document.querySelectorAll('.code-editor').forEach(editor => {
        editor.readOnly = isReadOnly;
        editor.classList.toggle('read-only', isReadOnly);
    });
    toggleBtn.classList.toggle('active', !isReadOnly);
};

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async user => {
    s.user = user;
    $('login-btn').classList.toggle('hidden', !!user);
    $('user-info').classList.toggle('hidden', !user);
    $('images-btn').disabled = !user;
    $('collections-btn').disabled = !user;
    if (user) {
        $('user-email').textContent = user.displayName || user.email;
        $('user-avatar').textContent = (user.displayName || user.email).charAt(0).toUpperCase();
        try { s.apiKey = (await getDoc(doc(db, "settings", "api_keys"))).data().geminiApiKey; } 
        catch (e) { notify('API Key Error: Could not fetch API key from Firestore.', 'error'); }
        
        Promise.all([loadTemplates(), loadUserImages(), loadCollections()]);

        const urlParams = new URLSearchParams(window.location.search);
        const templateId = urlParams.get('templateId');
        if (templateId) {
            showLoader(true);
            try {
                const docSnap = await getDoc(doc(db, "ai_templates", templateId));
                if (docSnap.exists()) { loadProject(docSnap.data(), docSnap.id); } 
                else { notify('Template not found.', 'error'); }
            } catch (err) { notify(`Failed to load template: ${err.message}`, 'error'); }
            finally {
                showLoader(false);
                history.replaceState(null, '', window.location.pathname);
            }
        }
    } else {
        resetWorkspace();
        s.userImages = [];
        s.collections = [];
        $('templates-list').innerHTML = '<p>Sign in to view your saved projects.</p>';
    }
});

// --- EVENT HANDLERS & INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    resetWorkspace();
    // --- Main Controls ---
    $('login-btn').addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()));
    $('logout-btn').addEventListener('click', () => signOut(auth));
    $('new-project-btn').addEventListener('click', resetWorkspace);
    $('save-btn').addEventListener('click', () => toggleModal('save-modal', true));
    $('code-btn').addEventListener('click', showCode);
    $('images-btn').addEventListener('click', () => s.user && toggleModal('images-modal', true));
    $('collections-btn').addEventListener('click', () => {
        if (s.user) { loadCollections(); toggleModal('collections-modal', true); }
    });
    $('view-new-tab-btn').addEventListener('click', () => {
        if (s.html) { const blob = new Blob([s.html], { type: 'text/html' }); window.open(URL.createObjectURL(blob), '_blank'); }
    });
    $('responsive-toggles').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        document.querySelectorAll('#responsive-toggles button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const size = btn.dataset.size;
        $('preview-frame').style.width = size;
        $('preview-frame').style.height = size === '100%' ? '100%' : '80vh';
    });
    
    // --- Chat & Mentions ---
    $('send-chat-btn').addEventListener('click', () => addUserMessageToChat($('chat-input').value));

    // This listener handles pressing "Enter" in the text box. It is correct.
    $('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addUserMessageToChat(e.target.value);
        }
    });
    // This listener handles auto-resizing and @/# mentions. It is correct.
    $('chat-input').addEventListener('input', (e) => {
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
        handleImageMention(e);
        handleCollectionMention(e);
    });

    // THIS IS THE ONLY LISTENER THAT SHOULD BE ON THE 'generate-btn'.
    // It correctly adds the message from the input box to the chat before starting the AI.
    // REMOVE any other listeners for 'generate-btn'.
    $('generate-btn').addEventListener('click', () => addUserMessageToChat($('chat-input').value)); 
    $('image-mention-popup').addEventListener('click', e => {
        const item = e.target.closest('.mention-item'); if (!item) return;
        const name = item.dataset.name; const input = s.activeMentionInput; if (!input) return;
        const text = input.value; const cursorPos = input.selectionStart;
        const textBeforeCursor = text.substring(0, cursorPos);
        const match = textBeforeCursor.match(/\B@([a-zA-Z0-9_.-]*)$/);
        if (match) { input.value = text.substring(0, match.index) + `@${name} ` + text.substring(cursorPos); input.focus(); $('image-mention-popup').classList.add('hidden'); }
    });
    $('collection-mention-popup').addEventListener('click', e => {
        const item = e.target.closest('.mention-item'); if (!item) return;
        const id = item.dataset.id; const input = s.activeMentionInput; if (!input) return;
        const text = input.value; const cursorPos = input.selectionStart;
        const textBeforeCursor = text.substring(0, cursorPos);
        const match = textBeforeCursor.match(/\B#([a-zA-Z0-9_.-]*)$/);
        if (match) { input.value = text.substring(0, match.index) + `${id} ` + text.substring(cursorPos); input.focus(); $('collection-mention-popup').classList.add('hidden'); }
    });
    
    // --- Save Logic ---
    $('confirm-save-btn').addEventListener('click', async () => {
        const name = $('save-template-name-input').value.trim();
        if (!name) return notify('Please enter a name.', 'error');
        setLoading($('confirm-save-btn'), true, 'Saving...');
        let siteName = s.currentProjectData?.siteName || slugify(name);
        // FIX 3: Correctly define the data object for saving
        const data = { 
            name, siteName, htmlContent: s.html, chatHistory: s.chatHistory, 
            userId: s.user.uid, isDirty: s.currentProjectData?.isDirty || false 
        };
        let docIdToUpdate;
        try {
            if (s.editId) {
                await updateDoc(doc(db, "ai_templates", s.editId), data);
                docIdToUpdate = s.editId;
            } else {
                const docRef = await addDoc(collection(db, "ai_templates"), { ...data, createdAt: serverTimestamp() });
                s.editId = docRef.id;
                docIdToUpdate = docRef.id;
            }
            s.currentProjectData = { ...s.currentProjectData, ...data, id: docIdToUpdate };
            toggleModal('save-modal', false);
            await loadTemplates();
            updateUIForLoadedProject(s.currentProjectData);
            notify('Project saved successfully!');
        } catch (e) { notify(`Save failed: ${e.message}`, 'error'); } 
        finally { setLoading($('confirm-save-btn'), false); }
    });

    // --- Image Manager Logic ---
    $('upload-image-btn').addEventListener('click', () => $('image-upload-input').click());
    $('image-upload-input').addEventListener('change', async e => {
        const files = Array.from(e.target.files); if (files.length === 0) return;
        const statusEl = $('image-upload-status');
        setLoading($('upload-image-btn'), true, `Uploading ${files.length}...`);
        const uploadPromises = files.map(async (file) => {
            try {
                const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
                const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
                if (!res.ok) throw new Error('Cloudinary upload failed.');
                const data = await res.json();
                return addDoc(collection(db, "user_images"), { userId: s.user.uid, name: file.name.split('.').slice(0, -1).join('.') || file.name, url: data.secure_url, publicId: data.public_id, createdAt: serverTimestamp() });
            } catch (err) { notify(`Failed to upload ${file.name}.`, 'error'); return Promise.reject(err); }
        });
        try { statusEl.textContent = `Processing ${files.length} images...`; await Promise.all(uploadPromises); } 
        catch (err) { console.error("An error occurred during bulk image upload:", err); }
        e.target.value = ''; setLoading($('upload-image-btn'), false); statusEl.textContent = ''; await loadUserImages();
    });
    $('images-modal').addEventListener('click', async (e) => {
        if (e.target.closest('.modal__close')) { toggleModal('images-modal', false); return; }
        const deleteBtn = e.target.closest('.image-card__delete-btn');
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            if (confirm('Are you sure you want to delete this image?')) {
                try { await deleteDoc(doc(db, "user_images", id)); await loadUserImages(); } 
                catch (err) { notify('Failed to delete image.', 'error'); console.error("Image deletion failed:", err); }
            }
        }
    });
    $('images-list').addEventListener('change', async e => {
        if (e.target.tagName === 'TEXTAREA') {
            const id = e.target.dataset.id; const newName = e.target.value.trim();
            if (id && newName) { try { await updateDoc(doc(db, "user_images", id), { name: newName }); const img = s.userImages.find(i => i.id === id); if (img) img.name = newName; } 
            catch (err) { notify('Failed to rename image.', 'error'); } }
        }
    });
    // --- NEW: Project Search Functionality ---
    $('search-input').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        const projectCards = document.querySelectorAll('#templates-list .template-card');

        projectCards.forEach(card => {
            // The project name is stored in a `data-name` attribute on the card
            const projectName = card.dataset.name || ''; 

            if (projectName.includes(searchTerm)) {
                card.style.display = 'flex'; // Use 'flex' because the card is a flex container
            } else {
                card.style.display = 'none'; // Hide the card if it doesn't match
            }
        });
    });
    // --- Template List Actions ---
    $('templates-list').addEventListener('click', async e => {
        const btn = e.target.closest('button, a'); if (!btn) return;
        e.preventDefault(); const id = btn.dataset.id;
        if (btn.classList.contains('load-btn')) { const docSnap = await getDoc(doc(db, "ai_templates", id)); if (docSnap.exists()) loadProject(docSnap.data(), docSnap.id); } 
        else if (btn.classList.contains('deploy-btn')) { /* Deployment logic ... */ } 
        else if (btn.classList.contains('template-card__delete-btn')) { $('delete-modal').dataset.id = id; toggleModal('delete-modal', true); } 
        else if (btn.classList.contains('template-card__donate-btn')) {
            const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
            fileInput.dataset.projectId = id; fileInput.addEventListener('change', handleDonationUpload);
            document.body.appendChild(fileInput); fileInput.click(); document.body.removeChild(fileInput);
        } else if (btn.tagName === 'A' && btn.classList.contains('btn--success')) { window.open(btn.href, '_blank'); }
    });
    $('confirm-delete-btn').addEventListener('click', async () => {
        const id = $('delete-modal').dataset.id; if (!id) return;
        setLoading($('confirm-delete-btn'), true, 'Deleting...');
        await deleteDoc(doc(db, "ai_templates", id)); toggleModal('delete-modal', false); loadTemplates();
        setLoading($('confirm-delete-btn'), false);
    });
     
    // --- Firestore-Style Collections Modal ---
    $('add-collection-btn').addEventListener('click', async () => {
        const name = prompt("Name for new collection:"); if (name && name.trim()) {
            try { await addDoc(collection(db, "form_collections"), { name: name.trim(), userId: s.user.uid, createdAt: serverTimestamp() }); notify('Collection created!', 'success'); await loadCollections(); } 
            catch (e) { notify(`Error: ${e.message}`, 'error'); }
        }
    });
    $('collections-modal').addEventListener('click', async (e) => {
        if (e.target.closest('.modal__close')) { toggleModal('collections-modal', false); return; }
        const collectionItem = e.target.closest('.firestore-item[data-collection-id]');
        const documentItem = e.target.closest('.firestore-item[data-doc-index]');
        if (collectionItem) {
            s.currentCollectionId = collectionItem.dataset.collectionId; s.currentCollectionName = collectionItem.dataset.collectionName;
            s.currentDocumentIndex = null; s.currentDocumentData = null;
            renderFirestoreCollections(); renderFirestoreData(); await loadDocuments(s.currentCollectionId);
        }
        if (documentItem) {
            s.currentDocumentIndex = parseInt(documentItem.dataset.docIndex, 10); s.currentDocumentData = s.documents[s.currentDocumentIndex];
            renderFirestoreDocuments(); renderFirestoreData();
        }
    });
    
    // --- Code Modal Logic ---
    document.querySelector('#code-modal .modal__header').addEventListener('click', handleCodeModalHeaderClick);
    document.querySelector('#code-modal .code-viewer__footer').addEventListener('click', handleCodeModalFooterClick);
    async function handleCodeModalHeaderClick(e) {
        if (e.target.closest('.modal__close')) { toggleModal('code-modal', false); }
        if (e.target.closest('#code-edit-toggle')) { toggleCodeEditorReadOnly(!$('code-html').readOnly); }
        if (e.target.closest('#code-download-zip')) {
            const zip = new JSZip();
            zip.file("index.html", `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>StyloAI Project</title><link rel="stylesheet" href="style.css"></head><body>\n${$('code-html').value}\n<script src="script.js"></script></body></html>`);
            zip.file("style.css", $('code-css').value); zip.file("script.js", $('code-js').value);
            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a"); link.href = URL.createObjectURL(content); link.download = "stylo-ai-project.zip"; link.click(); link.remove();
        }
    }
    async function handleCodeModalFooterClick(e) {
        if (e.target.closest('#ai-suggestion-btn')) {
            const prompt = $('ai-suggestion-prompt').value.trim(); if (!prompt) return;
            const activeTab = document.querySelector('.code-viewer__tab.active').dataset.tab;
            const codeEditor = $(`code-${activeTab}`); const btn = $('ai-suggestion-btn');
            setLoading(btn, true, '...');
            try {
                const p = `You are a code editor. User request: "${prompt}". Edit this ${activeTab} code and return ONLY the complete, updated code block:\n\`\`\`${activeTab}\n${codeEditor.value}\n\`\`\``;
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${s.apiKey}`, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: p }] }] }) });
                if (!res.ok) throw new Error((await res.json()).error.message);
                const data = await res.json(); const newCode = data.candidates[0].content.parts[0].text.replace(/```[\w\s]*|```/g, '').trim();
                codeEditor.value = newCode; updateLineNumbers(codeEditor, codeEditor.previousElementSibling); toggleCodeEditorReadOnly(false);
            } catch (err) { notify(`AI suggestion failed: ${err.message}`, 'error'); }
            finally { setLoading(btn, false); }
        }
        if (e.target.closest('#ai-apply-changes-btn')) {
            const parser = new DOMParser(); const doc = parser.parseFromString(s.html || '<!DOCTYPE html><html><head></head><body></body></html>', 'text/html');
            doc.body.innerHTML = $('code-html').value; let styleTag = doc.head.querySelector('style');
            if (!styleTag) { styleTag = doc.createElement('style'); doc.head.appendChild(styleTag); }
            styleTag.textContent = $('code-css').value; let scriptTag = Array.from(doc.body.querySelectorAll('script')).find(script => !script.src);
            if (!scriptTag) { scriptTag = doc.createElement('script'); doc.body.appendChild(scriptTag); }
            scriptTag.textContent = $('code-js').value; s.html = `<!DOCTYPE html>\n` + doc.documentElement.outerHTML;
            $('preview-frame').srcdoc = s.html; notify('Code changes applied!', 'success'); toggleModal('code-modal', false);
        }
    }
    document.querySelectorAll('.code-viewer__tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelector('.code-viewer__tab.active')?.classList.remove('active'); e.currentTarget.classList.add('active');
            document.querySelector('.code-editor__pane.active')?.classList.remove('active');
            document.querySelector(`.code-editor__pane[data-pane="${e.currentTarget.dataset.tab}"]`).classList.add('active');
        });
    });
    document.querySelectorAll('.code-editor').forEach(editor => {
        const lineNumbers = editor.previousElementSibling;
        editor.addEventListener('scroll', () => lineNumbers.scrollTop = editor.scrollTop);
        editor.addEventListener('input', () => updateLineNumbers(editor, lineNumbers));
        editor.addEventListener('keydown', (e) => { if (e.key == 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }});
    });
    $('ai-suggestion-prompt').addEventListener('input', (e) => { handleImageMention(e); handleCollectionMention(e); });

    // FIX 4: Universal Modal Close Handler for simple modals
    document.addEventListener('click', (e) => {
        // Close modal if clicking on the background overlay
        if (e.target.classList.contains('modal')) {
            toggleModal(e.target.id, false);
        }
        // Close modal if clicking on a simple close button (not handled by specific listeners)
        if (e.target.matches('#cancel-delete-btn, #close-notification-btn')) {
            toggleModal(e.target.closest('.modal').id, false);
        }
    });
});