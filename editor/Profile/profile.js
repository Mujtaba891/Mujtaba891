/**
 * @file profile.js
 * @description Comprehensive logic for the Stylo AI user settings dashboard.
 * This file handles user authentication, data fetching from Firestore,
 * rendering of all dashboard sections, and event handling for all user interactions.
 * @version 2.5.0 (Added Image Deletion & Fixed Project Names)
 * @author Stylo AI
 */

// ===================================================================================
// I. IMPORTS & SETUP
// ===================================================================================

import { auth, db } from '../Project/js/firebase-config.js';
import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    deleteUser
} from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    arrayUnion,
    arrayRemove,
    serverTimestamp,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    addDoc
} from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { AVATAR_LIST } from '../Project/js/avatars.js';

// ===================================================================================
// II. STATE & CONSTANTS
// ===================================================================================

const state = {
    currentUser: null,
    isSaving: false,
    userProjects: [],
    userImages: [],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// ... (getDefaultUserProfile, UI Helpers, Auth, etc. remain the same) ...
const getDefaultUserProfile = (user) => ({
    email: user.email,
    displayName: user.displayName || 'New User',
    photoURL: user.photoURL || null,
    bio: "",
    age: null,
    gender: "Prefer not to say",
    position: "",
    website: "",
    location: "",
    team: [{ email: user.email, role: 'owner' }],
    pendingInvites: [],
    apiKeys: [],
    createdAt: serverTimestamp(),
    lastUpdated: serverTimestamp()
});

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

const toggleModal = (modalId, show) => {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.toggle('hidden', !show);
};

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
    setTimeout(() => {
        if (modal.querySelector('#notification-message')?.textContent === message) {
            toggleModal('notification-modal', false);
        }
    }, duration);
};

const copyToClipboard = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        notify('Failed to copy text.', 'error');
    }
};

const generateApiKey = () => `stylo_sk_live_${[...Array(32)].map(() => Math.random().toString(36)[2]).join('')}`;

onAuthStateChanged(auth, (user) => {
    $('#login-btn')?.classList.toggle('hidden', !!user);
    $('#user-info')?.classList.toggle('hidden', !user);
    if (user) {
        initializeUserProfile(user);
    } else {
        window.location.href = 'index.html';
    }
});

const initializeUserProfile = async (authUser) => {
    try {
        state.currentUser = await fetchOrCreateUserData(authUser);
        renderDashboard();
        setupEventListeners();
        handleHashChange();
        fetchUserProjectsAndImages();
        fetchAndRenderIncomingInvites();
        fetchAndRenderTeamData();
    } catch (error) {
        console.error("Critical Error: Failed to initialize user profile.", error);
        notify("Could not load your profile. Please try refreshing the page.", 'error', 5000);
    }
};

const fetchOrCreateUserData = async (authUser) => {
    const userRef = doc(db, "users", authUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
        return { ...authUser, ...userSnap.data() };
    } else {
        const newUserProfile = getDefaultUserProfile(authUser);
        await setDoc(userRef, newUserProfile);
        return { ...authUser, ...newUserProfile };
    }
};


// ===================================================================================
// V. DATA FETCHING 
// ===================================================================================
async function fetchAndRenderIncomingInvites() {
    if (!state.currentUser?.email) return;

    const listEl = $('#incoming-invites-list');
    if (listEl) listEl.innerHTML = `<div class="empty-state">Checking for invites...</div>`;

    try {
        const invitesRef = collection(db, "invites");
        const q = query(invitesRef, where("inviteeEmail", "==", state.currentUser.email), where("status", "==", "pending"));
        const snapshot = await getDocs(q);
        
        const invites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderIncomingInvites(invites);

    } catch (error) {
        console.error("Error fetching incoming invites:", error);
        if (listEl) listEl.innerHTML = `<div class="empty-state">Could not check for invites.</div>`;
    }
}

const fetchUserProjectsAndImages = async () => {
    if (!state.currentUser) return;
    const galleryContainer = $('#image-gallery-container');
    galleryContainer.innerHTML = `<div class="empty-state">Loading images...</div>`;

    try {
        const projectsRef = collection(db, "ai_templates");
        const q = query(projectsRef, where("userId", "==", state.currentUser.uid));
        const projectSnapshots = await getDocs(q);

        // MODIFIED: Ensure we get project data correctly.
        // IMPORTANT: Your documents in 'ai_templates' MUST have a 'projectName' field.
        state.userProjects = projectSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const allImages = [];
        for (const projectDoc of projectSnapshots.docs) {
            const imagesRef = collection(db, "ai_templates", projectDoc.id, "project_images");
            const imageSnapshots = await getDocs(imagesRef);
            imageSnapshots.forEach(imageDoc => {
                allImages.push({
                    projectId: projectDoc.id,
                    imageId: imageDoc.id,
                    projectName: projectDoc.data().projectName || 'Untitled Project', // This line requires the 'projectName' field
                    ...imageDoc.data()
                });
            });
        }
        state.userImages = allImages;
        renderImagesSection();

    } catch (error) {
        console.error("Error fetching user projects and images:", error);
        galleryContainer.innerHTML = `<div class="empty-state">Could not load images. Please try again later.</div>`;
        notify('Failed to load your images.', 'error');
    }
};
// profile.js

async function fetchAndRenderTeamData() {
    if (!state.currentUser) return;

    try {
        let teamToRender = [];
        let ownerData = null;

        // Case 1: The current user is a member of someone else's team.
        if (state.currentUser.memberOfTeamOwnedBy) {
            const ownerId = state.currentUser.memberOfTeamOwnedBy;
            const ownerRef = doc(db, "users", ownerId);
            const ownerSnap = await getDoc(ownerRef);

            if (ownerSnap.exists()) {
                ownerData = ownerSnap.data();
                // The full team is the owner's team array.
                teamToRender = ownerData.team || [];
            }
        } 
        // Case 2: The current user is the owner of their own team.
        else {
            ownerData = state.currentUser;
            // The full team is the current user's team array.
            teamToRender = state.currentUser.team || [];
        }

        // --- THIS IS THE FIX ---
        // Now, create the final list for rendering by PREPENDING the owner's info.
        if (ownerData) {
            const fullTeamList = [
                { email: ownerData.email, role: 'owner' }, // Add the owner to the top of the list
                ...teamToRender // Add all the other members
            ];
            renderTeamSection(fullTeamList);
        } else {
            // If for some reason we couldn't find an owner, render an empty state.
            renderTeamSection([]);
        }
        // -----------------------

    } catch (error) {
        console.error("Error fetching team data:", error);
        renderTeamSection([]); // Render an empty state on error
    }
}

// ===================================================================================
// VI. RENDER FUNCTIONS
// ===================================================================================

const renderDashboard = () => {
    if (!state.currentUser) return;
    renderHeaderAndSidebar();
    renderProfileSection();
    renderPendingInvitesSection();
    renderTeamSection();
    renderApiKeysSection();
    renderImagesSection(true); 
};
function renderIncomingInvites(invites = []) {
    const listEl = $('#incoming-invites-list');
    if (!listEl) return;

    if (invites.length === 0) {
        listEl.innerHTML = `<p class="empty-state">You have no pending invitations.</p>`;
        return;
    }

    listEl.innerHTML = invites.map(invite => `
        <div class="incoming-invite-item" data-invite-id="${invite.id}" data-inviter-id="${invite.inviterId}">
            <div class="incoming-invite-info">
                <p><strong>${invite.inviterName}</strong> has invited you to join their team.</p>
                <span>Role: <span class="role-badge role--${invite.role}">${invite.role}</span></span>
            </div>
            <div class="incoming-invite-actions">
                <button class="btn btn--secondary btn--sm reject-invite-btn">Decline</button>
                <button class="btn btn--primary btn--sm accept-invite-btn">Accept</button>
            </div>
        </div>
    `).join('');
}
// ... (renderHeaderAndSidebar, renderProfileSection, etc. are unchanged) ...
const renderHeaderAndSidebar = () => {
    const displayName = state.currentUser.displayName || 'Unnamed User';
    
    $('#user-email').textContent = displayName;
    const headerAvatar = $('#user-avatar');
    if (state.currentUser.photoURL) {
        headerAvatar.src = state.currentUser.photoURL;
    } else {
        headerAvatar.removeAttribute('src');
    }

    $('#display-name-header').textContent = displayName;
    $('#email-display').textContent = state.currentUser.email;
    const sidebarAvatar = $('#profile-picture-display');
    if (state.currentUser.photoURL) {
        sidebarAvatar.src = state.currentUser.photoURL;
    } else {
        sidebarAvatar.removeAttribute('src');
    }
};

const renderProfileSection = () => {
    const user = state.currentUser;
    // Display View
    $('#display-name-view').textContent = user.displayName || 'Not set';
    $('#bio-view').textContent = user.bio || 'Not set';
    $('#email-view').textContent = user.email;
    $('#age-view').textContent = user.age || 'Not set';
    $('#gender-view').textContent = user.gender || 'Not set';
    $('#position-view').textContent = user.position || 'Not set';
    $('#website-view').textContent = user.website || 'Not set';
    $('#location-view').textContent = user.location || 'Not set';
    
    // Edit Form
    $('#display-name-input').value = user.displayName || '';
    $('#bio-input').value = user.bio || '';
    $('#email-input').value = user.email;
    $('#age-input').value = user.age || '';
    $('#gender-select').value = user.gender || 'Prefer not to say';
    $('#position-input').value = user.position || '';
    $('#website-input').value = user.website || '';
    $('#location-input').value = user.location || '';
    
    // Avatars in both views
    [ '#profile-picture-view', '#profile-picture-display-form' ].forEach(selector => {
        const el = $(selector);
        if (user.photoURL) el.src = user.photoURL;
        else el.removeAttribute('src');
    });
};

const renderPendingInvitesSection = () => {
    const tableBody = $('#pending-invites-table tbody');
    if (!tableBody) return;
    const invites = state.currentUser.pendingInvites || [];
    tableBody.innerHTML = invites.length === 0
        ? `<tr><td colspan="3" class="empty-state">No pending invites.</td></tr>`
        : invites.map(invite => `
            <tr data-email="${invite.email}">
                <td>${invite.email}</td>
                <td><span class="role-badge role--${invite.role}">${invite.role}</span></td>
                <td class="actions-cell"><button class="btn btn--danger btn--sm revoke-invite-btn">Revoke</button></td>
            </tr>`).join('');
};

function renderTeamSection(team = []) { // Now accepts a team array
    const tableBody = $('#team-members-table tbody');
    if (!tableBody) return;
    
    tableBody.innerHTML = team.length === 0
        ? `<tr><td colspan="3" class="empty-state">Your team is empty.</td></tr>`
        : team.map(member => `
            <tr data-email="${member.email}" data-role="${member.role}">
                <td>${member.email}</td>
                <td><span class="role-badge role--${member.role}">${member.role}</span></td>
                <td class="actions-cell">
                    ${member.role !== 'owner' && state.currentUser.memberOfTeamOwnedBy === undefined ? 
                        '<button class="btn-icon remove-member-btn"><i class="fas fa-trash-alt"></i></button>' : 
                        (member.email === state.currentUser.email ? '(You)' : '')}
                </td>
            </tr>`).join('');
}

const renderApiKeysSection = () => {
    const listEl = $('#api-keys-list');
    if (!listEl) return;
    const apiKeys = state.currentUser.apiKeys || [];
    listEl.innerHTML = apiKeys.length === 0
        ? `<p class="empty-state">No API keys generated yet.</p>`
        : apiKeys.map(key => `
            <div class="api-key-item" data-key="${key}">
                <div class="api-key-info"><strong>Personal Access Token</strong><div class="api-key-input-wrapper"><input type="password" readonly class="form__input api-key-input" value="${key}"><button class="btn-icon toggle-visibility-btn"><i class="fas fa-eye"></i></button></div></div>
                <div class="api-key-actions"><button class="btn btn--secondary btn--sm copy-key-btn">Copy</button><button class="btn btn--danger btn--sm delete-key-btn">Delete</button></div>
            </div>`).join('');
};

/**
 * MODIFIED: Renders the image gallery section, now including a delete button.
 */
const renderImagesSection = (isLoading = false) => {
    const container = $('#image-gallery-container');
    if (!container) return;

    if (isLoading) {
        container.innerHTML = `<div class="empty-state">Loading images...</div>`;
        return;
    }

    if (state.userImages.length === 0) {
        container.innerHTML = `<div class="empty-state">You haven't uploaded any images yet.</div>`;
        return;
    }

    container.innerHTML = `<div class="image-gallery-grid">
        ${state.userImages.map(img => `
            <div class="image-gallery-item" 
                 data-project-id="${img.projectId}" 
                 data-image-id="${img.imageId}">
                <img src="${img.url}" alt="${img.name}" loading="lazy">
                <div class="image-gallery-overlay">
                    <span class="image-name" title="${img.name}">${img.name}</span>
                    <div class="image-actions">
                        <button class="btn-icon edit-name-btn" title="Rename Image"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-icon export-image-btn" title="Export Image"><i class="fas fa-share-square"></i></button>
                        <!-- NEW: Delete Button -->
                        <button class="btn-icon delete-image-btn" title="Delete Image"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            </div>
        `).join('')}
    </div>`;
};

const handleHashChange = () => {
    const hash = window.location.hash || '#profile';
    const targetId = `${hash.substring(1)}-section`;
    $$('.profile-nav-link').forEach(link => link.classList.toggle('active', link.hash === hash));
    $$('.content-section').forEach(section => section.classList.toggle('active', section.id === targetId));
};

// ===================================================================================
// VII. EVENT HANDLERS
// ===================================================================================

const setupEventListeners = () => {
    window.addEventListener('hashchange', handleHashChange);
    $('#login-btn')?.addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()));
    $('#logout-btn')?.addEventListener('click', () => signOut(auth));
    
    $('#edit-profile-btn')?.addEventListener('click', toggleEditMode);
    $('#cancel-edit-btn')?.addEventListener('click', toggleEditMode);
    $('#profile-form')?.addEventListener('submit', handleProfileUpdate);
    
    $('#choose-avatar-form-btn')?.addEventListener('click', openAvatarModal);
    $('#avatar-grid')?.addEventListener('click', handleAvatarSelection);
    
    $('#invite-form')?.addEventListener('submit', handleTeamInvite);
    $('#team-members-table')?.addEventListener('click', handleTeamMemberRemove);
    $('#pending-invites-table')?.addEventListener('click', handleRevokeInvite);
    
    $('#generate-api-key-btn')?.addEventListener('click', handleApiKeyGenerate);
    $('#api-keys-list')?.addEventListener('click', handleApiKeyActions);
    
    $('#delete-account-btn')?.addEventListener('click', () => {
        toggleModal('delete-account-modal', true);
        $('#delete-confirm-input').value = '';
        $('#confirm-delete-btn').disabled = true;
    });
    $('#delete-confirm-input')?.addEventListener('input', (e) => {
        $('#confirm-delete-btn').disabled = (e.target.value !== 'delete my account');
    });
    $('#confirm-delete-btn')?.addEventListener('click', handleAccountDeletion);
        
    document.body.addEventListener('click', (e) => {
        if (e.target.matches('.modal__close, #cancel-delete-btn, #close-notification-btn')) {
            e.target.closest('.modal')?.classList.add('hidden');
        }
        if (e.target.matches('.modal__overlay')) {
            e.target.closest('.modal')?.classList.add('hidden');
        }
        if (!e.target.closest('.custom-context-menu') && !e.target.closest('.export-image-btn')) {
             $('#custom-context-menu').classList.add('hidden');
        }
    });

    $('#image-gallery-container')?.addEventListener('click', handleImageActions);
    $('#incoming-invites-list')?.addEventListener('click', handleInviteAction); // <-- ADD THIS LINE
    $('#image-gallery-container')?.addEventListener('click', handleImageActions);
};

// ... (other handlers remain the same) ...

const openAvatarModal = () => {
    const grid = $('#avatar-grid');
    grid.innerHTML = AVATAR_LIST.map(url => 
        `<img src="${url}" alt="Avatar option" class="avatar-item ${url === state.currentUser.photoURL ? 'selected' : ''}">`
    ).join('');
    toggleModal('avatar-selection-modal', true);
};

const toggleEditMode = () => {
    const isEditing = $('#profile-form').classList.contains('hidden');
    $('#profile-display-view').classList.toggle('hidden', isEditing);
    $('#profile-form').classList.toggle('hidden', !isEditing);
    $('#edit-profile-btn').classList.toggle('hidden', isEditing);
    if (!isEditing) renderProfileSection(); // Re-render to discard changes on cancel
};

const handleAvatarSelection = async (e) => {
    const target = e.target;
    if (!target.matches('.avatar-item')) return;
    const newAvatarUrl = target.src;
    state.currentUser.photoURL = newAvatarUrl;
    renderDashboard();
    toggleModal('avatar-selection-modal', false);
    try {
        await updateDoc(doc(db, "users", state.currentUser.uid), { photoURL: newAvatarUrl, lastUpdated: serverTimestamp() });
        notify('Avatar updated!', 'success');
    } catch (err) {
        console.error("Failed to save avatar choice:", err);
        notify("Could not save your avatar choice.", "error");
    }
};

async function handleProfileUpdate(e) {
    e.preventDefault();
    setLoading($('#save-profile-btn'), true, 'Saving...');
    try {
        const payload = {
            displayName: $('#display-name-input').value.trim(),
            bio: $('#bio-input').value.trim(),
            age: parseInt($('#age-input').value, 10) || null,
            gender: $('#gender-select').value,
            position: $('#position-input').value.trim(),
            website: $('#website-input').value.trim(),
            location: $('#location-input').value.trim(),
            lastUpdated: serverTimestamp()
        };
        await updateDoc(doc(db, "users", state.currentUser.uid), payload);
        Object.assign(state.currentUser, payload);
        renderHeaderAndSidebar();
        renderProfileSection();
        toggleEditMode();
        notify('Profile updated!', 'success');
    } catch (error) {
        console.error("Profile update error:", error);
        notify(`Error updating profile: ${error.message}`, 'error');
    } finally {
        setLoading($('#save-profile-btn'), false);
    }
}
async function handleTeamInvite(e) {
    e.preventDefault();
    const emailInput = $('#invite-email-input');
    const newMemberEmail = emailInput.value.trim();
    const role = $('#invite-role-select').value;
    const inviterId = state.currentUser.uid;

    if (!newMemberEmail || !/^\S+@\S+\.\S+$/.test(newMemberEmail)) {
        return notify('Please enter a valid email.', 'error');
    }

    // Optional: Check if the user is already on the team locally to prevent duplicate invites
    if (state.currentUser.team?.some(m => m.email === newMemberEmail)) {
        return notify('This user is already on your team.', 'error');
    }

    setLoading($('#invite-btn'), true, 'Sending...');

    try {
        // --- THIS IS THE NEW LOGIC ---
        // We create a new document in the top-level 'invites' collection.
        const invitesCollectionRef = collection(db, "invites");
        await addDoc(invitesCollectionRef, {
            inviterId: inviterId,
            inviterName: state.currentUser.displayName || state.currentUser.email,
            inviteeEmail: newMemberEmail,
            role: role,
            status: 'pending',
            createdAt: serverTimestamp() // serverTimestamp() is allowed with set() or addDoc()
        });
        // -----------------------------

        // We still add it locally for the inviter's UI to update immediately.
        // This is now just a UI convenience, not the source of truth for the invitee.
        const localInvite = { email: newMemberEmail, role: role, status: 'pending', invitedAt: new Date() };
        await updateDoc(doc(db, "users", inviterId), { pendingInvites: arrayUnion(localInvite) });
        state.currentUser.pendingInvites = [...(state.currentUser.pendingInvites || []), localInvite];
        
        renderPendingInvitesSection();
        emailInput.value = '';
        notify('Invite sent successfully!', 'success');

    } catch (error) {
        console.error("Error sending invite:", error);
        notify(`Failed to send invite: ${error.message}`, 'error');
    } finally {
        setLoading($('#invite-btn'), false);
    }
}

async function handleInviteAction(e) {
    const acceptBtn = e.target.closest('.accept-invite-btn');
    const rejectBtn = e.target.closest('.reject-invite-btn');
    if (!acceptBtn && !rejectBtn) return;

    const item = e.target.closest('.incoming-invite-item');
    const { inviteId, inviterId } = item.dataset;
    const isAccepting = !!acceptBtn;

    const btn = isAccepting ? acceptBtn : rejectBtn;
    setLoading(btn, true);

    try {
        const inviteRef = doc(db, "invites", inviteId);
        
        if (isAccepting) {
            // --- THIS IS THE NEW LOGIC ---
            // 1. Add the current user (invitee) to the inviter's 'team' array.
            const inviterRef = doc(db, "users", inviterId);
            const inviterSnap = await getDoc(inviterRef);
            if (!inviterSnap.exists()) throw new Error("Inviting user not found.");

            const role = inviterSnap.data().pendingInvites.find(p => p.email === state.currentUser.email)?.role || 'editor';
            const newTeamMember = { email: state.currentUser.email, role: role };
            const pendingInviteToRemove = inviterSnap.data().pendingInvites.find(p => p.email === state.currentUser.email);

            await updateDoc(inviterRef, {
                team: arrayUnion(newTeamMember),
                pendingInvites: arrayRemove(pendingInviteToRemove)
            });

            // 2. ALSO, update the current user's (invitee's) own document
            //    to link them to the owner's team. This is the key fix.
            const inviteeRef = doc(db, "users", state.currentUser.uid);
            await updateDoc(inviteeRef, {
                memberOfTeamOwnedBy: inviterId
            });
            // -----------------------------

            // 3. Delete the invite document
            await deleteDoc(inviteRef);
            notify('Invitation accepted! You have joined the team.', 'success');
        } else {
            // Just delete the invite document
            await deleteDoc(inviteRef);
            notify('Invitation declined.', 'success');
        }

        // Refresh both the incoming invites and the team member list
        fetchAndRenderIncomingInvites();
        fetchAndRenderTeamData(); // Use the new function we will create next

    } catch (error) {
        console.error(`Error ${isAccepting ? 'accepting' : 'rejecting'} invite:`, error);
        notify(`Failed to process invitation: ${error.message}`, 'error');
        setLoading(btn, false);
    }
}

async function handleRevokeInvite(e) {
    const revokeBtn = e.target.closest('.revoke-invite-btn');
    if (!revokeBtn) return;
    const emailToRevoke = revokeBtn.closest('tr').dataset.email;
    if (confirm(`Are you sure you want to revoke the invite for ${emailToRevoke}?`)) {
        const newInvites = (state.currentUser.pendingInvites || []).filter(i => i.email !== emailToRevoke);
        try {
            await updateDoc(doc(db, "users", state.currentUser.uid), { pendingInvites: newInvites });
            state.currentUser.pendingInvites = newInvites;
            renderPendingInvitesSection();
            notify('Invite revoked.', 'success');
        } catch (error) {
            console.error("Error revoking invite:", error);
            notify(`Failed to revoke invite: ${error.message}`, 'error');
        }
    }
}

async function handleTeamMemberRemove(e) {
    const removeBtn = e.target.closest('.remove-member-btn');
    if (!removeBtn) return;
    const row = removeBtn.closest('tr');
    const memberToRemove = { email: row.dataset.email, role: row.dataset.role };
    if (confirm(`Are you sure you want to remove ${memberToRemove.email}?`)) {
        try {
            await updateDoc(doc(db, "users", state.currentUser.uid), { team: arrayRemove(memberToRemove) });
            state.currentUser.team = state.currentUser.team.filter(m => m.email !== memberToRemove.email);
            renderTeamSection();
            notify('Team member removed.', 'success');
        } catch (error) {
            console.error("Error removing member:", error);
            notify(`Failed to remove member: ${error.message}`, 'error');
        }
    }
}

async function handleApiKeyGenerate() {
    const newKey = generateApiKey();
    try {
        await updateDoc(doc(db, "users", state.currentUser.uid), { apiKeys: arrayUnion(newKey) });
        state.currentUser.apiKeys = [...(state.currentUser.apiKeys || []), newKey];
        renderApiKeysSection();
        notify('New API key generated.', 'success');
    } catch (error) {
        console.error("Error generating API key:", error);
        notify(`Failed to generate key: ${error.message}`, 'error');
    }
}

async function handleApiKeyActions(e) {
    const keyItem = e.target.closest('.api-key-item');
    if (!keyItem) return;
    const key = keyItem.dataset.key;
    if (e.target.closest('.delete-key-btn')) {
        if (confirm('Are you sure you want to delete this API key?')) {
            try {
                await updateDoc(doc(db, "users", state.currentUser.uid), { apiKeys: arrayRemove(key) });
                state.currentUser.apiKeys = state.currentUser.apiKeys.filter(k => k !== key);
                renderApiKeysSection();
                notify('API key deleted.', 'success');
            } catch (error) { notify(`Failed to delete key: ${error.message}`, 'error'); }
        }
    }
    if (e.target.closest('.copy-key-btn')) {
        copyToClipboard(key);
        e.target.textContent = 'Copied!';
        setTimeout(() => { e.target.textContent = 'Copy'; }, 2000);
    }
    if (e.target.closest('.toggle-visibility-btn')) {
        const input = keyItem.querySelector('.api-key-input');
        const icon = keyItem.querySelector('i');
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        icon.classList.toggle('fa-eye', !isPassword);
        icon.classList.toggle('fa-eye-slash', isPassword);
    }
}

/**
 * MODIFIED: Handles all clicks within the image gallery (rename, export, DELETE).
 */
function handleImageActions(e) {
    const renameBtn = e.target.closest('.edit-name-btn');
    const exportBtn = e.target.closest('.export-image-btn');
    const deleteBtn = e.target.closest('.delete-image-btn'); // NEW
    const item = e.target.closest('.image-gallery-item');
    if (!item) return;
    const { projectId, imageId } = item.dataset;

    if (renameBtn) {
        handleImageRename(projectId, imageId);
    }
    if (exportBtn) {
        showExportContextMenu(e, projectId, imageId);
    }
    if (deleteBtn) { // NEW
        handleImageDelete(projectId, imageId);
    }
}

async function handleImageRename(projectId, imageId) {
    const image = state.userImages.find(img => img.imageId === imageId);
    const newName = prompt("Enter a new name for the image:", image.name);
    if (newName && newName.trim() !== '') {
        try {
            const imageRef = doc(db, "ai_templates", projectId, "project_images", imageId);
            await updateDoc(imageRef, { name: newName.trim() });
            image.name = newName.trim();
            renderImagesSection();
            notify('Image renamed successfully!', 'success');
        } catch (error) {
            console.error("Error renaming image:", error);
            notify('Failed to rename image.', 'error');
        }
    }
}

function showExportContextMenu(event, sourceProjectId, imageId) {
    const menu = $('#custom-context-menu');
    const otherProjects = state.userProjects.filter(p => p.id !== sourceProjectId);

    let content = '<div class="context-menu-header">Export to Project</div>';
    if (otherProjects.length > 0) {
        content += otherProjects.map(p => 
            // MODIFIED: This now correctly uses p.projectName
            `<button class="context-menu-item" data-target-project-id="${p.id}">${p.name || 'Untitled Project'}</button>`
        ).join('');
    } else {
        content += `<div class="context-menu-item" style="cursor: default; color: var(--text-light);">No other projects found.</div>`;
    }
    menu.innerHTML = content;

    menu.onclick = (e) => {
        const targetBtn = e.target.closest('.context-menu-item[data-target-project-id]');
        if (targetBtn) {
            const targetProjectId = targetBtn.dataset.targetProjectId;
            handleImageExport(imageId, targetProjectId);
            menu.classList.add('hidden');
        }
    };
    
    menu.style.top = `${event.pageY}px`;
    menu.style.left = `${event.pageX}px`;
    menu.classList.remove('hidden');
}

async function handleImageExport(imageId, targetProjectId) {
    const imageToExport = state.userImages.find(img => img.imageId === imageId);
    if (!imageToExport) return notify('Image data not found.', 'error');

    const newImageData = {
        name: imageToExport.name,
        url: imageToExport.url,
        publicId: imageToExport.publicId,
        createdAt: serverTimestamp(),
    };

    try {
        const targetCollectionRef = collection(db, "ai_templates", targetProjectId, "project_images");
        await addDoc(targetCollectionRef, newImageData);
        notify(`Image exported successfully!`, 'success');
    } catch (error) {
        console.error("Error exporting image:", error);
        notify('Failed to export image.', 'error');
    }
}

/**
 * NEW: Handles the deletion of a single image.
 */
async function handleImageDelete(projectId, imageId) {
    const image = state.userImages.find(img => img.imageId === imageId);
    if (!image) return;
    
    if (confirm(`Are you sure you want to permanently delete the image "${image.name}"? This action cannot be undone.`)) {
        try {
            // Delete the document from Firestore
            const imageRef = doc(db, "ai_templates", projectId, "project_images", imageId);
            await deleteDoc(imageRef);

            // Update local state and re-render the gallery
            state.userImages = state.userImages.filter(img => img.imageId !== imageId);
            renderImagesSection();

            notify('Image deleted successfully!', 'success');
            
            // NOTE: This does not delete the image from the storage provider (e.g., Cloudinary).
            // That would require a backend function for security.
        } catch (error) {
            console.error("Error deleting image:", error);
            notify('Failed to delete image.', 'error');
        }
    }
}


async function handleAccountDeletion() {
    setLoading($('#confirm-delete-btn'), true, 'Deleting...');
    try {
        await deleteUser(auth.currentUser);
        notify('Account deleted successfully. You will be logged out.', 'success');
    } catch (error) {
        let msg = `Failed to delete account: ${error.message}`;
        if (error.code === 'auth/requires-recent-login') {
            msg = "This is a sensitive operation. Please sign out and sign back in before deleting your account.";
        }
        notify(msg, 'error', 5000);
        setLoading($('#confirm-delete-btn'), false);
    }
}