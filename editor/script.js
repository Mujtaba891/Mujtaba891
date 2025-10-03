// --- IMPORTS ---
import { auth, db } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// --- STATE & CONSTANTS ---
const $ = id => document.getElementById(id);
const GEMINI_MODEL = 'gemini-2.5-pro';

// Application state
const s = {
    user: null,
    apiKey: null,
    html: '',
    userImages: [],
    editId: null,
    isGenerating: false,
    chatHistory: [],
    currentProjectData: null,
};

// Temporary state for modals and secondary operations
let tempAiCode = {};

// --- UI HELPER FUNCTIONS ---

const notify = (msg, type = 'error') => {
    const messageEl = $('notification-message');
    messageEl.textContent = msg;
    messageEl.parentElement.style.backgroundColor = type === 'success' ? '#F0FFF4' : '#FFF5F5';
    messageEl.parentElement.style.borderColor = type === 'success' ? '#9AE6B4' : '#FEB2B2';
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
};

const resetWorkspace = () => {
    s.html = '';
    s.editId = null;
    s.currentProjectData = null;
    s.chatHistory = [{ role: 'ai', text: 'Hello! How can I help you build a website today?' }];
    renderChatHistory();
    $('preview-frame').srcdoc = '';
    $('save-template-name-input').value = '';
    ['save-btn', 'code-btn'].forEach(id => $(id).classList.add('hidden'));
    $('initial-message').classList.remove('hidden');
    $('save-btn').innerHTML = `<i class="fas fa-save"></i> Save Project`;
};

const updateUIForLoadedProject = (projectData) => {
    s.currentProjectData = projectData;
    $('initial-message').classList.add('hidden');
    ['save-btn', 'code-btn'].forEach(id => $(id).classList.remove('hidden'));
    $('save-template-name-input').value = projectData.name;
    $('save-btn').innerHTML = `<i class="fas fa-sync-alt"></i> Update Project`;
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
    generate(); 
};

const generate = async () => {
    if (s.isGenerating || !s.user) return notify('Please sign in first.');
    const userMessages = s.chatHistory.filter(m => m.role === 'user');
    if (userMessages.length === 0) return notify('Please enter a prompt in the chat.');

    showLoader(true);
    const persona = $('ai-persona-input').value.trim();
    const systemInstruction = persona ? `Your Persona: "${persona}". ` : '';
    const images = s.userImages.length > 0 ? `The user has uploaded these images, referenced by name: ${s.userImages.map(img => `"${img.name}"`).join(', ')}. Use them if relevant. Here is the image data: {${s.userImages.map(img => `"${img.name}": "${img.base64}"`).join(', ')}} ` : '';

    const lastUserMessage = userMessages[userMessages.length - 1];
    const fullPrompt = `${systemInstruction}${images}You are an expert developer. Based on this request: "${lastUserMessage.text}", generate a complete, single-file website. ${s.html ? `You are UPDATING this existing HTML: \`\`\`html\n${s.html}\n\`\`\`` : ''}\nReturn ONLY the full HTML code starting with <!DOCTYPE html>. Do not include any other text, explanations, or markdown fences.`;
    
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
        s.chatHistory.push({ role: 'ai', text: "Here is the website based on your request. Let me know if you'd like any changes!" });
        renderChatHistory();
        updateUIForLoadedProject(s.currentProjectData || { name: '' });
    } catch (e) {
        // *** FIX: Improved error handling for rate limits ***
        let userFriendlyMessage = `AI Error: ${e.message}`;
        if (e.message.toLowerCase().includes('quota exceeded')) {
            userFriendlyMessage = "AI Error: You've made too many requests in a short time (quota exceeded). Please wait a minute before trying again. For higher limits, you may need to check your Google AI Platform billing.";
        }
        notify(userFriendlyMessage); 
        s.chatHistory.push({ role: 'ai', text: "Sorry, I encountered an error. Please try again." });
        renderChatHistory();
    } finally {
        showLoader(false);
    }
};

// --- IMAGE MANAGEMENT & @MENTIONS ---

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
        listEl.innerHTML = `<p style='color:red;'>Could not load images. A database index might be required. Please check the developer console for a link to create it.</p>`;
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

const slugify = text => text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .substring(0, 50);

const loadTemplates = async () => {
    if (!s.user) return;
    $('templates-list').innerHTML = "<p>Loading projects...</p>";
    try {
        const snap = await getDocs(query(collection(db, "ai_templates"), where("userId", "==", s.user.uid), orderBy("createdAt", "desc")));
        const templates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        $('templates-list').innerHTML = templates.length ? templates.map(t => {
            let deployButtons = '';
            const needsUpdate = t.isDirty && t.deploymentUrl;

            if (t.deploymentUrl) {
                deployButtons = `
                    <a href="${t.deploymentUrl}" target="_blank" class="btn btn--sm btn--success"><i class="fas fa-external-link-alt"></i> Visit</a>
                    <button class="btn btn--sm btn--secondary deploy-btn ${needsUpdate ? 'needs-update' : ''}" data-id="${t.id}" data-name="${t.name}" data-site-name="${t.siteName || ''}">
                        <i class="fas fa-sync-alt"></i> Re-deploy
                    </button>`;
            } else {
                deployButtons = `<button class="btn btn--sm btn--primary deploy-btn" style="grid-column: 1 / -1;" data-id="${t.id}" data-name="${t.name}"><i class="fas fa-rocket"></i> Deploy</button>`;
            }

            return `<div class="template-card" data-name="${t.name.toLowerCase()}">
                <div class="template-card__header"><h4>${t.name}</h4><button class="btn-icon template-card__delete-btn" data-id="${t.id}"><i class="fas fa-trash-alt"></i></button></div>
                <div class="template-card__actions">
                    <button class="btn btn--sm btn--secondary load-btn" data-id="${t.id}"><i class="fas fa-folder-open"></i> Load</button>
                    ${deployButtons}
                </div>
            </div>`;
        }).join('') : "<p>You haven't saved any projects yet.</p>";
    } catch (e) { $('templates-list').innerHTML = `<p style='color:red;'>Could not load projects.</p>`; console.error(e); }
};

const showCode = () => {
    const html = s.html.match(/<body>([\s\S]*?)<\/body>/)?.[1].trim() || "<!-- No body content -->";
    const css = s.html.match(/<style>([\s\S]*?)<\/style>/)?.[1].trim() || "/* No CSS found */";
    const js = s.html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/)?.[1].trim() || "// No JS found";

    Object.entries({ html, css, js }).forEach(([lang, code]) => {
        const preEl = $(`code-${lang}`);
        preEl.textContent = code;
        preEl.parentElement.dataset.lineNumbers = Array.from({ length: code.split('\n').length }, (_, i) => i + 1).join('\n');
        hljs.highlightElement(preEl);
    });
    $('ai-apply-changes-btn').classList.add('hidden');
    toggleModal('code-modal', true);
};

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async user => {
    s.user = user;
    $('login-btn').classList.toggle('hidden', !!user);
    $('user-info').classList.toggle('hidden', !user);
    if (user) {
        $('user-email').textContent = user.displayName || user.email;
        $('user-avatar').textContent = (user.displayName || user.email).charAt(0).toUpperCase();
        try { s.apiKey = (await getDoc(doc(db, "settings", "api_keys"))).data().geminiApiKey; } catch (e) { notify('API Key Error'); }
        loadTemplates();
        loadUserImages();
    } else {
        resetWorkspace();
        s.userImages = [];
    }
});

// --- EVENT HANDLERS & INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    resetWorkspace(); // Initialize chat on load

    // --- Main Controls ---
    $('login-btn').addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()));
    $('logout-btn').addEventListener('click', () => signOut(auth));
    $('save-btn').addEventListener('click', () => toggleModal('save-modal', true));
    $('code-btn').addEventListener('click', showCode);
    $('images-btn').addEventListener('click', () => {
        if (!s.user) return notify('Please sign in to manage images.');
        toggleModal('images-modal', true);
    });

    // --- Chat & Generation ---
    $('send-chat-btn').addEventListener('click', () => addUserMessageToChat($('chat-input').value));
    $('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addUserMessageToChat(e.target.value);
        }
    });
    $('generate-btn').addEventListener('click', generate);

    // --- Image Mention ---
    $('chat-input').addEventListener('input', handleImageMention);
    $('image-mention-popup').addEventListener('click', e => {
        const item = e.target.closest('.mention-item');
        if (item) {
            const name = item.dataset.name;
            const input = $('chat-input');
            const text = input.value;
            const cursorPos = input.selectionStart;
            const textBeforeCursor = text.substring(0, cursorPos);
            const match = textBeforeCursor.match(/\B@([a-zA-Z0-9_.-]*)$/);
            if (match) {
                const startIndex = match.index;
                input.value = text.substring(0, startIndex) + `@${name} ` + text.substring(cursorPos);
                input.focus();
                $('image-mention-popup').classList.add('hidden');
            }
        }
    });

    // --- Save Project ---
    $('confirm-save-btn').addEventListener('click', async () => {
        const name = $('save-template-name-input').value.trim();
        if (!name) return notify('Please enter a name.');
        setLoading($('confirm-save-btn'), true, '...');

        let siteName = s.currentProjectData?.siteName || slugify(name);
        const data = {
            name,
            siteName,
            htmlContent: s.html,
            userId: s.user.uid,
            isDirty: !!s.currentProjectData?.deploymentUrl
        };

        try {
            if (s.editId) {
                await updateDoc(doc(db, "ai_templates", s.editId), data);
            } else {
                const docRef = await addDoc(collection(db, "ai_templates"), { ...data, createdAt: serverTimestamp() });
                s.editId = docRef.id;
            }
            s.currentProjectData = { ...s.currentProjectData, ...data, id: s.editId };
            toggleModal('save-modal', false);
            loadTemplates();
            updateUIForLoadedProject(s.currentProjectData);
        } catch (e) { notify(`Save failed: ${e.message}`); }
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
                await addDoc(collection(db, "user_images"), {
                    userId: s.user.uid,
                    name: file.name.split('.').slice(0, -1).join('.'),
                    base64,
                    createdAt: new Date()
                });
            } catch (err) {
                notify(`Failed to upload ${file.name}.`);
                console.error(err);
            }
        }
        e.target.value = ''; // Reset file input
        setLoading($('upload-image-btn'), false);
        statusEl.textContent = '';
        await loadUserImages(); // Refresh the list
    });

    $('images-list').addEventListener('click', async e => {
        if (e.target.classList.contains('image-card__delete-btn')) {
            const id = e.target.dataset.id;
            if (confirm('Are you sure you want to delete this image?')) {
                try {
                    await deleteDoc(doc(db, "user_images", id));
                    await loadUserImages();
                } catch (err) {
                    notify('Failed to delete image.');
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
                    notify('Failed to rename image.');
                }
            }
        }
    });

    // --- Template List Actions ---
    $('templates-list').addEventListener('click', async e => {
        const btn = e.target.closest('button, a');
        if (!btn || (btn.tagName === 'A' && !btn.classList.contains('btn'))) return;
        e.preventDefault();

        const id = btn.dataset.id;

        if (btn.classList.contains('load-btn')) {
            const docSnap = await getDoc(doc(db, "ai_templates", id));
            if (docSnap.exists()) {
                resetWorkspace();
                const data = docSnap.data();
                s.html = data.htmlContent;
                s.editId = id;
                s.chatHistory = [{ role: 'ai', text: `Project "${data.name}" loaded. What would you like to do next?` }];
                renderChatHistory();
                $('preview-frame').srcdoc = s.html;
                updateUIForLoadedProject({ id, ...data });
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        if (btn.classList.contains('deploy-btn')) {
            setLoading(btn, true, 'Deploying...');
            try {
                const docSnap = await getDoc(doc(db, "ai_templates", id));
                const projectData = docSnap.data();
                const siteNameToDeploy = projectData.siteName || slugify(projectData.name);

                const res = await fetch("https://script.google.com/macros/s/AKfycbyYdmhzlBHLYw-nK2QfGXxrTFo6EUPsBtCBIqE4xVBC-gJ40x7bVBXSiX6v_5tDNHFDsQ/exec", {
                    method: 'POST', mode: 'cors',
                    body: JSON.stringify({ htmlContent: projectData.htmlContent, siteName: siteNameToDeploy })
                });
                const result = await res.json();
                if (result.success) {
                    await updateDoc(doc(db, "ai_templates", id), {
                        deploymentUrl: `https://${result.url}`,
                        siteName: siteNameToDeploy,
                        isDirty: false
                    });
                    loadTemplates();
                } else { throw new Error(result.error || 'Deployment failed.'); }
            } catch (err) { notify(`Deploy failed: ${err.message}`); }
            finally { setLoading(btn, false); }
        }

        if (btn.classList.contains('template-card__delete-btn')) {
            $('delete-modal').dataset.id = id;
            toggleModal('delete-modal', true);
        }
        
        if (btn.tagName === 'A' && btn.classList.contains('btn--success')) {
            window.open(btn.href, '_blank');
        }
    });

    $('confirm-delete-btn').addEventListener('click', async () => {
        const id = $('delete-modal').dataset.id;
        if (!id) return;
        await deleteDoc(doc(db, "ai_templates", id));
        toggleModal('delete-modal', false);
        loadTemplates();
    });

    // --- MODAL AND CODE VIEWER LOGIC ---
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', e => { if (e.target === modal) toggleModal(modal.id, false); });
    });
    document.querySelectorAll('.modal__close, #cancel-delete-btn, #close-notification-btn').forEach(btn => {
        btn.addEventListener('click', e => toggleModal(e.target.closest('.modal').id, false));
    });

    document.querySelectorAll('.code-viewer__tab').forEach(tab => tab.addEventListener('click', (e) => {
        document.querySelector('.code-viewer__tab.active').classList.remove('active');
        e.currentTarget.classList.add('active');
        document.querySelector('.code-viewer__pane.active').classList.remove('active');
        $(`code-${e.currentTarget.dataset.tab}`).classList.add('active');
    }));

    $('ai-suggestion-btn').addEventListener('click', async () => {
        const prompt = $('ai-suggestion-prompt').value.trim();
        if (!prompt) return;
        const tab = document.querySelector('.code-viewer__tab.active').dataset.tab;
        const codePane = $(`code-${tab}`);
        setLoading($('ai-suggestion-btn'), true, '...');
        try {
            const p = `You are a code editor. User request: "${prompt}". Edit this ${tab} code and return ONLY the complete, updated code block:\n\`\`\`${tab}\n${codePane.textContent}\n\`\`\``;
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${s.apiKey}`, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: p }] }] }) });
            if (!res.ok) throw new Error((await res.json()).error.message);
            const data = await res.json();
            const newCode = data.candidates[0].content.parts[0].text.replace(/```[\w]*|```/g, '').trim();
            tempAiCode[tab] = newCode;
            codePane.textContent = newCode;
            hljs.highlightElement(codePane);
            $('ai-apply-changes-btn').classList.remove('hidden');
        } catch (e) { notify(`AI suggestion failed: ${e.message}`); }
        finally { setLoading($('ai-suggestion-btn'), false); }
    });

    $('ai-apply-changes-btn').addEventListener('click', () => {
        const tab = document.querySelector('.code-viewer__tab.active').dataset.tab;
        if (!tempAiCode[tab]) return;
        const newCode = tempAiCode[tab];
        if (tab === 'html') s.html = s.html.replace(/<body>([\s\S]*?)<\/body>/, `<body>\n${newCode}\n</body>`);
        if (tab === 'css') s.html = s.html.replace(/<style>([\s\S]*?)<\/style>/, `<style>\n${newCode}\n</style>`);
        if (tab === 'js') s.html = s.html.replace(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/, `<script type="module">\n${newCode}\n</script>`);
        $('preview-frame').srcdoc = s.html;
        $('ai-apply-changes-btn').classList.add('hidden');
        notify('Code changes applied!', 'success');
    });
});