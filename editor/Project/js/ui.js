// js/ui.js
import { s } from './state.js';
import { $ } from './utils.js';
import { applyUIPermissions, renderCollaborators } from './auth.js';
import { renderChatHistory } from './ai-core.js';

// Add a manager at the top of the file to track TypeIt instances
const typeitInstances = {
    html: null,
    css: null,
    js: null,
};

export const notify = (msg, type = 'success') => {
    const messageEl = $('notification-message');
    messageEl.textContent = msg;
    const contentEl = messageEl.parentElement;
    contentEl.style.backgroundColor = type === 'success' ? '#F0FFF4' : '#FFF5F5';
    contentEl.style.borderColor = type === 'success' ? '#9AE6B4' : '#FEB2B2';
    toggleModal('notification-modal', true);
};

export const toggleModal = (id, show) => {
    const el = $(id);
    if (!el) return;

    el.classList.toggle('hidden', !show);

    const params = new URLSearchParams(window.location.search);
    const currentUrl = new URL(window.location);

    if (show) {
        params.set('modal', id);
        currentUrl.search = params.toString();
        history.replaceState(null, '', currentUrl.toString());
    } else {
        if (params.has('modal')) {
            params.delete('modal');
            currentUrl.search = params.toString();
            history.replaceState(null, '', currentUrl.toString());
        }
    }
};

export const setLoading = (btn, isLoading, text) => {
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
        btn.dataset.html = btn.innerHTML;
        btn.innerHTML = `<div class="spinner-small"></div> ${text || ''}`;
    } else if (btn.dataset.html) {
        btn.innerHTML = btn.dataset.html;
    }
};

export const showLoader = (isLoading) => {
    $('loader-overlay').classList.toggle('hidden', !isLoading);
    s.isGenerating = isLoading;
    $('generate-btn').disabled = isLoading;
    $('send-chat-btn').disabled = isLoading;
};

export const toggleCardLoader = (projectId, show) => {
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

export const resetWorkspace = () => {
    if (s.projectUnsubscribe) {
        s.projectUnsubscribe();
        s.projectUnsubscribe = null;
    }
    history.pushState({ projectId: null }, 'New Project', window.location.pathname);
    s.html = ''; s.editId = null; s.currentProjectData = null; s.currentUserRole = null;
    s.chatHistory = [{ role: 'ai', text: 'Hello! How can I help you build a website today?' }];
    s.chatMentions = []; // Clear mentions
    renderChatHistory();
    updateChatInputVisual(); // Clear visual input
    renderMentionedAssets(); // Hide thumbnails
    $('preview-frame').srcdoc = '';
    $('save-template-name-input').value = '';
    $('ai-persona-input').value = '';
    ['save-btn', 'code-btn', 'view-new-tab-btn', 'share-btn', 'history-btn'].forEach(id => $(id).classList.add('hidden'));
    $('initial-message').classList.remove('hidden');
    $('save-btn').innerHTML = `<i class="fas fa-save"></i> Save Project`;
    $('preview-frame').classList.add('hidden');
    renderCollaborators([]);
    document.querySelectorAll('#responsive-toggles button').forEach(b => b.classList.remove('active'));
    document.querySelector('#responsive-toggles button[data-size="100%"]').classList.add('active');
    $('preview-frame').style.width = '100%';
    $('preview-frame').style.height = '100%';
    applyUIPermissions('editor');
    $('project-assets-btns').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

export const updateUIForLoadedProject = (projectData) => {
    if (!projectData) return;
    $('initial-message').classList.add('hidden');
    $('preview-frame').classList.remove('hidden');
    ['save-btn', 'code-btn', 'view-new-tab-btn', 'share-btn', 'history-btn'].forEach(id => $(id).classList.remove('hidden'));
    $('save-template-name-input').value = projectData.name;
    $('project-assets-btns').classList.remove('hidden');
    $('save-btn').innerHTML = `<i class="fas fa-sync-alt"></i> Update Project`;
};

export const positionMentionPopup = (popupEl, inputEl) => {
    if (!popupEl || !inputEl) return;
    const inputRect = inputEl.getBoundingClientRect();
    popupEl.style.top = `${inputRect.top - popupEl.offsetHeight - 5}px`;
    popupEl.style.left = `${inputRect.left}px`;
    popupEl.style.width = `${inputRect.width}px`;
};

/**
 * Renders the thumbnail previews for mentioned assets below the chat input.
 */
export const renderMentionedAssets = () => {
    const container = $('mentioned-assets-container');
    if (!container) return;

    if (s.chatMentions.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    container.innerHTML = s.chatMentions.map((mention, index) => {
        let thumbnailHTML = '';
        if (mention.type === 'image') {
            const thumbnailUrl = mention.data.url.replace('/upload/', '/upload/w_32,h_32,c_fill/');
            thumbnailHTML = `<img src="${thumbnailUrl}" alt="${mention.data.name}">`;
        } else if (mention.type === 'collection') {
            thumbnailHTML = `<div class="icon-wrapper"><i class="fas fa-database"></i></div>`;
        }

        return `
            <div class="mention-thumbnail" data-mention-index="${index}">
                <div class="mention-thumbnail-index">${index + 1}</div>
                ${thumbnailHTML}
                <span>${mention.data.name}</span>
                <button class="remove-mention-btn" title="Remove"><i class="fas fa-times"></i></button>
            </div>
        `;
    }).join('');

    container.classList.remove('hidden');
};

/**
 * Renders the rich visual content inside the chat input area based on the raw text and mentions.
 */
export const updateChatInputVisual = () => {
    const inputEl = $('chat-input');
    const visualEl = $('chat-input-visual');
    if (!inputEl || !visualEl) return;

    // Sanitize user text to prevent XSS
    let visualHTML = inputEl.value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Replace the name + marker combos with styled pills, iterating backwards to avoid index issues
    s.chatMentions.slice().reverse().forEach((mention, revIndex) => {
        const index = s.chatMentions.length - 1 - revIndex;
        const marker = `[${index + 1}]`;
        const fullTextToReplace = `${mention.data.name} ${marker}`;
        
        if (visualHTML.includes(fullTextToReplace)) {
            const pillType = mention.type === 'image' ? 'mention-pill--image' : 'mention-pill--db';
            const pillHTML = `<span class="mention-pill ${pillType}">${mention.data.name} <strong>${marker}</strong></span>`;
            visualHTML = visualHTML.replace(fullTextToReplace, pillHTML);
        }
    });

    visualEl.innerHTML = visualHTML.replace(/\n/g, '<br>');
};


export const handleImageMention = (e) => {
    s.activeMentionInput = e.target;
    const text = e.target.value;
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/\B@([a-zA-Z0-9_.-]*)$/);
    const popup = $('image-mention-popup');

    if (mentionMatch) {
        const searchTerm = mentionMatch[1].toLowerCase();
        const projectImages = s.currentProjectData?.projectImages || [];
        const uniqueImageNames = [...new Map(projectImages.map(item => [item.name, item])).values()];
        const filteredImages = uniqueImageNames.filter(img => img.name.toLowerCase().includes(searchTerm));

        if (filteredImages.length > 0) {
            popup.innerHTML = filteredImages.map(img => {
                 const thumbnailUrl = img.url ? img.url.replace('/upload/', '/upload/w_40,h_40,c_fill/') : '';
                 return `<div class="mention-item" data-id="${img.id}" data-name="${img.name}" data-url="${img.url}"><img src="${thumbnailUrl}" alt="${img.name}"><span>${img.name}</span></div>`
            }).join('');
            popup.classList.remove('hidden');
            positionMentionPopup(popup, s.activeMentionInput);
        } else {
            popup.classList.add('hidden');
        }
    } else {
        popup.classList.add('hidden');
    }
};

export const handleCollectionMention = (e) => {
    s.activeMentionInput = e.target;
    const text = e.target.value;
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/\B#([a-zA-Z0-9_.-]*)$/);
    const popup = $('collection-mention-popup');

    if (mentionMatch) {
        const searchTerm = mentionMatch[1].toLowerCase();
        const projectCollections = s.currentProjectData?.projectCollections || [];
        const uniqueCollections = [...new Map(projectCollections.map(item => [item.id, item])).values()];
        const filtered = uniqueCollections.filter(c => c.name.toLowerCase().includes(searchTerm) || c.id.toLowerCase().includes(searchTerm));

        if (filtered.length > 0) {
            popup.innerHTML = filtered.map(c => `
                <div class="mention-item" data-id="${c.id}" data-name="${c.name}"><i class="fas fa-database"></i><div><strong>${c.name}</strong><span>${c.id}</span></div></div>`
            ).join('');
            popup.classList.remove('hidden');
            positionMentionPopup(popup, s.activeMentionInput);
        } else {
            popup.classList.add('hidden');
        }
    } else {
        popup.classList.add('hidden');
    }
};

export const showCode = () => {
    // Always destroy any old, lingering animations to prevent errors
    Object.values(typeitInstances).forEach(instance => {
        if (instance && !instance.is('destroyed')) {
            instance.destroy();
        }
    });

    const doc = new DOMParser().parseFromString(
        s.html || '<!DOCTYPE html><html><body></body></html>',
        'text/html'
    );

    const html = doc.body.innerHTML.trim();
    const css = doc.querySelector('style')?.textContent.trim() || "";
    const js = Array.from(doc.querySelectorAll('script'))
                     .find(script => !script.src)?.textContent.trim() || "";

    // --- NEW CONDITIONAL LOGIC ---
    if (s.isGenerating) {
        // BEHAVIOR 1: If AI is generating, use the typing animation.
        ['html', 'css', 'js'].forEach(lang => {
            const editor = $(`code-${lang}`);
            const lineNumbers = editor.previousElementSibling;
            editor.value = ""; // Clear first
            lineNumbers.value = "";
        });

        typeitInstances.html = new TypeIt('#code-html', {
            strings: [html], speed: 2, cursor: false, lifeLike: false,
            afterStep: () => updateLineNumbers($('code-html'), $('code-html').previousElementSibling),
        }).go();
        typeitInstances.css = new TypeIt('#code-css', {
            strings: [css], speed: 2, cursor: false, lifeLike: false,
            afterStep: () => updateLineNumbers($('code-css'), $('code-css').previousElementSibling),
        }).go();
        typeitInstances.js = new TypeIt('#code-js', {
            strings: [js], speed: 2, cursor: false, lifeLike: false,
            afterStep: () => updateLineNumbers($('code-js'), $('code-js').previousElementSibling),
        }).go();

    } else {
        // BEHAVIOR 2: If AI is idle, show the code instantly.
        $('code-html').value = html;
        $('code-css').value = css;
        $('code-js').value = js;

        // Manually update line numbers for instant view
        updateLineNumbers($('code-html'), $('code-html').previousElementSibling);
        updateLineNumbers($('code-css'), $('code-css').previousElementSibling);
        updateLineNumbers($('code-js'), $('code-js').previousElementSibling);
    }
    // --- END OF CONDITIONAL LOGIC ---

    toggleCodeEditorReadOnly(true);
    toggleModal('code-modal', true);
};


export const updateLineNumbers = (codeEditor, lineNumbers) => {
    const lineCount = codeEditor.value.split('\n').length;
    lineNumbers.value = Array.from({length: lineCount}, (_, i) => i + 1).join('\n');
    lineNumbers.scrollTop = codeEditor.scrollTop;
};

export const toggleCodeEditorReadOnly = (isReadOnly) => {
    const toggleBtn = $('code-edit-toggle');
    document.querySelectorAll('.code-editor').forEach(editor => {
        editor.readOnly = isReadOnly;
        editor.classList.toggle('read-only', isReadOnly);
    });
    toggleBtn.classList.toggle('active', !isReadOnly);
};