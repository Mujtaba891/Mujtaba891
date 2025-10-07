// =================================================================================
// StyloAI - AI Website Builder
// Version: 3.0 (Definitive Edition)
// Description: Complete, unabridged application script with all features
//              and critical bug fixes implemented.
// =================================================================================

// --- IMPORTS ---
import { auth, db, config } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// =================================================================================
// --- STATE & CONSTANTS ---
// =================================================================================

const $ = id => document.getElementById(id);
const GEMINI_MODEL = 'gemini-1.5-flash'; // Flash is a great choice for speed and cost-effectiveness in this real-time application.

// Centralized application state
const s = {
    user: null,
    apiKey: null,
    html: '',
    editId: null,
    isGenerating: false,
    chatHistory: [],
    currentProjectData: null,
    userImages: [],
    collections: [],
    currentSubmissions: [],
};

// =================================================================================
// --- CORE AI LOGIC ---
// =================================================================================

/**
 * Main AI generation function. Streams the response from the Gemini API
 * and updates the preview in real-time. Includes context for updates.
 */
const generateWithStreaming = async () => {
    if (s.isGenerating) return;
    if (!s.user) return notify('Please sign in first.', 'error');
    if (!s.apiKey) return notify('Could not find API key. Please check Firebase settings.', 'error');
    const userMessages = s.chatHistory.filter(m => m.role === 'user');
    if (userMessages.length === 0) return notify('Please enter a prompt in the chat.', 'error');

    showLoader(true);
    const previousHtml = s.html; // CRITICAL: Keep previous HTML for the prompt context
    s.html = ''; // Reset current HTML for the new stream
    updateUIForLoadedProject(s.currentProjectData || { name: '' });

    const persona = $('ai-persona-input').value.trim();
    const systemInstruction = persona ? `Your Persona: "${persona}". ` : '';
    const lastUserMessage = userMessages[userMessages.length - 1];

    const mentionedImages = s.userImages.filter(img => lastUserMessage.text.includes(`@${img.name}`));
    const images = mentionedImages.length > 0 ? `The user has uploaded these images, referenced by name: ${mentionedImages.map(img => `"${img.name}"`).join(', ')}. Image data: {${mentionedImages.map(img => `"${img.name}": "${img.base64}"`).join(', ')}} ` : '';

    const formHandlingInstructions = `
    ---
    IMPORTANT FEATURE: DIRECT-TO-FIRESTORE FORMS
    You MUST create forms that save data directly to the user's Firestore database. This includes converting any file uploads to Base64 strings.
    HOW TO MAKE A FORM WORK:
    1.  Create any HTML form (<form>...</form>).
    2.  Inside the form, you MUST add this hidden input field: <input type="hidden" name="_collectionId" value="PASTE_A_COLLECTION_ID_HERE">
    3.  You MUST include this exact, complete <script type="module"> block right before the closing </body> tag. Do NOT change it. It handles everything.
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
                    } catch (error) { console.error('Submission Error:', error); alert('Sorry, there was an error with your submission.');
                    } finally { if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = originalButtonText; } }
                });
            });
        <\/script>
    YOUR TASK: When a user asks for a form, generate the HTML, include the hidden input, and include the entire script module. In your AI chat response, tell the user to get a Collection ID from the 'Collections' section and paste it into the hidden input's 'value'.
    ---`;

    // --- THE CRITICAL FIX ---
    // Conditionally constructs the prompt to either update existing code or generate new code.
    const updateInstruction = previousHtml
        ? `You are UPDATING this existing HTML. Modify it based on the user's request. Here is the current code:\n\`\`\`html\n${previousHtml}\n\`\`\``
        : 'generate a complete, single-file website from scratch based on the user request.';

    const fullPrompt = `${systemInstruction}${images}You are an expert web developer. Your task is to act on this user request: "${lastUserMessage.text}". ${updateInstruction}\n\nReturn ONLY the full HTML code starting with <!DOCTYPE html>. Do not include any other text, explanations, or markdown fences. ${formHandlingInstructions}`;

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
                    } catch (e) { /* Ignore JSON parsing errors on incomplete chunks */ }
                }
            }
        }

        // Finalize the generated HTML
        const configString = JSON.stringify(config);
        s.html = s.html.replace('/*--FIREBASE_CONFIG_PLACEHOLDER--*/', configString);
        const doctypeIndex = s.html.indexOf('<!DOCTYPE html>');
        if (doctypeIndex > 0) s.html = s.html.substring(doctypeIndex);
        $('preview-frame').srcdoc = s.html;

        // Mark deployed project as needing an update
        if (s.currentProjectData?.deploymentUrl) {
            s.currentProjectData.isDirty = true;
            await updateDoc(doc(db, "ai_templates", s.editId), { isDirty: true });
            loadTemplates();
        }

        s.chatHistory.push({ role: 'ai', text: "Here is the updated website. If you used a form, remember to link it to a Collection ID to make it functional!" });
        renderChatHistory();

    } catch (e) {
        notify(`AI Error: ${e.message}`, 'error');
        s.chatHistory.push({ role: 'ai', text: "Sorry, I encountered an error. Please try again." });
        renderChatHistory();
        s.html = previousHtml; // ENHANCEMENT: Restore previous HTML on error to prevent data loss
        $('preview-frame').srcdoc = s.html;
    } finally {
        showLoader(false);
    }
};

// =================================================================================
// --- UI & WORKSPACE MANAGEMENT ---
// =================================================================================

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

const resetWorkspace = () => {
    Object.assign(s, { html: '', editId: null, currentProjectData: null });
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
    if (data.userId !== s.user?.uid) { // Loading a public template as a copy
        s.editId = null;
        s.chatHistory = [{ role: 'ai', text: `Template "${data.name}" loaded. Make changes and save it as your own project!` }];
        $('save-template-name-input').value = `Copy of ${data.name}`;
    } else { // Loading user's own project
        s.editId = id;
        s.chatHistory = data.chatHistory || [{ role: 'ai', text: `Project "${data.name}" loaded.` }];
    }
    renderChatHistory();
    $('preview-frame').srcdoc = s.html;
    updateUIForLoadedProject({ id: s.editId, ...data });
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

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

const slugify = text => text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .substring(0, 50);

// =================================================================================
// --- AUTHENTICATION ---
// =================================================================================

onAuthStateChanged(auth, async user => {
    s.user = user;
    $('login-btn').classList.toggle('hidden', !!user);
    $('user-info').classList.toggle('hidden', !user);
    $('images-btn').disabled = !user;
    $('collections-btn').disabled = !user;

    if (user) {
        $('user-email').textContent = user.displayName || user.email;
        $('user-avatar').textContent = (user.displayName || user.email).charAt(0).toUpperCase();
        try {
            s.apiKey = (await getDoc(doc(db, "settings", "api_keys"))).data().geminiApiKey;
        } catch (e) {
            notify('API Key Error: Could not fetch API key from Firestore.', 'error');
        }

        // OPTIMIZATION: Load user data in parallel for faster startup
        await Promise.all([loadTemplates(), loadUserImages(), loadCollections()]);

        // Check for a template ID in the URL to auto-load a project
        const urlParams = new URLSearchParams(window.location.search);
        const templateId = urlParams.get('templateId');
        if (templateId) {
            showLoader(true);
            try {
                const docSnap = await getDoc(doc(db, "ai_templates", templateId));
                if (docSnap.exists()) {
                    loadProject(docSnap.data(), docSnap.id);
                } else {
                    notify('Template not found.', 'error');
                }
            } catch (err) {
                notify(`Failed to load template: ${err.message}`, 'error');
            } finally {
                showLoader(false);
                history.replaceState(null, '', window.location.pathname); // Clean URL
            }
        }
    } else {
        resetWorkspace();
        s.userImages = [];
        s.collections = [];
        $('templates-list').innerHTML = '<p>Sign in to view your saved projects.</p>';
        $('images-list').innerHTML = '<p>Sign in to manage images.</p>';
        $('collections-list').innerHTML = '<p>Sign in to manage collections.</p>';
    }
});


// =================================================================================
// --- PROJECT / TEMPLATE MANAGEMENT ---
// =================================================================================

const loadTemplates = async () => {
    if (!s.user) return;
    const listEl = $('templates-list');
    listEl.innerHTML = "<p>Loading projects...</p>";
    try {
        const q = query(collection(db, "ai_templates"), where("userId", "==", s.user.uid), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        const templates = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (templates.length === 0) {
            listEl.innerHTML = "<p>You haven't saved any projects yet.</p>";
            return;
        }

        listEl.innerHTML = templates.map(t => {
            const needsUpdate = t.isDirty && t.deploymentUrl;
            const donateButton = !t.isPublic ? `<button class="btn-icon template-card__donate-btn" data-id="${t.id}" title="Donate as public template"><i class="fas fa-gift"></i></button>` : '';
            const cardImage = `<div class="template-card__image" style="background-image: url(${t.thumbnailUrl || 'logo.png'})"></div>`;

            let deployButtons = `<button class="btn btn--sm btn--primary deploy-btn" style="grid-column: 1 / -1;" data-id="${t.id}"><i class="fas fa-rocket"></i> Deploy</button>`;
            if (t.deploymentUrl) {
                deployButtons = `
                    <a href="${t.deploymentUrl}" target="_blank" class="btn btn--sm btn--success"><i class="fas fa-external-link-alt"></i> Visit</a>
                    <button class="btn btn--sm btn--secondary deploy-btn ${needsUpdate ? 'needs-update' : ''}" data-id="${t.id}"><i class="fas fa-sync-alt"></i> Re-deploy</button>`;
            }

            return `<div class="template-card" data-name="${t.name.toLowerCase()}">
                ${cardImage}
                <div class="template-card__content">
                    <div class="template-card__header">
                        <h4>${t.name}</h4>
                        ${donateButton}
                        <button class="btn-icon template-card__delete-btn" data-id="${t.id}"><i class="fas fa-trash-alt"></i></button>
                    </div>
                    <div class="template-card__actions">
                        <button class="btn btn--sm btn--secondary load-btn" data-id="${t.id}"><i class="fas fa-folder-open"></i> Load</button>
                        ${deployButtons}
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        listEl.innerHTML = `<p style='color:red;'>Could not load projects.</p>`;
        console.error("Error loading templates: ", e);
    }
};

const generateAndSaveThumbnail = (docId, htmlContent) => {
    const iframe = $('thumbnail-renderer');
    iframe.onload = () => {
        requestAnimationFrame(() => { // Wait for next paint cycle
            setTimeout(() => { // Additional delay to ensure rendering is complete
                const body = iframe.contentWindow.document.body;
                if (!body || body.innerHTML.trim() === '') {
                    console.error("Thumbnail generation skipped: iframe body is empty.");
                    return;
                }
                html2canvas(body, { scale: 0.5, useCORS: true, logging: false, allowTaint: true })
                    .then(canvas => {
                        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.6);
                        updateDoc(doc(db, "ai_templates", docId), { thumbnailUrl })
                            .then(() => {
                                console.log(`Thumbnail updated for doc [${docId}]`);
                                loadTemplates();
                            });
                    }).catch(err => {
                        console.error(`Thumbnail generation failed for doc [${docId}]:`, err);
                    });
            }, 500);
        });
    };
    iframe.srcdoc = htmlContent;
};


// =================================================================================
// --- IMAGE MANAGEMENT ---
// =================================================================================

const compressImage = (file, quality = 0.7, maxWidth = 1200) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, maxWidth / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL(file.type, quality));
        };
        img.onerror = reject;
    };
    reader.onerror = reject;
});

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
        listEl.innerHTML = `<p style='color:red;'>Could not load images. A database index might be required. Check the console.</p>`;
    }
};

const renderUserImages = () => {
    const listEl = $('images-list');
    if (!listEl) return;
    listEl.innerHTML = s.userImages.length ? s.userImages.map(img => `
        <div class="image-card">
            <img src="${img.base64}" alt="${img.name}" />
            <textarea class="form__input" data-id="${img.id}" rows="2" placeholder="Image name...">${img.name}</textarea>
            <button class="image-card__delete-btn" data-id="${img.id}" title="Delete Image">&times;</button>
        </div>
    `).join('') : '<p>No images uploaded yet. Upload some to get started!</p>';
};

const handleImageMention = (e) => {
    const text = e.target.value;
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/\B@([a-zA-Z0-9_.-]*)$/);
    const popup = $('image-mention-popup');

    if (mentionMatch) {
        const searchTerm = mentionMatch[1].toLowerCase();
        const filteredImages = s.userImages.filter(img => img.name.toLowerCase().includes(searchTerm));
        if (filteredImages.length > 0) {
            popup.innerHTML = filteredImages.map(img => `
                <div class="mention-item" data-name="${img.name}">
                    <img src="${img.base64}" alt="${img.name}">
                    <span>${img.name}</span>
                </div>
            `).join('');
            popup.classList.remove('hidden');
        } else {
            popup.classList.add('hidden');
        }
    } else {
        popup.classList.add('hidden');
    }
};

// =================================================================================
// --- COLLECTION & FORM SUBMISSION MANAGEMENT ---
// =================================================================================

const loadCollections = async () => {
    if (!s.user) return;
    try {
        const q = query(collection(db, "form_collections"), where("userId", "==", s.user.uid), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        s.collections = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCollections();
    } catch (e) {
        console.error("Could not load collections:", e);
        $('collections-list').innerHTML = `<p style='color:red;'>Could not load collections. Check console.</p>`;
    }
};

const renderCollections = () => {
    const listEl = $('collections-list');
    if (!s.user) {
        listEl.innerHTML = '<p>Please sign in to manage collections.</p>';
        return;
    }
    if (s.collections.length === 0) {
        listEl.innerHTML = '<p class="initial-message">You have no collections. Click "New Collection" to create one for your forms!</p>';
        return;
    }
    listEl.innerHTML = s.collections.map(c => `
        <div class="collection-card">
            <div class="collection-card__header">
                <h4>${c.name}</h4>
                <button class="btn-icon collection-card__delete-btn" data-id="${c.id}" title="Delete Collection"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div class="collection-card__id">
                <span>ID:</span>
                <input type="text" readonly value="${c.id}" class="form__input form__input--monospace">
                <button class="btn-icon copy-collection-id-btn" data-id="${c.id}" title="Copy ID"><i class="fas fa-copy"></i></button>
            </div>
            <div class="collection-card__actions">
                <button class="btn btn--secondary btn--sm view-submissions-btn" data-id="${c.id}" data-name="${c.name}"><i class="fas fa-list"></i> View Submissions</button>
            </div>
        </div>
    `).join('');
};

const loadSubmissions = async (collectionId, collectionName) => {
    showLoader(true);
    $('submissions-title').textContent = `Submissions for "${collectionName}"`;
    try {
        const q = query(collection(db, `form_collections/${collectionId}/submissions`), orderBy("submittedAt", "desc"));
        const snap = await getDocs(q);
        s.currentSubmissions = snap.docs.map(d => d.data());
        renderSubmissions();
        $('collections-manager-view').classList.add('hidden');
        $('submissions-view').classList.remove('hidden');
    } catch (e) {
        console.error("Error loading submissions:", e);
        notify("Failed to load submissions.", 'error');
    } finally {
        showLoader(false);
    }
};

const renderSubmissions = () => {
    const containerEl = $('submissions-list');
    if (s.currentSubmissions.length === 0) {
        containerEl.innerHTML = '<p class="initial-message">No submissions yet for this collection.</p>';
        return;
    }

    // Dynamically generate table headers from all unique keys in form submissions for flexibility
    const allKeys = [...new Set(s.currentSubmissions.flatMap(sub => Object.keys(sub.formData)))].filter(key => key !== '_collectionId');

    const tableHTML = `
        <table class="submissions-table">
            <thead>
                <tr>
                    <th>Submitted At</th>
                    ${allKeys.map(key => `<th>${key}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${s.currentSubmissions.map(sub => {
                    const rowData = allKeys.map(key => {
                        const value = sub.formData[key];
                        let cellContent = '';
                        if (typeof value === 'object' && value && value.base64) {
                            cellContent = `<a href="${value.base64}" download="${value.name}" title="Click to download ${value.name}">${value.name}</a>`;
                        } else {
                            cellContent = value || '';
                        }
                        return `<td>${cellContent}</td>`;
                    }).join('');
                    const submissionDate = sub.submittedAt ? new Date(sub.submittedAt.seconds * 1000).toLocaleString() : 'N/A';
                    return `<tr><td>${submissionDate}</td>${rowData}</tr>`;
                }).join('')}
            </tbody>
        </table>`;
    containerEl.innerHTML = tableHTML;
};


const handleCollectionMention = (e) => {
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
                <div class="mention-item" data-id="${c.id}">
                    <i class="fas fa-database"></i>
                    <div>
                        <strong>${c.name}</strong>
                        <span>${c.id}</span>
                    </div>
                </div>
            `).join('');
            popup.classList.remove('hidden');
        } else {
            popup.classList.add('hidden');
        }
    } else {
        popup.classList.add('hidden');
    }
};

// =================================================================================
// --- CODE VIEWER & EDITOR MANAGEMENT ---
// =================================================================================

const showCode = () => {
    const doc = new DOMParser().parseFromString(s.html || '<!DOCTYPE html><html><body></body></html>', 'text/html');
    const html = doc.body.innerHTML.trim();
    const css = doc.querySelector('style')?.textContent.trim() || "";
    // Correctly get only the main script, excluding CDN imports
    const js = Array.from(doc.querySelectorAll('script')).find(script => !script.src && !script.type)?.textContent.trim() || "";
    
    $('code-html').value = html;
    $('code-css').value = css;
    $('code-js').value = js;
    ['html', 'css', 'js'].forEach(lang => {
        const editor = $(`code-${lang}`);
        updateLineNumbers(editor, editor.previousElementSibling);
    });
    toggleCodeEditorReadOnly(true);
    toggleModal('code-modal', true);
};

const updateLineNumbers = (codeEditor, lineNumbers) => {
    if (!codeEditor || !lineNumbers) return;
    const lineCount = codeEditor.value.split('\n').length;
    lineNumbers.value = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
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


// =================================================================================
// --- EVENT LISTENERS & INITIALIZATION ---
// =================================================================================

document.addEventListener('DOMContentLoaded', () => {
    resetWorkspace();

    // --- Main Controls & Auth ---
    $('login-btn').addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()));
    $('logout-btn').addEventListener('click', () => signOut(auth));
    $('new-project-btn').addEventListener('click', resetWorkspace);
    $('save-btn').addEventListener('click', () => toggleModal('save-modal', true));
    $('code-btn').addEventListener('click', showCode);
    $('images-btn').addEventListener('click', () => s.user && toggleModal('images-modal', true));
    $('collections-btn').addEventListener('click', () => s.user && toggleModal('collections-modal', true));
    // --- Chat & Generation ---
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
    // --- Mention Popups ---
    $('image-mention-popup').addEventListener('click', e => {
        const item = e.target.closest('.mention-item');
        if (!item) return;
        const name = item.dataset.name;
        const input = $('chat-input');
        const text = input.value;
        const cursorPos = input.selectionStart;
        const textBeforeCursor = text.substring(0, cursorPos);
        const match = textBeforeCursor.match(/\B@([a-zA-Z0-9_.-]*)$/);
        if (match) {
            input.value = text.substring(0, match.index) + `@${name} ` + text.substring(cursorPos);
            input.focus();
            $('image-mention-popup').classList.add('hidden');
        }
    });
    $('collection-mention-popup').addEventListener('click', e => {
        const item = e.target.closest('.mention-item');
        if (!item) return;
        const id = item.dataset.id;
        const input = $('chat-input');
        const text = input.value;
        const cursorPos = input.selectionStart;
        const textBeforeCursor = text.substring(0, cursorPos);
        const match = textBeforeCursor.match(/\B#([a-zA-Z0-9_.-]*)$/);
        if (match) {
            input.value = text.substring(0, match.index) + `${id} ` + text.substring(cursorPos);
            input.focus();
            $('collection-mention-popup').classList.add('hidden');
        }
    });

    // --- Preview Controls ---
    $('view-new-tab-btn').addEventListener('click', () => {
        if (s.html) {
            const blob = new Blob([s.html], { type: 'text/html' });
            window.open(URL.createObjectURL(blob), '_blank');
        }
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


    // --- Save Modal ---
    $('confirm-save-btn').addEventListener('click', async () => {
        const name = $('save-template-name-input').value.trim();
        if (!name) return notify('Please enter a name.', 'error');
        setLoading($('confirm-save-btn'), true, 'Saving...');
        let siteName = s.currentProjectData?.siteName || slugify(name);
        const data = { name, siteName, htmlContent: s.html, chatHistory: s.chatHistory, userId: s.user.uid, isDirty: !!s.currentProjectData?.deploymentUrl };
        let docIdToUpdate = s.editId;
        try {
            if (s.editId) {
                await updateDoc(doc(db, "ai_templates", s.editId), data);
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
            generateAndSaveThumbnail(docIdToUpdate, s.html);
        } catch (e) {
            notify(`Save failed: ${e.message}`, 'error');
        } finally {
            setLoading($('confirm-save-btn'), false);
        }
    });

    // --- Images Modal ---
    $('upload-image-btn').addEventListener('click', () => $('image-upload-input').click());
    $('image-upload-input').addEventListener('change', async e => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        setLoading($('upload-image-btn'), true, `Uploading ${files.length}...`);
        
        // Process all image uploads in parallel for a huge speed boost
        const uploadPromises = files.map(async file => {
            try {
                const base64 = await compressImage(file);
                return addDoc(collection(db, "user_images"), {
                    userId: s.user.uid,
                    name: file.name.split('.').slice(0, -1).join('.') || file.name,
                    base64,
                    createdAt: serverTimestamp()
                });
            } catch (err) {
                notify(`Failed to upload ${file.name}.`, 'error');
                return Promise.reject(err);
            }
        });

        try {
            await Promise.all(uploadPromises);
        } catch (err) {
            console.error("An error occurred during bulk image upload:", err);
        }

        e.target.value = ''; // Reset file input
        setLoading($('upload-image-btn'), false);
        await loadUserImages();
    });
    $('images-list').addEventListener('click', async e => {
        if (e.target.closest('.image-card__delete-btn')) {
            const id = e.target.closest('.image-card__delete-btn').dataset.id;
            if (confirm('Are you sure you want to delete this image?')) {
                try {
                    await deleteDoc(doc(db, "user_images", id));
                    await loadUserImages();
                } catch (err) {
                    notify('Failed to delete image.', 'error');
                }
            }
        }
    });
    $('images-list').addEventListener('change', async e => {
        if (e.target.tagName === 'TEXTAREA') {
            const id = e.target.dataset.id;
            const newName = e.target.value.trim();
            if (id && newName) {
                try {
                    await updateDoc(doc(db, "user_images", id), { name: newName });
                    const img = s.userImages.find(i => i.id === id);
                    if (img) img.name = newName;
                } catch (err) {
                    notify('Failed to rename image.', 'error');
                }
            }
        }
    });

    // --- Project List Actions ---
    $('templates-list').addEventListener('click', async e => {
        const btn = e.target.closest('button, a');
        if (!btn) return;
        e.preventDefault();
        const id = btn.dataset.id;

        if (btn.classList.contains('load-btn')) {
            const docSnap = await getDoc(doc(db, "ai_templates", id));
            if (docSnap.exists()) loadProject(docSnap.data(), docSnap.id);
        } else if (btn.classList.contains('deploy-btn')) {
            setLoading(btn, true, 'Deploying...');
            try {
                const docSnap = await getDoc(doc(db, "ai_templates", id));
                const pData = docSnap.data();
                const siteName = pData.siteName || slugify(pData.name);
                // Note: The deployment URL is specific to your Google Apps Script
                const res = await fetch("https://script.google.com/macros/s/AKfycbyYdmhzlBHLYw-nK2QfGXxrTFo6EUPsBtCBIqE4xVBC-gJ40x7bVBXSiX6v_5tDNHFDsQ/exec", { method: 'POST', mode: 'cors', body: JSON.stringify({ htmlContent: pData.htmlContent, siteName }) });
                const result = await res.json();
                if (result.success) {
                    await updateDoc(doc(db, "ai_templates", id), { deploymentUrl: `https://${result.url}`, siteName, isDirty: false });
                    loadTemplates();
                    notify('Deployment successful!', 'success');
                } else {
                    throw new Error(result.error || 'Deployment failed.');
                }
            } catch (err) {
                notify(`Deploy failed: ${err.message}`, 'error');
            } finally {
                setLoading(btn, false);
            }
        } else if (btn.classList.contains('template-card__delete-btn')) {
            $('delete-modal').dataset.id = id;
            toggleModal('delete-modal', true);
        } else if (btn.classList.contains('template-card__donate-btn')) {
            if (confirm('Are you sure you want to make this project a public template?')) {
                try {
                    await updateDoc(doc(db, "ai_templates", id), { isPublic: true, donatedAt: serverTimestamp() });
                    notify('Project shared as a template!');
                    loadTemplates();
                } catch (err) {
                    notify(`Could not share template: ${err.message}`, 'error');
                }
            }
        } else if (btn.tagName === 'A' && btn.classList.contains('btn--success')) {
            window.open(btn.href, '_blank');
        }
    });
    $('confirm-delete-btn').addEventListener('click', async () => {
        const id = $('delete-modal').dataset.id;
        if (!id) return;
        setLoading($('confirm-delete-btn'), true, 'Deleting...');
        await deleteDoc(doc(db, "ai_templates", id));
        toggleModal('delete-modal', false);
        loadTemplates();
        setLoading($('confirm-delete-btn'), false);
    });

    // --- Collection Manager Events ---
    $('add-collection-btn').addEventListener('click', async () => {
        const name = prompt("Enter a name for your new collection (e.g., 'Contact Leads'):");
        if (name && name.trim()) {
            try {
                await addDoc(collection(db, "form_collections"), {
                    name: name.trim(),
                    userId: s.user.uid,
                    createdAt: serverTimestamp()
                });
                notify('Collection created!', 'success');
                await loadCollections();
            } catch (e) {
                notify(`Error: ${e.message}`, 'error');
            }
        }
    });
    $('collections-list').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.collection-card__delete-btn');
        const viewBtn = e.target.closest('.view-submissions-btn');
        const copyBtn = e.target.closest('.copy-collection-id-btn');

        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            if (confirm("Are you sure? This deletes the collection document but NOT its submissions (they will be orphaned). This cannot be undone.")) {
                try {
                    // Note: For a production app, a Cloud Function is required for recursive deletes.
                    // This client-side delete is sufficient for this tool's scope.
                    await deleteDoc(doc(db, "form_collections", id));
                    notify('Collection deleted.', 'success');
                    await loadCollections();
                } catch (e) {
                    notify(`Error deleting: ${e.message}`, 'error');
                }
            }
        } else if (viewBtn) {
            await loadSubmissions(viewBtn.dataset.id, viewBtn.dataset.name);
        } else if (copyBtn) {
            try {
                await navigator.clipboard.writeText(copyBtn.dataset.id);
                notify('ID Copied!');
            } catch (err) {
                notify('Failed to copy ID.', 'error');
            }
        }
    });
    $('back-to-collections-btn').addEventListener('click', () => {
        $('collections-manager-view').classList.remove('hidden');
        $('submissions-view').classList.add('hidden');
        s.currentSubmissions = []; // Clear state
    });

    // --- Generic Modal & Code Viewer Logic ---
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', e => { if (e.target === modal) toggleModal(modal.id, false); });
    });
    document.querySelectorAll('.modal__close, #cancel-delete-btn, #close-notification-btn').forEach(btn => {
        btn.addEventListener('click', e => toggleModal(e.target.closest('.modal').id, false));
    });

    document.querySelectorAll('.code-viewer__tab').forEach(tab => tab.addEventListener('click', (e) => {
        document.querySelector('.code-viewer__tab.active').classList.remove('active');
        e.currentTarget.classList.add('active');
        document.querySelector('.code-editor__pane.active').classList.remove('active');
        document.querySelector(`.code-editor__pane[data-pane="${e.currentTarget.dataset.tab}"]`).classList.add('active');
    }));

    document.querySelectorAll('.code-editor').forEach(editor => {
        const lineNumbers = editor.previousElementSibling;
        editor.addEventListener('scroll', () => lineNumbers.scrollTop = editor.scrollTop);
        editor.addEventListener('input', () => updateLineNumbers(editor, lineNumbers));
        editor.addEventListener('keydown', (e) => {
            if (e.key == 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
        });
    });

    $('code-edit-toggle').addEventListener('click', () => {
        toggleCodeEditorReadOnly(!$('code-html').readOnly);
    });

    $('code-download-zip').addEventListener('click', async () => {
        const zip = new JSZip();
        zip.file("index.html", `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale-1.0">\n  <title>My StyloAI Project</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n${$('code-html').value}\n  <script src="script.js"></script>\n</body>\n</html>`);
        zip.file("style.css", $('code-css').value);
        zip.file("script.js", $('code-js').value);
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = "stylo-ai-project.zip";
        link.click();
        link.remove();
    });

    $('ai-suggestion-btn').addEventListener('click', async () => {
        const prompt = $('ai-suggestion-prompt').value.trim();
        if (!prompt) return;
        const activeTab = document.querySelector('.code-viewer__tab.active').dataset.tab;
        const codeEditor = $(`code-${activeTab}`);
        setLoading($('ai-suggestion-btn'), true, '...');
        try {
            const p = `You are a code editor. User request: "${prompt}". Edit this ${activeTab} code and return ONLY the complete, updated code block:\n\`\`\`${activeTab}\n${codeEditor.value}\n\`\`\``;
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${s.apiKey}`, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: p }] }] }) });
            if (!res.ok) throw new Error((await res.json()).error.message);
            const data = await res.json();
            const newCode = data.candidates[0].content.parts[0].text.replace(/```[\w]*|```/g, '').trim();
            codeEditor.value = newCode;
            updateLineNumbers(codeEditor, codeEditor.previousElementSibling);
            toggleCodeEditorReadOnly(false); // Enable editing after AI suggestion
        } catch (e) {
            notify(`AI suggestion failed: ${e.message}`, 'error');
        } finally {
            setLoading($('ai-suggestion-btn'), false);
        }
    });

    $('ai-apply-changes-btn').addEventListener('click', () => {
        const htmlContent = $('code-html').value;
        const cssContent = $('code-css').value;
        const jsContent = $('code-js').value;
        // Reconstruct the full HTML file from its component parts
        s.html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale-1.0">\n  <title>Generated by Stylo AI</title>\n  <style>${cssContent}</style>\n</head>\n<body>\n${htmlContent}\n<script>${jsContent}<\/script>\n</body>\n</html>`;
        $('preview-frame').srcdoc = s.html;
        notify('Code changes applied!', 'success');
        toggleModal('code-modal', false);
    });
});