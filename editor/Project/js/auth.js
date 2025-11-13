// --- START OF FILE: js/auth.js ---

import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { s } from './state.js';
import { $ } from './utils.js';
import { notify, resetWorkspace } from './ui.js';
import { loadTemplates, loadSharedProjects } from './templates.js';
import { handleRouteChange } from './main.js';
import { PRE_ASSIGNED_AVATARS } from './avatars.js';

/**
 * Initializes the authentication listener which bootstraps the entire application.
 * It handles user sign-in, sign-out, and profile creation/loading.
 */
export function initAuth() {
onAuthStateChanged(auth, async (user) => {
    $('login-btn').classList.toggle('hidden', !!user);
    $('user-info').classList.toggle('hidden', !user);

    const chatInput = $('chat-input');
    if (chatInput) chatInput.disabled = true;
    $('generate-btn').disabled = true;
    $('send-chat-btn').disabled = true;

    if (user) {
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            let userData;

            if (userSnap.exists()) {
                userData = userSnap.data();
            } else {
                userData = {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName || 'New User',
                    photoURL: PRE_ASSIGNED_AVATARS[user.email] || user.photoURL || null, 
                    bio: "Welcome to Stylo AI!",
                    createdAt: serverTimestamp()
                };
                await setDoc(userRef, userData);
            }
            
            // Merge Firestore data into the global user state for a single source of truth
            s.user = { ...user, ...userData };

            $('user-email').textContent = s.user.displayName || s.user.email;
            $('user-email-dropdown').textContent = s.user.email;
            if (s.user.photoURL) {
                $('user-avatar').src = s.user.photoURL;
            } else {
                $('user-avatar').removeAttribute('src'); 
            }

            const keyDoc = await getDoc(doc(db, "settings", "api_keys"));
            if (!keyDoc.exists() || !keyDoc.data().geminiApiKey) {
                throw new Error("API key document not found or is invalid in Firestore.");
            }
            s.apiKey = keyDoc.data().geminiApiKey;

            if (chatInput) {
                chatInput.disabled = false;
                chatInput.placeholder = "e.g., Create a contact form linked to collection #leads...";
            }
            $('generate-btn').disabled = false;
            $('send-chat-btn').disabled = false;

            await Promise.all([loadTemplates(), loadSharedProjects()]);

        } catch (e) {
            console.error("Failed to initialize user session:", e);
            notify(e.message, 'error');
            if (chatInput) chatInput.placeholder = "AI is offline. API key is missing or invalid.";
        }
    } else {
        s.user = null; // Clear user on sign out
        resetWorkspace();
        s.sharedProjects = [];
        $('templates-list').innerHTML = '<p>Sign in to view your saved projects.</p>';
        $('shared-templates-list').innerHTML = '';
    }

    handleRouteChange();
});
}

/**
 * Initiates the Google Sign-In popup flow.
 */
export const handleSignIn = () => signInWithPopup(auth, new GoogleAuthProvider());

/**
 * Signs the current user out.
 */
export const handleSignOut = () => signOut(auth);

/**
 * Disables or enables UI controls based on the user's role for the current project.
 * @param {('owner'|'editor'|'viewer')} role - The user's role.
 */
export const applyUIPermissions = (role) => {
    const isViewer = role === 'viewer';
    const controlsToDisable = [
        'ai-persona-input', 'chat-input', 'send-chat-btn', 'generate-btn',
        'save-btn', 'confirm-save-btn', 'history-btn',
        'code-edit-toggle', 'ai-suggestion-prompt', 'ai-suggestion-btn', 'ai-apply-changes-btn'
    ];
    
    controlsToDisable.forEach(id => {
        const el = $(id);
        if (el) el.disabled = isViewer;
    });

    // The share button should be enabled for owners and editors, but not viewers.
    if ($('share-btn')) {
        $('share-btn').disabled = isViewer;
    }
};

/**
 * Renders the collaborator avatars and list in the UI.
 * @param {Object} collaborators - The collaborators map from the project document.
 */
export const renderCollaborators = (collaborators) => {
    const avatarContainer = $('collaborators-container');
    const listContainer = $('collaborators-list');
    if (!avatarContainer || !listContainer) return;

    const collaboratorsArray = Object.entries(collaborators || {});
    const canManage = s.currentUserRole === 'owner';
    const shareInputs = document.querySelectorAll('#share-email-input, #share-role-select, #confirm-share-btn');
    
    shareInputs.forEach(input => input.disabled = s.currentUserRole === 'viewer');

    avatarContainer.innerHTML = collaboratorsArray.map(([uid, data]) => {
        const title = `${data.displayName || data.email} (${data.role})`;
        if (data.photoURL) {
            // If a photoURL exists, use an <img> tag
            return `<img src="${data.photoURL}" alt="${data.displayName || data.email}" class="collaborator-avatar" title="${title}">`;
        } else {
            // Fallback to the initial if no photoURL
            const initial = (data.displayName || data.email).charAt(0).toUpperCase();
            return `<div class="collaborator-avatar" title="${title}">${initial}</div>`;
        }
    }).join('');

    if (collaboratorsArray.length > 0) {
        listContainer.innerHTML = collaboratorsArray.map(([uid, data]) => `
            <div class="collaborator-item" data-uid="${uid}">
                <div class="collaborator-item__info">
                    <strong>${data.displayName || 'Unknown User'}</strong>
                    <small>${data.email}</small>
                </div>
                <div class="collaborator-item__role">
                    ${s.currentProjectData?.userId === uid ? '<span>(Owner)</span>' : `<span class="role-tag role-${data.role}">${data.role}</span>`}
                </div>
                ${canManage && s.currentProjectData?.userId !== uid ? `<button class="collaborator-item__remove-btn" title="Remove collaborator">&times;</button>` : ''}
            </div>
        `).join('');
    } else {
        listContainer.innerHTML = '<p>You are the only one on this project.</p>';
    }
};
