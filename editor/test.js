/**
 * @file profile.js
 * @description Comprehensive logic for the Stylo AI user settings dashboard.
 * This file handles user authentication, data fetching from Firestore,
 * rendering of all dashboard sections, and event handling for all user interactions,
 * including profile updates, team management, API key administration, and account deletion.
 * @version 2.0.0
 * @author Stylo AI
 */

// ===================================================================================
// I. IMPORTS & SETUP
// ===================================================================================

import { auth, db } from './firebase-config.js';
import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    updateProfile,
    deleteUser
} from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    arrayUnion,
    arrayRemove,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// ===================================================================================
// II. STATE & CONSTANTS
// ===================================================================================

/**
 * Main application state object.
 * @property {object|null} currentUser - Holds the merged Firebase Auth and Firestore user data.
 * @property {boolean} isSaving - Flag to prevent multiple concurrent save operations.
 */
const state = {
    currentUser: null,
    isSaving: false,
};

/**
 * DOM element query selector shorthand.
 * @param {string} selector - The CSS selector for the element.
 * @returns {HTMLElement|null} The found element or null.
 */
const $ = (selector) => document.querySelector(selector);

// --- Configuration Constants ---
const CLOUDINARY_CLOUD_NAME = 'dyff2bufp';
const CLOUDINARY_UPLOAD_PRESET = 'unsigned_upload';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const FREE_PLAN_PROJECT_LIMIT = 5;

/**
 * The default document structure for a new user in Firestore.
 * @param {object} user - The Firebase Auth user object.
 * @returns {object} The default user profile data.
 */
const getDefaultUserProfile = (user) => ({
    email: user.email,
    displayName: user.displayName || 'New User',
    photoURL: user.photoURL || null,
    bio: "Welcome to Stylo AI! Tell us a bit about yourself.",
    plan: {
        id: 'free',
        name: 'Stylo Free',
        projectLimit: FREE_PLAN_PROJECT_LIMIT,
    },
    projectCount: 0,
    team: [{
        email: user.email,
        role: 'owner'
    }],
    apiKeys: [],
    createdAt: serverTimestamp(),
    lastUpdated: serverTimestamp()
});

// ===================================================================================
// III. UI HELPER & UTILITY FUNCTIONS
// ===================================================================================

/**
 * Sets the loading state of a button, showing a spinner and disabling it.
 * @param {HTMLElement} btn - The button element.
 * @param {boolean} isLoading - Whether to show the loading state.
 * @param {string} [loadingText=''] - Text to display next to the spinner.
 */
const setLoading = (btn, isLoading, loadingText = '') => {
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
        btn.dataset.originalHtml = btn.innerHTML;
        btn.innerHTML = `<div class="spinner-small"></div> ${loadingText}`;
    } else if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
    }
};

/**
 * Toggles the visibility of a modal.
 * @param {string} modalId - The ID of the modal element.
 * @param {boolean} show - Whether to show or hide the modal.
 */
const toggleModal = (modalId, show) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.toggle('hidden', !show);
};

/**
 * Displays a notification message to the user.
 * @param {string} message - The message to display.
 * @param {string} [type='success'] - The type of notification ('success' or 'error').
 * @param {number} [duration=3000] - How long the notification should be visible (in ms).
 */
const notify = (message, type = 'success', duration = 3000) => {
    const modal = $('#notification-modal');
    if (!modal) return;

    const messageEl = $('#notification-message');
    const contentEl = $('#notification-content');

    messageEl.textContent = message;
    contentEl.style.backgroundColor = type === 'success' ? '#F0FFF4' : '#FFF5F5';
    contentEl.style.borderColor = type === 'success' ? '#9AE6B4' : '#FEB2B2';
    contentEl.style.borderLeft = `4px solid ${type === 'success' ? 'var(--success-color)' : 'var(--danger-color)'}`;


    toggleModal('notification-modal', true);

    // Auto-close the notification
    setTimeout(() => {
        // Only close if it's still the same notification modal being shown
        if (modal.querySelector('#notification-message').textContent === message) {
            toggleModal('notification-modal', false);
        }
    }, duration);
};


/**
 * Copies a string to the user's clipboard.
 * @param {string} text - The text to copy.
 * @returns {Promise<void>}
 */
const copyToClipboard = async (text) => {
    if (!navigator.clipboard) {
        notify('Clipboard API not available.', 'error');
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        notify('Failed to copy text to clipboard.', 'error');
    }
};

/**
 * Generates a new secure, random API key.
 * @returns {string} The generated API key.
 */
const generateApiKey = () => {
    const prefix = 'stylo_sk_live_';
    const randomChars = [...Array(32)].map(() => Math.random().toString(36)[2]).join('');
    return prefix + randomChars;
};

// ===================================================================================
// IV. CORE APPLICATION LOGIC (AUTH & INITIALIZATION)
// ===================================================================================

/**
 * The main entry point of the application, triggered by Firebase Auth state change.
 */
onAuthStateChanged(auth, (user) => {
    const loginBtn = $('#login-btn');
    const userInfo = $('#user-info');

    if (loginBtn) loginBtn.classList.toggle('hidden', !!user);
    if (userInfo) userInfo.classList.toggle('hidden', !user);

    if (user) {
        initializeUserProfile(user);
    } else {
        // If not authenticated, redirect to the main page to prevent access.
        window.location.href = 'index.html';
    }
});

/**
 * Fetches user data from Firestore, creates a new profile if one doesn't exist,
 * and initializes the dashboard.
 * @param {object} authUser - The user object from Firebase Authentication.
 */
const initializeUserProfile = async (authUser) => {
    try {
        state.currentUser = await fetchOrCreateUserData(authUser);
        renderDashboard();
        setupEventListeners();
        handleHashChange(); // Set initial view based on URL hash
    } catch (error) {
        console.error("Critical Error: Failed to initialize user profile.", error);
        notify("Could not load your profile. Please try refreshing the page.", 'error', 5000);
    }
};

/**
 * Fetches user data from Firestore or creates a new document on first login.
 * Merges the data with the Firebase Auth user object.
 * @param {object} authUser - The user object from Firebase Authentication.
 * @returns {Promise<object>} The complete, merged user profile object.
 */
const fetchOrCreateUserData = async (authUser) => {
    const userRef = doc(db, "users", authUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        console.log("User document found. Merging with auth data.");
        // Merge Firestore data with potentially updated auth data (e.g., photoURL from Google)
        const firestoreData = userSnap.data();
        const mergedData = {
            ...authUser, // Base auth data (uid, email)
            ...firestoreData, // Firestore data (bio, team, etc.)
            displayName: authUser.displayName || firestoreData.displayName, // Prefer fresh auth data
            photoURL: authUser.photoURL || firestoreData.photoURL,
        };
        // If auth data changed, update Firestore silently
        if (mergedData.displayName !== firestoreData.displayName || mergedData.photoURL !== firestoreData.photoURL) {
            await updateDoc(userRef, { displayName: mergedData.displayName, photoURL: mergedData.photoURL });
        }
        return mergedData;
    } else {
        console.log("User document not found. Creating new profile.");
        const newUserProfile = getDefaultUserProfile(authUser);
        await setDoc(userRef, newUserProfile);
        return { ...authUser, ...newUserProfile };
    }
};

// ===================================================================================
// V. RENDER FUNCTIONS (Painting the UI with data)
// ===================================================================================

/**
 * Master render function that calls all section-specific renderers.
 */
const renderDashboard = () => {
    if (!state.currentUser) {
        console.error("Attempted to render dashboard without a current user.");
        return;
    }
    console.log("Rendering dashboard for:", state.currentUser.email);
    renderHeaderAndSidebar();
    renderProfileSection();
    renderPlanSection();
    renderTeamSection();
    renderApiKeysSection();
};

/**
 * Renders user-specific elements in the header and sidebar.
 */
const renderHeaderAndSidebar = () => {
    const displayName = state.currentUser.displayName || 'Unnamed User';
    const initial = displayName.charAt(0).toUpperCase();

    // Header Dropdown
    $('#user-email').textContent = displayName;
    if (state.currentUser.photoURL) {
        $('#user-avatar').style.backgroundImage = `url(${state.currentUser.photoURL})`;
        $('#user-avatar').textContent = '';
    } else {
        $('#user-avatar').style.backgroundImage = '';
        $('#user-avatar').textContent = initial;
    }

    // Sidebar Profile Card
    $('#display-name-header').textContent = displayName;
    $('#email-display').textContent = state.currentUser.email;
    if (state.currentUser.photoURL) {
        $('#profile-picture-display').style.backgroundImage = `url(${state.currentUser.photoURL})`;
        $('#profile-picture-display').textContent = '';
    } else {
        $('#profile-picture-display').style.backgroundImage = '';
        $('#profile-picture-display').textContent = initial;
    }
};
const renderProfileSection = () => {
    $('#display-name-input').value = state.currentUser.displayName || '';
    $('#bio-input').value = state.currentUser.bio || '';

    const profilePicForm = $('#profile-picture-display-form');
    if (state.currentUser.photoURL) {
        profilePicForm.style.backgroundImage = `url(${state.currentUser.photoURL})`;
        profilePicForm.textContent = '';
    } else {
        profilePicForm.style.backgroundImage = '';
        profilePicForm.textContent = (state.currentUser.displayName || 'U').charAt(0).toUpperCase();
    }
};
const renderPlanSection = () => {
    const projectCount = state.currentUser.projectCount || 0;
    const projectLimit = state.currentUser.plan?.projectLimit || FREE_PLAN_PROJECT_LIMIT;
    const percentage = Math.min((projectCount / projectLimit) * 100, 100);

    const usageMeter = $('.usage-meter');
    if (usageMeter) {
        usageMeter.querySelector('p strong').textContent = `${projectCount} / ${projectLimit}`;
        usageMeter.querySelector('.usage-bar__fill').style.width = `${percentage}%`;
    }
};
const renderTeamSection = () => {
    const tableBody = $('#team-members-table tbody');
    if (!tableBody) return;
    const team = state.currentUser.team || [];

    if (team.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" class="empty-state">Your team is empty. Invite a member to get started.</td></tr>`;
        return;
    }

    tableBody.innerHTML = team.map(member => `
        <tr data-email="${member.email}" data-role="${member.role}">
            <td>
                <div class="user-cell">
                    <div class="profile-picture profile-picture--tiny">${member.email.charAt(0).toUpperCase()}</div>
                    <div class="user-cell-info">
                        <strong>${member.email}</strong>
                    </div>
                </div>
            </td>
            <td><span class="role-badge role--${member.role}">${member.role}</span></td>
            <td class="actions-cell">
                ${member.role !== 'owner' ? '<button class="btn-icon remove-member-btn" title="Remove User"><i class="fas fa-trash-alt"></i></button>' : '(You)'}
            </td>
        </tr>
    `).join('');
};
const renderApiKeysSection = () => {
    const listEl = $('#api-keys-list');
    if (!listEl) return;
    const apiKeys = state.currentUser.apiKeys || [];

    if (apiKeys.length === 0) {
        listEl.innerHTML = `<p class="empty-state">No API keys have been generated yet.</p>`;
        return;
    }

    listEl.innerHTML = apiKeys.map(key => `
        <div class="api-key-item" data-key="${key}">
            <div class="api-key-info">
                <strong>Personal Access Token</strong>
                <div class="api-key-input-wrapper">
                    <input type="password" readonly class="form__input api-key-input" value="${key}">
                    <button class="btn-icon toggle-visibility-btn" title="Show/Hide Key"><i class="fas fa-eye"></i></button>
                </div>
            </div>
            <div class="api-key-actions">
                <button class="btn btn--secondary btn--sm copy-key-btn">Copy</button>
                <button class="btn btn--danger btn--sm delete-key-btn">Delete</button>
            </div>
        </div>
    `).join('');
};

/**
 * Handles routing between sections based on the URL hash.
 */
const handleHashChange = () => {
    const hash = window.location.hash || '#profile';
    const targetId = `${hash.substring(1)}-section`;

    document.querySelectorAll('.profile-nav-link').forEach(link => {
        link.classList.toggle('active', link.hash === hash);
    });
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.toggle('active', section.id === targetId);
    });
};

// ===================================================================================
// VI. EVENT HANDLERS
// ===================================================================================

/**
 * Sets up all event listeners for the dashboard. Called once after initialization.
 */
const setupEventListeners = () => {
    console.log("Setting up event listeners.");

    // --- Global & Navigation ---
    window.addEventListener('hashchange', handleHashChange);
    $('#login-btn')?.addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()));
    $('#logout-btn')?.addEventListener('click', () => signOut(auth));

    // --- Profile Section Handlers ---
    $('#profile-form')?.addEventListener('submit', handleProfileUpdate);
    $('#picture-upload-input')?.addEventListener('change', handlePictureUpload);

    // --- Team Section Handlers ---
    $('#invite-form')?.addEventListener('submit', handleTeamInvite);
    $('#team-members-table')?.addEventListener('click', handleTeamMemberRemove);

    // --- API Section Handlers ---
    $('#generate-api-key-btn')?.addEventListener('click', handleApiKeyGenerate);
    $('#api-keys-list')?.addEventListener('click', handleApiKeyActions);

    // --- Account Section Handlers ---
    $('#delete-account-btn')?.addEventListener('click', () => {
        toggleModal('delete-account-modal', true);
        $('#delete-confirm-input').value = '';
        $('#confirm-delete-btn').disabled = true;
    });

    // --- Modal Handlers ---
    $('#delete-confirm-input')?.addEventListener('input', (e) => {
        $('#confirm-delete-btn').disabled = (e.target.value !== 'delete my account');
    });
    $('#confirm-delete-btn')?.addEventListener('click', handleAccountDeletion);

    // Universal Modal Close Handler
    document.body.addEventListener('click', (e) => {
        if (e.target.matches('.modal__close, .modal__overlay, #cancel-delete-btn, #close-notification-btn')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                toggleModal(modal.id, false);
            }
        }
    });
};

// --- Handler Implementations ---

async function handleProfileUpdate(e) {
    e.preventDefault();
    if (state.isSaving) return;

    const btn = $('#save-profile-btn');
    const statusEl = $('#profile-save-status');
    const newName = $('#display-name-input').value.trim();
    const newBio = $('#bio-input').value.trim();

    if (newName === state.currentUser.displayName && newBio === state.currentUser.bio) {
        return; // Don't save if nothing changed
    }

    state.isSaving = true;
    setLoading(btn, true, 'Saving...');
    statusEl.textContent = ''; // Clear previous status
    statusEl.classList.remove('fade-out');


    try {
        const payload = {
            displayName: newName,
            bio: newBio,
            lastUpdated: serverTimestamp()
        };

        // Update Auth and Firestore concurrently
        await Promise.all([
            updateProfile(auth.currentUser, { displayName: newName }),
            updateDoc(doc(db, "users", state.currentUser.uid), payload)
        ]);

        // Optimistically update local state
        state.currentUser.displayName = newName;
        state.currentUser.bio = newBio;

        renderHeaderAndSidebar(); // Re-render affected components
        
        // Show success status message with fade out
        statusEl.textContent = 'Changes saved!';
        setTimeout(() => {
            statusEl.classList.add('fade-out');
        }, 500); // Wait a moment before starting fade
        setTimeout(() => { // Clear text after animation
            statusEl.textContent = '';
        }, 2500);


    } catch (error) {
        console.error("Profile update error:", error);
        notify(`Error updating profile: ${error.message}`, 'error');
    } finally {
        state.isSaving = false;
        setLoading(btn, false);
    }
}

async function handlePictureUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    notify('Uploading picture...', 'success', 2000);
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`Image upload failed with status: ${res.status}`);
        const cloudData = await res.json();
        const photoURL = cloudData.secure_url;

        await Promise.all([
            updateProfile(auth.currentUser, { photoURL }),
            updateDoc(doc(db, "users", state.currentUser.uid), { photoURL, lastUpdated: serverTimestamp() })
        ]);

        state.currentUser.photoURL = photoURL;
        renderHeaderAndSidebar();
        renderProfileSection();
        notify('Profile picture updated!', 'success');
    } catch (error) {
        console.error('Photo upload error:', error);
        notify(`Error uploading photo: ${error.message}`, 'error');
    } finally {
        e.target.value = ''; // Reset file input
    }
}

async function handleTeamInvite(e) {
    e.preventDefault();
    const emailInput = $('#invite-email-input');
    const roleSelect = $('#invite-role-select');
    const newMemberEmail = emailInput.value.trim();
    const btn = $('#invite-btn');

    if (!newMemberEmail || !/^\S+@\S+\.\S+$/.test(newMemberEmail)) {
        notify('Please enter a valid email address.', 'error');
        return;
    }
    if (state.currentUser.team.some(m => m.email === newMemberEmail)) {
        notify('This user is already on your team.', 'error');
        return;
    }

    setLoading(btn, true, 'Inviting...');
    try {
        const userRef = doc(db, "users", state.currentUser.uid);
        const newMember = { email: newMemberEmail, role: roleSelect.value };

        await updateDoc(userRef, { team: arrayUnion(newMember) });

        state.currentUser.team.push(newMember);
        renderTeamSection();
        emailInput.value = '';
        notify('Team member invited successfully!', 'success');
    } catch (error) {
        console.error("Error inviting member:", error);
        notify(`Failed to invite member: ${error.message}`, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function handleTeamMemberRemove(e) {
    const removeBtn = e.target.closest('.remove-member-btn');
    if (!removeBtn) return;

    const row = removeBtn.closest('tr');
    const memberToRemove = {
        email: row.dataset.email,
        role: row.dataset.role
    };

    if (confirm(`Are you sure you want to remove ${memberToRemove.email} from your team?`)) {
        removeBtn.innerHTML = `<div class="spinner-small"></div>`;
        removeBtn.disabled = true;
        try {
            const userRef = doc(db, "users", state.currentUser.uid);
            await updateDoc(userRef, { team: arrayRemove(memberToRemove) });

            state.currentUser.team = state.currentUser.team.filter(m => m.email !== memberToRemove.email);
            renderTeamSection();
            notify('Team member removed.', 'success');
        } catch (error) {
            console.error("Error removing member:", error);
            notify(`Failed to remove member: ${error.message}`, 'error');
            renderTeamSection(); // Re-render to restore button state on failure
        }
    }
}

async function handleApiKeyGenerate() {
    const btn = $('#generate-api-key-btn');
    setLoading(btn, true);
    try {
        const newKey = generateApiKey();
        const userRef = doc(db, "users", state.currentUser.uid);
        await updateDoc(userRef, { apiKeys: arrayUnion(newKey) });

        state.currentUser.apiKeys.push(newKey);
        renderApiKeysSection();
        notify('New API key generated.', 'success');
    } catch (error) {
        console.error("Error generating API key:", error);
        notify(`Failed to generate key: ${error.message}`, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function handleApiKeyActions(e) {
    const keyItem = e.target.closest('.api-key-item');
    if (!keyItem) return;
    const key = keyItem.dataset.key;

    // Delete Action (needs to be async)
    if (e.target.closest('.delete-key-btn')) {
        if (confirm('Are you sure you want to delete this API key? This action is permanent.')) {
            try {
                const userRef = doc(db, "users", state.currentUser.uid);
                await updateDoc(userRef, { apiKeys: arrayRemove(key) });

                state.currentUser.apiKeys = state.currentUser.apiKeys.filter(k => k !== key);
                renderApiKeysSection();
                notify('API key deleted.', 'success');
            } catch (error) {
                console.error("Error deleting API key:", error);
                notify(`Failed to delete key: ${error.message}`, 'error');
            }
        }
    }

    // Copy Action
    if (e.target.closest('.copy-key-btn')) {
        const copyBtn = e.target.closest('.copy-key-btn');
        copyToClipboard(key);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    }

    // Toggle Visibility Action
    if (e.target.closest('.toggle-visibility-btn')) {
        const input = keyItem.querySelector('.api-key-input');
        const icon = keyItem.querySelector('i');
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        icon.classList.toggle('fa-eye', !isPassword);
        icon.classList.toggle('fa-eye-slash', isPassword);
    }
}

async function handleAccountDeletion() {
    const btn = $('#confirm-delete-btn');
    setLoading(btn, true, 'Deleting...');
    try {
        // NOTE: Deleting a user from Auth does NOT delete their Firestore data.
        // In a production app, you would use a Cloud Function triggered by user deletion
        // to clean up their Firestore documents, storage files, etc.
        // For this client-side example, we only delete the Auth user.
        await deleteUser(auth.currentUser);
        notify('Account deleted successfully. You will be logged out.', 'success');
        // The onAuthStateChanged listener will handle the redirect.
    } catch (error) {
        let msg = `Failed to delete account: ${error.message}`;
        if (error.code === 'auth/requires-recent-login') {
            msg = "This is a sensitive operation. Please sign out and sign back in before deleting your account.";
        }
        notify(msg, 'error', 5000);
        setLoading(btn, false);
    }
}