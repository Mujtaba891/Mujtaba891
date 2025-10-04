// --- IMPORTS ---
import { auth, db } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// --- STATE & CONSTANTS ---
const $ = id => document.getElementById(id);
const GEMINI_MODEL = 'gemini-2.5-pro';

// Application state
const s = {
    user: null, apiKey: null, html: '', userImages: [], editId: null,
    isGenerating: false, chatHistory: [], currentProjectData: null,
};

// --- UI HELPER FUNCTIONS ---
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
    s.currentProjectData = projectData;
    $('initial-message').classList.add('hidden');
    $('preview-frame').classList.remove('hidden');
    ['save-btn', 'code-btn', 'view-new-tab-btn'].forEach(id => $(id).classList.remove('hidden'));
    $('save-template-name-input').value = projectData.name;
    $('save-btn').innerHTML = `<i class="fas fa-sync-alt"></i> Update Project`;
};
// In script.js

const loadProject = (data, id) => {
    resetWorkspace();
    s.html = data.htmlContent;
    
    // --- THIS IS THE CRITICAL FIX ---
    // If the loaded project's userId is NOT the current user's ID,
    // it means they are loading a public template. We should treat it as a new, unsaved project.
    if (data.userId !== s.user?.uid) {
        s.editId = null; // Clear the ID to force a "Save As New"
        s.chatHistory = [{ role: 'ai', text: `Template "${data.name}" loaded. Make changes and save it as your own project!` }];
        // Set the project name in the input field so the user has a starting point
        $('save-template-name-input').value = `Copy of ${data.name}`;
    } else {
        // Otherwise, it's the user's own project, so load it normally.
        s.editId = id;
        s.chatHistory = data.chatHistory || [{ role: 'ai', text: `Project "${data.name}" loaded.` }];
    }
    renderChatHistory();
    $('preview-frame').srcdoc = s.html;
    updateUIForLoadedProject({ id: s.editId, ...data }); // Use the potentially nulled-out ID
    window.scrollTo({ top: 0, behavior: 'smooth' });
};
const slugify = text => text.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-').substring(0, 50);

// --- THUMBNAIL GENERATION (ROBUST VERSION) ---
const generateAndSaveThumbnail = (docId, htmlContent) => {
    const iframe = $('thumbnail-renderer');
    
    // Set a promise that resolves when the iframe content is loaded
    const iframeLoadPromise = new Promise(resolve => {
        iframe.onload = () => resolve();
        iframe.srcdoc = htmlContent;
    });

    iframeLoadPromise.then(() => {
        // Wait for the next browser paint cycle to ensure content is rendered
        requestAnimationFrame(() => {
            // Add a small extra delay for good measure, especially for images
            setTimeout(() => {
                const body = iframe.contentWindow.document.body;
                if (!body || body.innerHTML.trim() === '') {
                    console.error("Thumbnail generation skipped: iframe body is empty.");
                    return; // Don't try to capture an empty body
                }
                
                html2canvas(body, { 
                    scale: 0.5, 
                    useCORS: true, 
                    logging: false,
                    allowTaint: true // Helps with cross-origin images
                }).then(canvas => {
                    const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.6);
                    updateDoc(doc(db, "ai_templates", docId), { thumbnailUrl })
                        .then(() => {
                            console.log(`Thumbnail updated for doc [${docId}]`);
                            loadTemplates(); // Refresh the project list with the new image
                        });
                }).catch(err => {
                    // This will now clearly log if a specific project fails to render
                    console.error(`Thumbnail generation failed for doc [${docId}]:`, err);
                });
            }, 500);
        });
    });
};

// --- CHAT & AI ---
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
    generate();
};
const generate = async () => {
    if (s.isGenerating) return;
    if (!s.user) return notify('Please sign in first.', 'error');
    if (!s.apiKey) return notify('Could not find API key. Please check Firebase settings.', 'error');
    const userMessages = s.chatHistory.filter(m => m.role === 'user');
    if (userMessages.length === 0) return notify('Please enter a prompt in the chat.', 'error');
    showLoader(true);
    const persona = $('ai-persona-input').value.trim();
    const systemInstruction = persona ? `Your Persona: "${persona}". ` : '';
    const images = s.userImages.length > 0 ? `The user has uploaded these images, referenced by name: ${s.userImages.map(img => `"${img.name}"`).join(', ')}. Image data: {${s.userImages.map(img => `"${img.name}": "${img.base64}"`).join(', ')}} ` : '';
    const lastUserMessage = userMessages[userMessages.length - 1];
    const fullPrompt = `${systemInstruction}${images}You are an expert developer. Based on this request: "${lastUserMessage.text}", generate a complete, single-file website. ${s.html ? `You are UPDATING this existing HTML: \`\`\`html\n${s.html}\n\`\`\`` : ''}\nReturn ONLY the full HTML code starting with <!DOCTYPE html>. Do not include any other text, explanations, or markdown fences. The HTML should be production-ready and include modern CSS within a <style> tag and any necessary JS within a <script> tag.`;
    
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${s.apiKey}`, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }) });
        if (!res.ok) throw new Error((await res.json()).error.message);
        const data = await res.json();
        const rawText = data.candidates[0].content.parts[0].text;
        const codeBlockMatch = rawText.match(/```(?:html)?\s*([\s\S]*?)\s*```/);
        let finalHtml = (codeBlockMatch && codeBlockMatch[1].trim()) ? codeBlockMatch[1].trim() : rawText.trim();
        const doctypeIndex = finalHtml.indexOf('<!DOCTYPE html>');
        if (doctypeIndex > 0) finalHtml = finalHtml.substring(doctypeIndex);
        s.html = finalHtml;
        $('preview-frame').srcdoc = s.html;
        if (s.currentProjectData && s.currentProjectData.deploymentUrl) {
            s.currentProjectData.isDirty = true;
            await updateDoc(doc(db, "ai_templates", s.editId), { isDirty: true });
            loadTemplates();
        }
        s.chatHistory.push({ role: 'ai', text: "Here is the website based on your request. Let me know if you'd like any changes!" });
        renderChatHistory();
        updateUIForLoadedProject(s.currentProjectData || { name: '' });
    } catch (e) {
        let userFriendlyMessage = `AI Error: ${e.message}`;
        if (e.message.toLowerCase().includes('quota exceeded') || e.message.toLowerCase().includes('429')) {
            userFriendlyMessage = "AI Error: You've made too many requests in a short time. Please wait a minute before trying again.";
        }
        notify(userFriendlyMessage, 'error');
        s.chatHistory.push({ role: 'ai', text: "Sorry, I encountered an error. Please try again." });
        renderChatHistory();
    } finally {
        showLoader(false);
    }
};

// --- IMAGE MANAGEMENT ---
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
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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

// --- TEMPLATES & DEPLOYMENT ---
const loadTemplates = async () => {
    if (!s.user) return;
    const listEl = $('templates-list');
    const currentHTML = listEl.innerHTML;
    if (currentHTML.trim() === '' || currentHTML.includes('<p>')) {
        listEl.innerHTML = "<p>Loading projects...</p>";
    }
    try {
        const snap = await getDocs(query(collection(db, "ai_templates"), where("userId", "==", s.user.uid), orderBy("createdAt", "desc")));
        const templates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        listEl.innerHTML = templates.length ? templates.map(t => {
            const needsUpdate = t.isDirty && t.deploymentUrl;
            const donateButton = !t.isPublic ? `<button class="btn-icon template-card__donate-btn" data-id="${t.id}" title="Donate as public template"><i class="fas fa-gift"></i></button>` : '';
            const placeholderImage = 'logo.png';
            const cardImage = `<div class="template-card__image" style="background-image: url(${t.thumbnailUrl || placeholderImage})"></div>`;
            let deployButtons = `<button class="btn btn--sm btn--primary deploy-btn" style="grid-column: 1 / -1;" data-id="${t.id}"><i class="fas fa-rocket"></i> Deploy</button>`;
            if (t.deploymentUrl) {
                deployButtons = `<a href="${t.deploymentUrl}" target="_blank" class="btn btn--sm btn--success"><i class="fas fa-external-link-alt"></i> Visit</a>
                    <button class="btn btn--sm btn--secondary deploy-btn ${needsUpdate ? 'needs-update' : ''}" data-id="${t.id}"><i class="fas fa-sync-alt"></i> Re-deploy</button>`;
            }
            return `<div class="template-card" data-name="${t.name.toLowerCase()}">
                ${cardImage}
                <div class="template-card__content">
                    <div class="template-card__header"><h4>${t.name}</h4>${donateButton}<button class="btn-icon template-card__delete-btn" data-id="${t.id}"><i class="fas fa-trash-alt"></i></button></div>
                    <div class="template-card__actions"><button class="btn btn--sm btn--secondary load-btn" data-id="${t.id}"><i class="fas fa-folder-open"></i> Load</button>${deployButtons}</div>
                </div>
            </div>`;
        }).join('') : "<p>You haven't saved any projects yet.</p>";
    } catch (e) { listEl.innerHTML = `<p style='color:red;'>Could not load projects.</p>`; console.error(e); }
};

// --- CODE EDITOR ---
const showCode = () => {
    const doc = new DOMParser().parseFromString(s.html || '<!DOCTYPE html><html><body></body></html>', 'text/html');
    const html = doc.body.innerHTML.trim();
    const css = doc.querySelector('style')?.textContent.trim() || "";
    const js = doc.querySelector('script:not([src])')?.textContent.trim() || "";
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
    if (user) {
        $('user-email').textContent = user.displayName || user.email;
        $('user-avatar').textContent = (user.displayName || user.email).charAt(0).toUpperCase();
        try {
            s.apiKey = (await getDoc(doc(db, "settings", "api_keys"))).data().geminiApiKey;
        } catch (e) { notify('API Key Error: Could not fetch API key from Firestore.', 'error'); }
        await loadTemplates();
        await loadUserImages();
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
    // --- Chat & Generation ---
    $('send-chat-btn').addEventListener('click', () => addUserMessageToChat($('chat-input').value));
    $('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addUserMessageToChat(e.target.value); }
    });
    $('chat-input').addEventListener('input', (e) => {
        const textarea = e.target;
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
        handleImageMention(e);
    });
    $('generate-btn').addEventListener('click', generate);
    // --- Image Mention ---
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
    // --- Save Project ---
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
        } catch (e) { notify(`Save failed: ${e.message}`, 'error'); } 
        finally { setLoading($('confirm-save-btn'), false); }
    });
    // --- Image Manager Events ---
    $('upload-image-btn').addEventListener('click', () => $('image-upload-input').click());
    $('image-upload-input').addEventListener('change', async e => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const statusEl = $('image-upload-status');
        setLoading($('upload-image-btn'), true, `Uploading ${files.length}...`);
        statusEl.textContent = `Compressing 0/${files.length}...`;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                statusEl.textContent = `Compressing ${i + 1}/${files.length}: ${file.name}...`;
                const base64 = await compressImage(file);
                statusEl.textContent = `Saving ${i + 1}/${files.length}: ${file.name}...`;
                await addDoc(collection(db, "user_images"), { userId: s.user.uid, name: file.name.split('.').slice(0, -1).join('.'), base64, createdAt: serverTimestamp() });
            } catch (err) { notify(`Failed to upload ${file.name}.`, 'error'); }
        }
        e.target.value = '';
        setLoading($('upload-image-btn'), false);
        statusEl.textContent = '';
        await loadUserImages();
    });
    $('images-list').addEventListener('click', async e => {
        if (e.target.closest('.image-card__delete-btn')) {
            const id = e.target.closest('.image-card__delete-btn').dataset.id;
            if (confirm('Are you sure you want to delete this image?')) {
                try { await deleteDoc(doc(db, "user_images", id)); await loadUserImages(); } 
                catch (err) { notify('Failed to delete image.', 'error'); }
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
                } catch (err) { notify('Failed to rename image.', 'error'); }
            }
        }
    });
    // --- Template List Actions ---
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
                const res = await fetch("https://script.google.com/macros/s/AKfycbyYdmhzlBHLYw-nK2QfGXxrTFo6EUPsBtCBIqE4xVBC-gJ40x7bVBXSiX6v_5tDNHFDsQ/exec", { method: 'POST', mode: 'cors', body: JSON.stringify({ htmlContent: pData.htmlContent, siteName }) });
                const result = await res.json();
                if (result.success) {
                    await updateDoc(doc(db, "ai_templates", id), { deploymentUrl: `https://${result.url}`, siteName, isDirty: false });
                    loadTemplates();
                } else { throw new Error(result.error || 'Deployment failed.'); }
            } catch (err) { notify(`Deploy failed: ${err.message}`, 'error'); }
            finally { setLoading(btn, false); }
        } else if (btn.classList.contains('template-card__delete-btn')) {
            $('delete-modal').dataset.id = id;
            toggleModal('delete-modal', true);
        } else if (btn.classList.contains('template-card__donate-btn')) {
            if (confirm('Are you sure you want to make this project a public template?')) {
                try {
                    await updateDoc(doc(db, "ai_templates", id), { isPublic: true, donatedAt: serverTimestamp() });
                    notify('Project shared as a template!');
                    loadTemplates();
                } catch (err) { notify(`Could not share template: ${err.message}`, 'error'); }
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
    // --- MODAL AND CODE VIEWER LOGIC ---
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', e => { if (e.target === modal) toggleModal(modal.id, false); });
    });
    document.querySelectorAll('.modal__close, #cancel-delete-btn, #close-notification-btn').forEach(btn => {
        btn.addEventListener('click', e => toggleModal(e.target.closest('.modal').id, false));
    });
    document.querySelectorAll('.code-viewer__tab').forEach(tab => tab.addEventListener('click', (e) => {
        const tabName = e.currentTarget.dataset.tab;
        document.querySelector('.code-viewer__tab.active').classList.remove('active');
        e.currentTarget.classList.add('active');
        document.querySelector('.code-editor__pane.active').classList.remove('active');
        document.querySelector(`.code-editor__pane[data-pane="${tabName}"]`).classList.add('active');
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
        const isReadOnly = !$('code-html').readOnly;
        toggleCodeEditorReadOnly(isReadOnly);
    });
    $('code-download-zip').addEventListener('click', async () => {
        const zip = new JSZip();
        zip.file("index.html", `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My StyloAI Project</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n${$('code-html').value}\n  <script src="script.js"></script>\n</body>\n</html>`);
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
            toggleCodeEditorReadOnly(false);
        } catch (e) { notify(`AI suggestion failed: ${e.message}`, 'error'); }
        finally { setLoading($('ai-suggestion-btn'), false); }
    });
    $('ai-apply-changes-btn').addEventListener('click', () => {
        const htmlContent = $('code-html').value;
        const cssContent = $('code-css').value;
        const jsContent = $('code-js').value;
        s.html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Generated by Stylo AI</title>\n  <style>${cssContent}</style>\n</head>\n<body>\n${htmlContent}\n<script>${jsContent}<\/script>\n</body>\n</html>`;
        $('preview-frame').srcdoc = s.html;
        notify('Code changes applied!', 'success');
        toggleModal('code-modal', false);
    });
});
