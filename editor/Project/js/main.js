// js/main.js
import { db } from './firebase-config.js';
import { doc, getDoc, deleteDoc, collection, addDoc, updateDoc, serverTimestamp, query, where, getDocs, arrayUnion, arrayRemove, deleteField } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { s } from './state.js';
import { $, slugify } from './utils.js';
import { notify, toggleModal, setLoading, showLoader, resetWorkspace, handleImageMention, handleCollectionMention, showCode, toggleCodeEditorReadOnly, updateLineNumbers, updateChatInputVisual, renderMentionedAssets, } from './ui.js';
import { initAuth, handleSignIn, handleSignOut } from './auth.js';
import { addUserMessageToChat, renderChatHistory } from './ai-core.js';
import { handleImageRename, renderProjectImages } from './images.js';
import { renderFirestoreData, loadDocuments, renderFirestoreDocuments, renderProjectCollections } from './firestore.js';
import { createNewProject, loadProject, loadTemplates, saveProject, loadProjectImages, loadProjectCollections, handleDonationUpload, loadSharedProjects } from './templates.js';
import { loadVersionHistory, restoreVersion } from './versions.js';
import { CLOUDINARY_URL, CLOUDINARY_UPLOAD_PRESET } from './constants.js';
import { AVATAR_LIST } from './avatars.js';

// --- ROUTING ---
export const handleRouteChange = async () => {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('project');
    const modalId = params.get('modal');

    if (projectId && projectId !== s.editId && s.user) {
        showLoader(true);
        try {
            const docSnap = await getDoc(doc(db, "ai_templates", projectId));
            if (docSnap.exists()) {
                loadProject(docSnap.data(), docSnap.id);
            } else {
                notify('Project not found.', 'error');
                history.replaceState(null, 'New Project', window.location.pathname);
                resetWorkspace();
            }
        } catch (err) {
            notify(`Error loading project: ${err.message}`, 'error');
            resetWorkspace();
        } finally {
            showLoader(false);
        }
    } else if (!projectId && s.editId) {
        resetWorkspace();
    }

    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    if (modalId && $(modalId)) {
        if (modalId === 'code-modal') {
             showCode();
        } else if (modalId === 'version-history-modal' && s.editId) {
             loadVersionHistory();
             toggleModal('version-history-modal', true);
        } else {
            toggleModal(modalId, true);
        }
    }
};

// --- INITIALIZATION & EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    renderChatHistory();

    // Main Controls
    $('login-btn').addEventListener('click', handleSignIn);
    $('logout-btn').addEventListener('click', handleSignOut);
    $('new-project-btn').addEventListener('click', () => {
        $('new-project-name-input').value = '';
        toggleModal('new-project-modal', true);
    });
    $('confirm-create-project-btn').addEventListener('click', async () => {
        const name = $('new-project-name-input').value.trim();
        if (!name) return notify('Please enter a project name.', 'error');
        const btn = $('confirm-create-project-btn');
        setLoading(btn, true, 'Creating...');
        const success = await createNewProject(name);
        if (success) toggleModal('new-project-modal', false);
        setLoading(btn, false);
    });
    $('save-btn').addEventListener('click', () => toggleModal('save-modal', true));
    $('code-btn').addEventListener('click', showCode);
    $('history-btn').addEventListener('click', () => {
        if (s.editId) {
            loadVersionHistory();
            $('version-preview-frame').srcdoc = '';
            $('version-preview-title').textContent = 'Select a version to preview';
            $('restore-version-btn').disabled = true;
            s.selectedVersionId = null;
            toggleModal('version-history-modal', true);
        }
    });
    $('view-new-tab-btn').addEventListener('click', () => {
        if (s.html) { const blob = new Blob([s.html], { type: 'text/html' }); window.open(URL.createObjectURL(blob), '_blank'); }
    });
    $('responsive-toggles').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        document.querySelectorAll('#responsive-toggles button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('preview-frame').style.width = btn.dataset.size;
        $('preview-frame').style.height = btn.dataset.size === '100%' ? '100%' : '80vh';
    });
     // --- NEW: Chat Message Action Handler ---
    $('chat-history').addEventListener('click', (e) => {
        const actionBtn = e.target.closest('.chat-actions .btn-icon');
        if (!actionBtn) return;

        const messageEl = actionBtn.closest('.user-message');
        const messageIndex = parseInt(messageEl.dataset.messageIndex, 10);
        const message = s.chatHistory[messageIndex];
        const action = actionBtn.dataset.action;

        switch (action) {
            case 'edit':
                // Put the message text back into the input and focus it
                const chatInput = $('chat-input');
                chatInput.value = message.text;
                chatInput.focus();
                // We'll remove the message from history, so it feels like editing
                s.chatHistory.splice(messageIndex, 1);
                renderChatHistory();
                updateChatInputVisual(); // Update the visual display
                break;

            case 'copy':
                navigator.clipboard.writeText(message.text).then(() => {
                    notify('Message copied to clipboard!', 'success');
                }).catch(err => {
                    console.error('Copy failed:', err);
                    notify('Could not copy message.', 'error');
                });
                break;

            case 'rerun':
                // Remove all subsequent messages and re-run this one
                s.chatHistory.splice(messageIndex + 1);
                addUserMessageToChat(message.text);
                break;

            case 'delete':
                // Remove this message and the AI's response that follows it
                if (s.chatHistory[messageIndex + 1]?.role === 'ai') {
                    s.chatHistory.splice(messageIndex, 2);
                } else {
                    s.chatHistory.splice(messageIndex, 1);
                }
                renderChatHistory();
                break;
        }
    });

    // Chat & Mentions
    $('send-chat-btn').addEventListener('click', () => addUserMessageToChat($('chat-input').value));
    $('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addUserMessageToChat(e.target.value); }
    });
    $('chat-input').addEventListener('input', (e) => {
        updateChatInputVisual();
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
        handleImageMention(e);
        handleCollectionMention(e);
    });
    $('chat-input').addEventListener('scroll', () => {
        const visualEl = $('chat-input-visual');
        if (visualEl) visualEl.scrollTop = $('chat-input').scrollTop;
    });
    $('generate-btn').addEventListener('click', () => addUserMessageToChat($('chat-input').value));

   $('image-mention-popup').addEventListener('click', e => {
        const item = e.target.closest('.mention-item'); if (!item) return;
        const input = s.activeMentionInput; if (!input) return;
        s.chatMentions.push({ 
            type: 'image', 
            data: { id: item.dataset.id, name: item.dataset.name, url: item.dataset.url } 
        });
        const mentionIndex = s.chatMentions.length;
        const text = input.value; 
        const cursorPos = input.selectionStart;
        const match = text.substring(0, cursorPos).match(/\B@([a-zA-Z0-9_.-]*)$/);
        if (match) { 
            input.value = text.substring(0, match.index) + `${item.dataset.name} [${mentionIndex}] ` + text.substring(cursorPos); 
        }
        input.focus(); 
        updateChatInputVisual();
        renderMentionedAssets();
        $('image-mention-popup').classList.add('hidden'); 
    });

    $('collection-mention-popup').addEventListener('click', e => {
        const item = e.target.closest('.mention-item'); if (!item) return;
        const input = s.activeMentionInput; if (!input) return;
        s.chatMentions.push({
            type: 'collection',
            data: { id: item.dataset.id, name: item.dataset.name }
        });
        const mentionIndex = s.chatMentions.length;
        const text = input.value;
        const cursorPos = input.selectionStart;
        const match = text.substring(0, cursorPos).match(/\B#([a-zA-Z0-9_.-]*)$/);
        if (match) {
            input.value = text.substring(0, match.index) + `${item.dataset.name} [${mentionIndex}] ` + text.substring(cursorPos);
        }
        input.focus();
        updateChatInputVisual();
        renderMentionedAssets();
        $('collection-mention-popup').classList.add('hidden');
    });

     $('mentioned-assets-container').addEventListener('click', e => {
        const removeBtn = e.target.closest('.remove-mention-btn');
        if (!removeBtn) return;
        const thumbnail = removeBtn.closest('.mention-thumbnail');
        const indexToRemove = parseInt(thumbnail.dataset.mentionIndex, 10);

        const mentionToRemove = s.chatMentions[indexToRemove];
        const textToRemove = `${mentionToRemove.data.name} [${indexToRemove + 1}]`;
        
        let currentText = $('chat-input').value;
        currentText = currentText.replace(textToRemove, '');

        s.chatMentions.splice(indexToRemove, 1);

        for (let i = indexToRemove; i < s.chatMentions.length; i++) {
            const mentionToUpdate = s.chatMentions[i];
            const oldMarker = `[${i + 2}]`;
            const newMarker = `[${i + 1}]`;
            currentText = currentText.replace(`${mentionToUpdate.data.name} ${oldMarker}`, `${mentionToUpdate.data.name} ${newMarker}`);
        }

        $('chat-input').value = currentText.replace(/\s\s+/g, ' ').trim();
        updateChatInputVisual();
        renderMentionedAssets();
    });

    // Share & Collaboration
    $('share-btn').addEventListener('click', () => { if (s.editId) { toggleModal('share-modal', true); } });
    $('confirm-share-btn').addEventListener('click', async () => {
        const email = $('share-email-input').value.trim();
        const role = $('share-role-select').value;
        if (!s.editId || !email || !role) return;

        setLoading($('confirm-share-btn'), true, 'Adding...');
        try {
            const q = query(collection(db, "users"), where("email", "==", email));
            const userSnap = await getDocs(q);
            
            if (userSnap.empty) {
                throw new Error(`User with email "${email}" not found. Please ensure they have logged into Stylo AI at least once.`);
            }
            
            const invitedUserDoc = userSnap.docs[0];
            const invitedUserId = invitedUserDoc.id;
            const invitedUserData = invitedUserDoc.data();

            if (s.currentProjectData.collaborators && s.currentProjectData.collaborators[invitedUserId]) {
                 throw new Error("This user is already a collaborator on the project.");
            }

            const projectRef = doc(db, "ai_templates", s.editId);
            await updateDoc(projectRef, {
                sharedWith: arrayUnion(invitedUserId),
                [`collaborators.${invitedUserId}`]: {
                    email: invitedUserData.email,
                    displayName: invitedUserData.displayName || invitedUserData.email,
                    photoURL: invitedUserData.photoURL || null,
                    role: role
                }
            });
            $('share-email-input').value = '';
            notify('User added to project!', 'success');
        } catch (e) {
            notify(`Error: ${e.message}`, 'error');
        } finally {
            setLoading($('confirm-share-btn'), false);
        }
    });
   $('collaborators-list').addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.collaborator-item__remove-btn');
        if (removeBtn && s.currentUserRole === 'owner') {
            const item = removeBtn.closest('.collaborator-item');
            const uidToRemove = item.dataset.uid;
            if (!s.editId || !uidToRemove) return;
            if (confirm('Are you sure you want to remove this collaborator?')) {
                try {
                    const projectRef = doc(db, "ai_templates", s.editId);
                    await updateDoc(projectRef, {
                        sharedWith: arrayRemove(uidToRemove),
                        [`collaborators.${uidToRemove}`]: deleteField()
                    });
                     notify('Collaborator removed.', 'success');
                } catch (err) {
                     notify(`Error removing collaborator: ${err.message}`, 'error');
                }
            }
        }
    });

    // Save Logic
    $('confirm-save-btn').addEventListener('click', async () => {
        setLoading($('confirm-save-btn'), true, 'Saving...');
        const success = await saveProject();
        if (success) toggleModal('save-modal', false);
        setLoading($('confirm-save-btn'), false);
    });

    // Version History
    $('versions-list').addEventListener('click', async (e) => {
        const item = e.target.closest('.version-item');
        if (!item) return;
        s.selectedVersionId = item.dataset.versionId;
        document.querySelectorAll('.version-item.active').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        try {
            const versionDoc = await getDoc(doc(db, "ai_templates", s.editId, "versions", s.selectedVersionId));
            if (versionDoc.exists()) {
                const data = versionDoc.data();
                $('version-preview-frame').srcdoc = data.htmlContent;
                const date = data.savedAt ? new Date(data.savedAt.seconds * 1000).toLocaleString() : '';
                $('version-preview-title').textContent = `Previewing version from ${date}`;
                $('restore-version-btn').disabled = false;
            }
        } catch (err) {
            notify("Could not load version preview.", 'error');
        }
    });
    $('restore-version-btn').addEventListener('click', restoreVersion);

    // Image Manager
    $('upload-image-btn').addEventListener('click', () => $('image-upload-input').click());
    $('image-upload-input').addEventListener('change', async e => {
        const files = Array.from(e.target.files); 
        if (files.length === 0 || !s.editId) return;
        setLoading($('upload-image-btn'), true, `Uploading ${files.length}...`);
        
        const collectionPath = `ai_templates/${s.editId}/project_images`;
        
        const uploadPromises = files.map(async (file) => {
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
                const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
                if (!res.ok) throw new Error('Cloudinary upload failed.');
                const data = await res.json();
                const docData = {
                    name: file.name.split('.').slice(0, -1).join('.') || file.name,
                    url: data.secure_url,
                    publicId: data.public_id,
                    createdAt: serverTimestamp()
                };
                return addDoc(collection(db, collectionPath), docData);
            } catch (err) {
                notify(`Failed to upload ${file.name}.`, 'error');
                return Promise.reject(err);
            }
        });
        try { await Promise.all(uploadPromises); }
        catch (err) { console.error("An error occurred during bulk image upload:", err); }
        e.target.value = '';
        setLoading($('upload-image-btn'), false);

        s.currentProjectData.projectImages = await loadProjectImages(s.editId);
        renderProjectImages();
    });
    $('images-list').addEventListener('change', handleImageRename);

    // Project Search
    $('search-input').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        document.querySelectorAll('#templates-list .template-card, #shared-templates-list .template-card').forEach(card => {
            const projectName = card.dataset.name || '';
            card.style.display = projectName.includes(searchTerm) ? 'flex' : 'none';
        });
    });

    // Template List Actions
    document.querySelector('.saved-templates').addEventListener('click', async e => {
            const btn = e.target.closest('button, a'); 
            if (!btn) return;
            const id = btn.dataset.id;
            if (!id) return;
            e.preventDefault(); 
        
            if (btn.classList.contains('load-btn')) { 
                const docSnap = await getDoc(doc(db, "ai_templates", id)); 
                if (docSnap.exists()) {
                     loadProject(docSnap.data(), docSnap.id);
                }
            } 
            else if (btn.classList.contains('deploy-btn')) {
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
                                    notify('Deployment successful!', 'success');
                                } else {
                                    throw new Error(result.error || 'Deployment failed.');
                                }
                            } catch (err) {
                                notify(`Deploy failed: ${err.message}`, 'error');
                            } finally {
                                setLoading(btn, false);
                            }
                        }
            else if (btn.classList.contains('template-card__delete-btn')) { 
                $('delete-modal').dataset.id = id; 
                toggleModal('delete-modal', true); 
            } 
           else if (btn.classList.contains('template-card__donate-btn')) {
                const fileInput = document.createElement('input'); 
                fileInput.type = 'file'; 
                fileInput.accept = 'image/*'; 
                fileInput.style.display = 'none';
                fileInput.dataset.projectId = id; 
                fileInput.addEventListener('change', handleDonationUpload);
                document.body.appendChild(fileInput); 
                fileInput.click(); 
                document.body.removeChild(fileInput);
            } else if (btn.tagName === 'A' && btn.classList.contains('btn--success')) { 
                window.open(btn.href, '_blank'); 
            }
        });

    $('confirm-delete-btn').addEventListener('click', async () => {
        const id = $('delete-modal').dataset.id; if (!id) return;
        setLoading($('confirm-delete-btn'), true, 'Deleting...');
        await deleteDoc(doc(db, "ai_templates", id));
        toggleModal('delete-modal', false);
        await Promise.all([loadTemplates(), loadSharedProjects()]);
        setLoading($('confirm-delete-btn'), false);
    });

    // Collections Add Button
    $('add-collection-btn').addEventListener('click', async () => {
        const name = prompt("Name for new database collection:"); 
        if (!name || !name.trim() || !s.editId) return;
        const collectionRef = collection(db, `ai_templates/${s.editId}/project_collections`);
        const docData = { name: name.trim(), createdAt: serverTimestamp() };
        try {
            await addDoc(collectionRef, docData);
            notify('Collection created!', 'success');
            s.currentProjectData.projectCollections = await loadProjectCollections(s.editId);
            renderProjectCollections();
        } catch (e) {
            notify(`Error creating collection: ${e.message}`, 'error');
        }
    });

    // Project View Toggles
    $('view-toggles').addEventListener('click', (e) => {
        const btn = e.target.closest('.view-toggle-btn');
        if (!btn) return;
        const view = btn.dataset.view;
        document.querySelectorAll('#view-toggles .view-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('templates-list').classList.toggle('hidden', view !== 'my-projects');
        $('shared-templates-list').classList.toggle('hidden', view === 'my-projects');
    });

    // Project-specific Asset Modals
    $('project-db-btn').addEventListener('click', () => {
        if (s.editId) {
            toggleModal('collections-modal', true);
            renderProjectCollections();
        }
    });
    $('project-images-btn').addEventListener('click', () => {
        if (s.editId) {
            toggleModal('images-modal', true);
            renderProjectImages();
        }
    });

    // Code Modal & Universal Modal Handlers
    document.querySelector('#code-modal').addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        // Handle Modal Close
        if (target.matches('.modal__close')) {
            toggleModal('code-modal', false);
        }
        
        // Handle Edit Mode Toggle
        if (target.id === 'code-edit-toggle') {
            toggleCodeEditorReadOnly(!$('code-html').readOnly);
        }

        // Handle Download ZIP Logic
        if (target.id === 'code-download-zip') {
            const btn = target;
            setLoading(btn, true);
            notify('Preparing your download...', 'success');

            try {
                const zip = new JSZip();

                const htmlContent = $('code-html').value;
                const cssContent = $('code-css').value;
                const jsContent = $('code-js').value;

                const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${s.currentProjectData?.name || 'Stylo AI Project'}</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
${htmlContent}
    <script src="script.js" type="module"></script>
</body>
</html>`;

                zip.file("index.html", fullHtml);
                zip.file("style.css", cssContent);
                zip.file("script.js", jsContent);

                const blob = await zip.generateAsync({ type: "blob" });

                // --- THIS IS THE KEY IMPROVEMENT ---
                // 1. Get the current project's name, with a fallback.
                const projectName = s.currentProjectData?.name;
                
                // 2. Create a URL-safe filename (e.g., "My Project" -> "my-project").
                //    Use the slugify utility. Fallback to a default name if no project is loaded.
                const baseFileName = projectName ? slugify(projectName) : 'stylo-ai-project';
                const finalFileName = `${baseFileName}.zip`;
                // --- END OF IMPROVEMENT ---

                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                // 3. Use the new dynamic filename for the download.
                link.download = finalFileName; 
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);

            } catch (error) {
                console.error("Failed to create ZIP file:", error);
                notify("Could not create the ZIP file.", "error");
            } finally {
                setLoading(btn, false);
            }
        }
        
        // Handle Apply Changes from AI Suggester
        if (target.id === 'ai-apply-changes-btn') {
            const parser = new DOMParser();
            const doc = parser.parseFromString(s.html || '<!DOCTYPE html><html><head></head><body></body></html>', 'text/html');
            doc.body.innerHTML = $('code-html').value;
            let styleTag = doc.head.querySelector('style') || doc.createElement('style');
            doc.head.appendChild(styleTag);
            styleTag.textContent = $('code-css').value;
            let scriptTag = Array.from(doc.body.querySelectorAll('script')).find(script => !script.src) || doc.createElement('script');
            scriptTag.type = 'module';
            doc.body.appendChild(scriptTag);
            scriptTag.textContent = $('code-js').value;
            s.html = `<!DOCTYPE html>\n` + doc.documentElement.outerHTML;
            $('preview-frame').srcdoc = s.html;
            notify('Code changes applied!', 'success');
            toggleModal('code-modal', false);
        }
    });
    document.querySelectorAll('.code-viewer__tab').forEach(tab => {
        tab.addEventListener('click', e => {
            document.querySelector('.code-viewer__tab.active')?.classList.remove('active');
            e.currentTarget.classList.add('active');
            document.querySelector('.code-editor__pane.active')?.classList.remove('active');
            const pane = document.querySelector(`.code-editor__pane[data-pane="${e.currentTarget.dataset.tab}"]`);
            if (pane) pane.classList.add('active');
        });
    });
    document.querySelectorAll('.code-editor').forEach(editor => {
        const lineNumbers = editor.previousElementSibling;
        editor.addEventListener('scroll', () => lineNumbers.scrollTop = editor.scrollTop);
        editor.addEventListener('input', () => updateLineNumbers(editor, lineNumbers));
    });

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            toggleModal(e.target.id, false);
        }
        if (e.target.matches('.modal__close, #cancel-delete-btn, #close-notification-btn')) {
            const modal = e.target.closest('.modal');
            if (modal) { toggleModal(modal.id, false); }
        }
    });

    // Routing Listener
    window.addEventListener('popstate', () => {
        setTimeout(handleRouteChange, 0);
    });

    // Context Menu, Firestore, and Avatar logic follows...
    // (This remaining logic is identical to the provided context and is included for completeness)
    const contextMenu = $('custom-context-menu');
    let currentContext = null;

    const handleOutsideClick = (e) => { if (!contextMenu.contains(e.target)) { hideContextMenu(); } };
    const hideContextMenu = () => {
        if (!contextMenu.classList.contains('hidden')) {
            contextMenu.classList.add('hidden');
            document.removeEventListener('mousedown', handleOutsideClick);
        }
    };
    const showContextMenu = (e, menuConfig) => {
        e.preventDefault(); e.stopPropagation();
        $('context-menu-items').innerHTML = menuConfig.map(item => {
            if (item.type === 'divider') return '<li class="context-menu-divider"></li>';
            return `<li data-action="${item.action}" class="${item.class || ''}"><i class="fas ${item.icon}"></i><span>${item.label}</span></li>`;
        }).join('');
        contextMenu.classList.remove('hidden');
        const { clientX: mouseX, clientY: mouseY } = e.touches ? e.touches[0] : e;
        const { innerWidth, innerHeight } = window;
        const menuWidth = contextMenu.offsetWidth; const menuHeight = contextMenu.offsetHeight;
        let top = mouseY; let left = mouseX;
        if (mouseX + menuWidth > innerWidth) left = innerWidth - menuWidth - 5;
        if (mouseY + menuHeight > innerHeight) top = innerHeight - menuHeight - 5;
        contextMenu.style.top = `${top}px`; contextMenu.style.left = `${left}px`;
        document.addEventListener('mousedown', handleOutsideClick);
    };

    contextMenu.addEventListener('click', async (e) => {
        const actionItem = e.target.closest('[data-action]');
        if (!actionItem || !currentContext) return;
        hideContextMenu();
        const { action } = actionItem.dataset;
        const { assetType, id, name } = currentContext;
        if (!s.editId) return;
        const currentPath = assetType === 'image' ? `ai_templates/${s.editId}/project_images` : `ai_templates/${s.editId}/project_collections`;
        switch (action) {
            case 'edit':
                const newName = prompt(`Enter new name for "${name}":`, name);
                if (newName && newName.trim()) {
                    try {
                        await updateDoc(doc(db, currentPath, id), { name: newName.trim() });
                        notify('Rename successful!', 'success');
                        if (assetType === 'image') {
                            s.currentProjectData.projectImages = await loadProjectImages(s.editId);
                            renderProjectImages();
                        } else {
                            s.currentProjectData.projectCollections = await loadProjectCollections(s.editId);
                            renderProjectCollections();
                        }
                    } catch (err) { notify(`Rename failed: ${err.message}`, 'error'); }
                }
                break;
            case 'delete':
                if (confirm(`Are you sure you want to remove "${name}" from this project?`)) {
                    try {
                        await deleteDoc(doc(db, currentPath, id));
                        notify('Item removed.', 'success');
                        if (assetType === 'image') {
                            s.currentProjectData.projectImages = s.currentProjectData.projectImages.filter(i => i.id !== id);
                            renderProjectImages();
                        } else {
                            s.currentProjectData.projectCollections = s.currentProjectData.projectCollections.filter(c => c.id !== id);
                            renderProjectCollections();
                        }
                    } catch (err) { notify(`Delete failed: ${err.message}`, 'error'); }
                }
                break;
        }
    });

    $('images-modal').addEventListener('click', async (e) => {
        const target = e.target;
        if (target.closest('.modal__close')) { toggleModal('images-modal', false); return; }
        const menuBtn = target.closest('.image-item__menu-btn');
        if (menuBtn) {
            const item = menuBtn.closest('.image-card'); if (!item) return;
            currentContext = { assetType: 'image', id: item.dataset.id, name: item.querySelector('textarea').value };
            showContextMenu(e, [
                { label: 'Edit Name', action: 'edit', icon: 'fa-pencil-alt' },
                { label: 'Remove from Project', action: 'delete', icon: 'fa-times-circle', class: 'danger' }
            ]);
        }
    });

    $('collections-modal').addEventListener('click', async (e) => {
        const target = e.target;
        if (target.closest('.modal__close')) { toggleModal('collections-modal', false); return; }
        const menuBtn = target.closest('.collection-item__menu-btn');
        if (menuBtn) {
            const item = menuBtn.closest('.firestore-item'); if (!item) return;
            currentContext = { assetType: 'collection', id: item.dataset.collectionId, name: item.dataset.collectionName };
            showContextMenu(e, [
                { label: 'Edit Name', action: 'edit', icon: 'fa-pencil-alt' },
                { label: 'Remove from Project', action: 'delete', icon: 'fa-times-circle', class: 'danger' }
            ]);
            return;
        }
        const collectionItem = target.closest('.firestore-item[data-collection-id]');
        if (collectionItem) {
            s.currentCollectionId = collectionItem.dataset.collectionId;
            s.currentCollectionName = collectionItem.dataset.collectionName;
            s.currentDocumentIndex = null; s.currentDocumentData = null;
            document.querySelectorAll('#collections-list .firestore-item').forEach(el => el.classList.remove('active'));
            collectionItem.classList.add('active');
            renderFirestoreData();
            await loadDocuments(s.currentCollectionId);
        }
        const documentItem = target.closest('.firestore-item[data-doc-index]');
        if (documentItem) {
            s.currentDocumentIndex = parseInt(documentItem.dataset.docIndex, 10);
            s.currentDocumentData = s.documents[s.currentDocumentIndex];
            document.querySelectorAll('#documents-list .firestore-item').forEach(el => el.classList.remove('active'));
            documentItem.classList.add('active');
            renderFirestoreDocuments();
            renderFirestoreData();
        }
    });

    $('.user-profile__trigger').addEventListener('click', () => {
        const grid = $('avatar-grid');
        grid.innerHTML = AVATAR_LIST.map(url => `<img src="${url}" alt="Avatar option" class="avatar-item ${url === $('user-avatar').src ? 'selected' : ''}">`).join('');
        toggleModal('avatar-selection-modal', true);
    });

    $('avatar-grid').addEventListener('click', async (e) => {
        const target = e.target;
        if (!target.matches('.avatar-item')) return;
        const newAvatarUrl = target.src;
        $('user-avatar').src = newAvatarUrl;
        if (s.user) {
            try {
                await updateDoc(doc(db, "users", s.user.uid), { photoURL: newAvatarUrl });
            } catch (err) {
                console.error("Failed to save avatar choice:", err);
                notify("Could not save your avatar choice.", "error");
            }
        }
        toggleModal('avatar-selection-modal', false);
    });
});