// js/versions.js

import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, getDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { s } from './state.js';
import { $ } from './utils.js';
import { notify, toggleModal, setLoading } from './ui.js';

export const saveVersion = async (action = 'Manual Save') => {
    if (!s.editId || s.currentUserRole === 'viewer') return;
    try {
        const versionsCol = collection(db, "ai_templates", s.editId, "versions");
        await addDoc(versionsCol, {
            htmlContent: s.html,
            chatHistory: s.chatHistory,
            savedAt: serverTimestamp(),
            savedBy: {
                uid: s.user.uid,
                name: s.user.displayName || s.user.email
            },
            action: action,
        });
    } catch (e) {
        console.error("Failed to save version:", e);
        notify("Could not save project version.", 'error');
    }
};

export const loadVersionHistory = async () => {
    if (!s.editId) return;
    const listEl = $('versions-list');
    listEl.innerHTML = '<div class="spinner-small"></div> Loading history...';
    try {
        const q = query(collection(db, "ai_templates", s.editId, "versions"), orderBy("savedAt", "desc"));
        const snap = await getDocs(q);
        const versions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (versions.length === 0) {
            listEl.innerHTML = '<p>No saved versions found for this project.</p>';
            return;
        }
        listEl.innerHTML = versions.map(v => {
            const date = v.savedAt ? new Date(v.savedAt.seconds * 1000).toLocaleString() : 'N/A';
            return `
                <div class="version-item" data-version-id="${v.id}">
                    <div class="version-item__meta">
                        <strong>${v.action}</strong>
                        <small>${date}</small>
                    </div>
                    <div class="version-item__user">by ${v.savedBy.name}</div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error("Error loading version history:", e);
        listEl.innerHTML = '<p style="color:red">Could not load history.</p>';
    }
};

export const restoreVersion = async () => {
    if (!s.editId || !s.selectedVersionId || (s.currentUserRole !== 'owner' && s.currentUserRole !== 'editor')) {
        return notify("You don't have permission to restore versions.", "error");
    }
    if (!confirm("Are you sure? This will overwrite the current project content with the selected version.")) return;

    setLoading($('restore-version-btn'), true, 'Restoring...');
    try {
        const versionDoc = await getDoc(doc(db, "ai_templates", s.editId, "versions", s.selectedVersionId));
        if (versionDoc.exists()) {
            const versionData = versionDoc.data();
            const projectRef = doc(db, "ai_templates", s.editId);
            await updateDoc(projectRef, {
                htmlContent: versionData.htmlContent,
                chatHistory: versionData.chatHistory
            });
            await saveVersion(`Restored from version saved at ${new Date(versionData.savedAt.seconds * 1000).toLocaleTimeString()}`);
            toggleModal('version-history-modal', false);
            notify("Project restored successfully!", 'success');
        } else {
            throw new Error("Version not found.");
        }
    } catch (err) {
        notify(`Restore failed: ${err.message}`, 'error');
    } finally {
        setLoading($('restore-version-btn'), false);
    }
};