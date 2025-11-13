// js/images.js

import { collection, query, where, getDocs, orderBy, updateDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { s } from './state.js';
import { $ } from './utils.js';
import { notify } from './ui.js';

export const loadUserImages = async () => {
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

export const renderUserImages = () => {
    const listEl = document.querySelector('#images-modal .images-manager__grid');
    if (!listEl) return;
    listEl.innerHTML = s.userImages.length ? s.userImages.map(img => {
        const thumbnailUrl = img.url ? img.url.replace('/upload/', '/upload/w_200,c_fill/') : '';
        return `
        <div class="image-card" data-type="user" data-id="${img.id}">
            <img src="${thumbnailUrl}" alt="${img.name}" />
            <div class="image-card__footer">
                <textarea class="form__input" data-id="${img.id}" rows="2" placeholder="Image name...">${img.name}</textarea>
                <button class="btn-icon image-item__menu-btn" title="Options">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        </div>
    `}).join('') : '<p>No images uploaded to your account yet.</p>';
};


export const renderProjectImages = () => {
    const listEl = document.querySelector('#images-modal .images-manager__grid');
    if (!listEl) return;
    const projectImages = s.currentProjectData?.projectImages || [];
    listEl.innerHTML = projectImages.length ? projectImages.map(img => {
        const thumbnailUrl = img.url ? img.url.replace('/upload/', '/upload/w_200,c_fill/') : '';
        return `
        <div class="image-card" data-type="project" data-id="${img.id}">
            <img src="${thumbnailUrl}" alt="${img.name}" />
            <div class="image-card__footer">
                <textarea class="form__input" data-id="${img.id}" rows="2">${img.name}</textarea>
                <button class="btn-icon image-item__menu-btn" title="Options">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        </div>
    `}).join('') : '<p>No images have been uploaded for this project yet.</p>';
};

export const handleImageRename = async (e) => {
    const card = e.target.closest('.image-card');
    if (e.target.tagName !== 'TEXTAREA' || !card) return;

    const id = card.dataset.id;
    const type = card.dataset.type; // 'user' or 'project'
    const newName = e.target.value.trim();
    
    if (!id || !newName || !type) return;

    try {
        const collectionPath = type === 'user' 
            ? 'user_images' 
            : `ai_templates/${s.editId}/project_images`;

        await updateDoc(doc(db, collectionPath, id), { name: newName });
        
        if (type === 'user') {
            const img = s.userImages.find(i => i.id === id);
            if (img) img.name = newName;
        } else {
            const img = s.currentProjectData.projectImages.find(i => i.id === id);
            if (img) img.name = newName;
        }
    } catch (err) {
        notify('Failed to rename image.', 'error');
        console.error("Rename failed:", err);
    }
};

export const handleImageDelete = async (id, name) => {
    // This function now only handles user images, based on the context menu logic
    if (confirm(`Are you sure you want to permanently delete "${name}" from your account?`)) {
        try {
            await deleteDoc(doc(db, "user_images", id));
            notify('Item deleted.', 'success');
            await loadUserImages(); // This re-fetches and re-renders the user image list
        } catch (err) {
            notify(`Delete failed: ${err.message}`, 'error');
            console.error("Image deletion failed:", err);
        }
    }
};

export const renderJustProjectImages = () => {
    const listEl = $('project-images-list');
    if (!listEl) return;
    
    // FIX: Read the image list directly from s.currentProjectData, not the old global variable.
    const projectImages = s.currentProjectData?.projectImages || []; 
    
    listEl.innerHTML = projectImages.length ? projectImages.map(img => {
        const thumbnailUrl = img.url ? img.url.replace('/upload/', '/upload/w_200,c_fill/') : '';
        return `
        <div class="image-card">
            <img src="${thumbnailUrl}" alt="${img.name}" />
            <div class="image-card__name" title="Click to copy mention: @${img.name}">${img.name}</div>
        </div>
    `}).join('') : '<p>No images have been uploaded for this project yet. Use the main <i class="fas fa-images"></i> icon in the top header to upload.</p>';
};