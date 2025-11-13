// js/firestore.js
import { collection, query, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { s } from './state.js';
import { $ } from './utils.js';
import { notify, showLoader } from './ui.js';

const renderDataRecursively = (data) => {
    if (!data) return '<div class="firestore-item--empty">No form data found in this submission.</div>';
    let html = '';
    for (const key in data) {
        const value = data[key];
        html += '<div class="data-viewer__group">';
        html += `<span class="data-viewer__key">${key}</span>`;
        if (typeof value === 'object' && value !== null) {
            // Check for Cloudinary image object
            if (value.url && value.publicId) {
                html += `<div class="data-viewer__value"><a href="${value.url}" target="_blank" class="data-viewer__link">${value.name || 'View Image'}</a></div>`;
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

export const renderFirestoreData = () => {
    const viewer = $('data-viewer');
    const breadcrumb = $('data-breadcrumb');
    if (s.currentDocumentData) {
        const submissionDate = s.currentDocumentData.createdAt ? new Date(s.currentDocumentData.createdAt.seconds * 1000).toLocaleString() : 'N/A';
        breadcrumb.innerHTML = `<span>Submission from ${submissionDate}</span>`;
        // Pass the formData field to the renderer
        viewer.innerHTML = renderDataRecursively(s.currentDocumentData.formData);
    } else {
        breadcrumb.innerHTML = '<span>Select a document...</span>';
        viewer.innerHTML = '<div class="firestore-item--empty">No document selected.</div>';
    }
};

export const renderFirestoreDocuments = () => {
    const listEl = $('documents-list');
    const breadcrumb = $('documents-breadcrumb');
    if (s.currentCollectionId) {
        breadcrumb.innerHTML = `<i class="fas fa-folder-open"></i> &nbsp; <span>${s.currentCollectionName}</span>`;
        if (s.documents.length === 0) {
            listEl.innerHTML = '<div class="firestore-item--empty">No submissions in this collection.</div>';
            return;
        }
        listEl.innerHTML = s.documents.map((doc, index) => {
            const date = doc.createdAt ? new Date(doc.createdAt.seconds * 1000).toLocaleString() : `Submission ${doc.id}`;
            // Use a more descriptive title if possible, like from a 'name' or 'title' field
            const title = doc.formData?.name || doc.formData?.title || date;
            return `<div class="firestore-item ${index === s.currentDocumentIndex ? 'active' : ''}" data-doc-index="${index}">${title}</div>`;
        }).join('');
    } else {
        breadcrumb.innerHTML = '<span>Select a collection...</span>';
        listEl.innerHTML = '<div class="firestore-item--empty">No collection selected.</div>';
    }
};

// --- THIS IS THE CORRECTED FUNCTION ---
export const loadDocuments = async (collectionId) => {
    showLoader(true);
    s.documents = []; // Clear previous documents
    try {
        if (!s.editId) throw new Error("No active project selected.");
        
        // This is the corrected path to the 'submissions' subcollection
        const collectionPath = `ai_templates/${s.editId}/project_collections/${collectionId}/submissions`;
        console.log("✅ Correctly querying Firestore path:", collectionPath);

        const q = query(collection(db, collectionPath), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        
        // Map the full document data, including the ID
        s.documents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    } catch (e) {
        console.error("Error loading documents:", e);
        if (e.message.includes("permission-denied") || e.message.includes("insufficient permissions")) {
            notify("Permission denied. Could not load submissions.", 'error');
        } else {
            notify("Failed to load submissions.", 'error');
        }
    } finally {
        renderFirestoreDocuments(); // Render regardless of success or failure
        showLoader(false);
    }
};

export const renderProjectCollections = () => {
    const listEl = $('collections-list');
    if (!listEl) return;
    const projectCollections = s.currentProjectData?.projectCollections || [];
    if (projectCollections.length === 0) {
        listEl.innerHTML = '<div class="firestore-item--empty">No databases created for this project yet. Click [+] to create one.</div>';
        return;
    }
    listEl.innerHTML = projectCollections.map(c => `
        <div class="firestore-item ${c.id === s.currentCollectionId ? 'active' : ''}" data-collection-id="${c.id}" data-collection-name="${c.name}">
            <span>${c.name}</span>
            <button class="btn-icon collection-item__menu-btn" title="Options">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
    `).join('');
};