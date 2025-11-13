// js/templates.js

import { doc, getDoc, updateDoc, onSnapshot, collection, getDocs, query, where, orderBy, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { s } from './state.js';
import { $, slugify } from './utils.js';
import { notify, resetWorkspace, updateUIForLoadedProject, toggleCardLoader, showLoader } from './ui.js';
import { applyUIPermissions, renderCollaborators } from './auth.js';
import { renderChatHistory } from './ai-core.js';
import { CLOUDINARY_UPLOAD_PRESET, CLOUDINARY_URL } from './constants.js';
import { saveVersion } from './versions.js';

// --- THE NEW AND IMPROVED loadProject FUNCTION ---
export const loadProject = async (initialData, id) => {
    if (!s.user) return notify("Please sign in to load a project.", "error");
    if (s.editId === id) return; // Don't reload the same project

    const isOwner = initialData.userId === s.user.uid;
    const isCollaborator = initialData.collaborators?.[s.user.uid];

    // CASE 1: The user owns this project or is a collaborator. Load it directly.
    if (isOwner || isCollaborator) {
        _subscribeToProject(id);
    } 
    // CASE 2: The user does not own this project. Create an editable copy from the template.
    else {
        if (!confirm("This will create a new, editable copy of the template in your account. Continue?")) {
            return;
        }
        showLoader(true);
        notify("Creating your editable copy of the template...", "success");
        try {
            // Prepare data for the new copy
            const newProjectData = {
                name: `Copy of ${initialData.name}`,
                htmlContent: initialData.htmlContent,
                // Start with a clean chat history that references the template
                chatHistory: [{ role: 'ai', text: `This project was started from the '${initialData.name}' template.` }],
                userId: s.user.uid,
                createdAt: serverTimestamp(),
                isDirty: false,
                sharedWith: [],
                collaborators: {
                    [s.user.uid]: {
                        email: s.user.email,
                        displayName: s.user.displayName,
                        role: 'owner'
                    }
                }
            };

            // Create the new document in Firestore
            const docRef = await addDoc(collection(db, "ai_templates"), newProjectData);
            
            // Now, load the newly created project
            await loadTemplates(); // Refresh the project list in the background
            _subscribeToProject(docRef.id);

        } catch (error) {
            console.error("Failed to import template:", error);
            notify(`Error importing template: ${error.message}`, "error");
        } finally {
            showLoader(false);
        }
    }
};

// Internal function to set up the real-time listener for a project
async function _subscribeToProject(projectId) {
    resetWorkspace();
    s.editId = projectId;

    const [projectImages, projectCollections] = await Promise.all([
        loadProjectImages(projectId),
        loadProjectCollections(projectId)
    ]);
    
    const docRef = doc(db, "ai_templates", projectId);

    s.projectUnsubscribe = onSnapshot(docRef, (docSnap) => {
        if (!docSnap.exists()) {
            notify("This project no longer exists.", "error");
            resetWorkspace();
            return;
        }
        const projectData = docSnap.data();
        history.pushState({ projectId: projectId }, `Project: ${projectData.name}`, `?project=${projectId}`);

        s.currentProjectData = { 
            id: docSnap.id, 
            ...projectData, 
            projectImages, 
            projectCollections 
        };

        s.currentUserRole = projectData.collaborators?.[s.user.uid]?.role || 'viewer';
        if (projectData.userId === s.user.uid) s.currentUserRole = 'owner';
        applyUIPermissions(s.currentUserRole);

        if (projectData.isBeingEditedBy && projectData.isBeingEditedBy.uid !== s.user.uid) {
            const statusEl = $('realtime-status');
            statusEl.innerHTML = `<i class="fas fa-pencil-alt"></i> ${projectData.isBeingEditedBy.name} is editing...`;
            statusEl.classList.remove('hidden');
            if(s.realtimeStatusTimeout) clearTimeout(s.realtimeStatusTimeout);
            s.realtimeStatusTimeout = setTimeout(() => statusEl.classList.add('hidden'), 4000);
        }

        if (s.html !== projectData.htmlContent) {
            s.html = projectData.htmlContent;
            $('preview-frame').srcdoc = s.html;
        }
        if (JSON.stringify(s.chatHistory) !== JSON.stringify(projectData.chatHistory) && !s.isGenerating) {
             s.chatHistory = projectData.chatHistory || [{ role: 'ai', text: `Project "${projectData.name}" loaded.` }];
             renderChatHistory();
        }
        
        updateUIForLoadedProject({ id: projectId, ...projectData });
        renderCollaborators(projectData.collaborators || []);
    }, (error) => {
        console.error("Real-time listener error:", error);
        notify("Lost connection to the project. Please refresh.", "error");
    });
}


export const loadTemplates = async () => {
    if (!s.user) return;
    const listEl = $('templates-list');
    listEl.innerHTML = (listEl.innerHTML.trim() === '' || listEl.innerHTML.includes('<p>')) ? "<p>Loading projects...</p>" : listEl.innerHTML;
    try {
        const snap = await getDocs(query(collection(db, "ai_templates"), where("userId", "==", s.user.uid), orderBy("createdAt", "desc")));
        const templates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        listEl.innerHTML = templates.length ? templates.map(t => {
            const needsUpdate = t.isDirty && t.deploymentUrl;
            const donateButton = !t.isPublic ? `<button class="btn-icon template-card__donate-btn" data-id="${t.id}" title="Donate as public template"><i class="fas fa-gift"></i></button>` : '';
            const placeholderImage = '../assets/Images/logo1.png';
            const cardImage = `<div class="template-card__image" style="background-image: url(${t.thumbnailUrl || placeholderImage})"></div>`;
            const loadButton = `<button class="btn btn--sm btn--secondary load-btn" data-id="${t.id}"><i class="fas fa-folder-open"></i> Load</button>`;
            let deployButtons = `<button class="btn btn--sm btn--primary deploy-btn" data-id="${t.id}"><i class="fas fa-rocket"></i> Deploy</button>`;
            if (t.deploymentUrl) {
                deployButtons = `<a href="${t.deploymentUrl}" target="_blank" class="btn btn--sm btn--success"><i class="fas fa-external-link-alt"></i> Visit</a>
                    <button class="btn btn--sm btn--secondary deploy-btn ${needsUpdate ? 'needs-update' : ''}" data-id="${t.id}"><i class="fas fa-sync-alt"></i> Re-deploy</button>`;
            }
            return `<div class="template-card" data-name="${t.name.toLowerCase()}">
                ${cardImage}
                <div class="template-card__content">
                    <div class="template-card__header"><h4>${t.name}</h4><div class="template-card__icon-buttons">${donateButton}<button class="btn-icon template-card__delete-btn" data-id="${t.id}"><i class="fas fa-trash-alt"></i></button></div></div>
                    <div class="template-card__actions">
                        ${loadButton} ${deployButtons}
                    </div>
                </div>
            </div>`;
        }).join('') : "<p>You haven't saved any projects yet.</p>";
    } catch (e) { listEl.innerHTML = `<p style='color:red;'>Could not load projects.</p>`; console.error(e); }
};

export const loadSharedProjects = async () => {
    if (!s.user) return;
    const listEl = $('shared-templates-list');
    listEl.innerHTML = "<p>Loading shared projects...</p>";
    try {
        const q = query(collection(db, "ai_templates"), where("sharedWith", "array-contains", s.user.uid), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        s.sharedProjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderSharedProjects();
    } catch (e) {
        listEl.innerHTML = `<p style='color:red;'>Could not load shared projects.</p>`;
        console.error("Error loading shared projects:", e);
    }
};

export const renderSharedProjects = () => {
    const listEl = $('shared-templates-list');
    listEl.innerHTML = s.sharedProjects.length ? s.sharedProjects.map(t => {
        const ownerData = t.collaborators?.[t.userId];
        const ownerInfo = ownerData ? `Shared by ${ownerData.displayName || ownerData.email}` : 'Shared by an unknown user';
        const placeholderImage = '../assets/Images/logo1.png';
        const cardImage = `<div class="template-card__image" style="background-image: url(${t.thumbnailUrl || placeholderImage})"></div>`;
        const cardActions = `
            <button class="btn btn--sm btn--secondary load-btn" data-id="${t.id}"><i class="fas fa-folder-open"></i> Load</button>
            ${t.deploymentUrl ? `<a href="${t.deploymentUrl}" target="_blank" class="btn btn--sm btn--success"><i class="fas fa-external-link-alt"></i> Visit</a>` : ''}
        `;
        return `<div class="template-card" data-name="${t.name.toLowerCase()}">
            ${cardImage}
            <div class="template-card__content">
                <div class="template-card__header"><h4>${t.name}</h4></div>
                <div class="template-card__owner"><i class="fas fa-share-alt"></i> ${ownerInfo}</div>
                <div class="template-card__actions">${cardActions}</div>
            </div>
        </div>`;
    }).join('') : "<p>No projects have been shared with you yet.</p>";
};

export const handleDonationUpload = async (event) => {
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
        await updateDoc(doc(db, "ai_templates", projectId), { isPublic: true, donatedAt: serverTimestamp(), thumbnailUrl: data.secure_url });
        notify('Project successfully donated as a template!', 'success');
        await loadTemplates();
    } catch (err) {
        console.error('Donation failed:', err);
        notify('Donation failed. Please try again.', 'error');
        toggleCardLoader(projectId, false);
    }
};


export const saveProject = async () => {
    const name = $('save-template-name-input').value.trim();
    if (!name) {
        notify('Please enter a name.', 'error');
        return false;
    }
    try {
        if (s.editId) {
            await updateDoc(doc(db, "ai_templates", s.editId), { name, htmlContent: s.html, chatHistory: s.chatHistory });
            await saveVersion('Manual Save');
        } else {
            const docRef = await addDoc(collection(db, "ai_templates"), {
                name, siteName: slugify(name), htmlContent: s.html, chatHistory: s.chatHistory,
                userId: s.user.uid, isDirty: false, createdAt: serverTimestamp(),
                sharedWith: [],
                collaborators: {
                    [s.user.uid]: {
                        email: s.user.email,
                        displayName: s.user.displayName,
                        role: 'owner'
                    }
                }
            });
            _subscribeToProject(docRef.id);
        }
        await loadTemplates();
        notify('Project saved successfully!');
        return true;
    } catch (e) {
        notify(`Save failed: ${e.message}`, 'error');
        return false;
    }
};

export const loadProjectImages = async (projectId) => {
    if (!projectId) return [];
    try {
        const q = query(collection(db, `ai_templates/${projectId}/project_images`), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("Could not load project images:", e);
        return [];
    }
};

export const loadProjectCollections = async (projectId) => {
    if (!projectId) return [];
    try {
        const q = query(collection(db, `ai_templates/${projectId}/project_collections`), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("Could not load project collections:", e);
        return [];
    }
};
export const createNewProject = async (name) => {
    if (!s.user) return false;
    try {
        const docRef = await addDoc(collection(db, "ai_templates"), {
            name,
            siteName: slugify(name),
            htmlContent: '',
            chatHistory: [{ role: 'ai', text: `Let's start building "${name}"! What should we create first?` }],
            userId: s.user.uid,
            isDirty: false,
            createdAt: serverTimestamp(),
            sharedWith: [],
            collaborators: {
                [s.user.uid]: {
                    email: s.user.email,
                    displayName: s.user.displayName,
                    photoURL: s.user.photoURL || null, // ADD THIS LINE
                    role: 'owner'
                }
            }
        });
        await _subscribeToProject(docRef.id);
        await loadTemplates();
        return true;
    } catch (e) {
        notify(`Failed to create project: ${e.message}`, 'error');
        console.error(e);
        return false;
    }
};