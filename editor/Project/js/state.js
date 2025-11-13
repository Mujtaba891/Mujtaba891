// js/state.js
export const s = {
    user: null,
    apiKey: null,
    html: '',
    editId: null,
    isGenerating: false,
    // FIX: Initialize the chat history with the welcome message
    chatHistory: [{ role: 'ai', text: 'Hello! How can I help you build a website today?' }],
    currentProjectData: null,
    currentCollectionId: null,
    currentCollectionName: null,
    documents: [],
    currentDocumentIndex: null,
    currentDocumentData: null,
    activeMentionInput: null,
    projectUnsubscribe: null,
    sharedProjects: [],
    // State for Collaboration & Versioning
    currentUserRole: null,
    selectedVersionId: null,
    realtimeStatusTimeout: null,
    chatMentions: [], 
};