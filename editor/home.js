// --- home.js ---
// This script fetches and displays public templates on the homepage.

// Import the necessary Firestore functions from the Firebase SDK
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

/**
 * Fetches public templates from Firestore and renders them on the homepage.
 */
const loadPublicTemplates = async () => {
    const templatesGrid = document.getElementById('public-templates-grid');
    if (!templatesGrid) {
        console.error("Template grid element not found on this page.");
        return; // Exit if the grid element isn't on the page
    }

    try {
        // 1. Create a query to get documents from the 'ai_templates' collection that are:
        //    - Marked as public (isPublic == true)
        //    - Ordered by the donation date, showing the newest first
        //    - Limited to a maximum of 6 to keep the homepage tidy
        const q = query(
            collection(db, 'ai_templates'), 
            where("isPublic", "==", true),
            orderBy("donatedAt", "desc"),
            limit(6)
        );

        // 2. Execute the query to get the documents
        const querySnapshot = await getDocs(q);

        // 3. Handle the case where no public templates are found
        if (querySnapshot.empty) {
            templatesGrid.innerHTML = `
                <p class="section-subtitle" style="grid-column: 1 / -1;">
                    No public templates have been shared yet. Be the first to donate one from the editor!
                </p>`;
            return;
        }

        // 4. If templates are found, build the HTML for each template card
        const templatesHTML = querySnapshot.docs.map(doc => {
            const template = doc.data();
            
            // Define a default placeholder image in case a template doesn't have a thumbnail
            const placeholderImage = 'logo.png';
            
            // Use the template's real thumbnail if it exists, otherwise use the placeholder
            const imageUrl = template.thumbnailUrl || placeholderImage;
            
            return `
                <div class="template-card">
                    <img src="${imageUrl}" alt="${template.name} Template Screenshot">
                    <h3>${template.name}</h3>
                    <a href="index.html?templateId=${doc.id}" class="btn btn--secondary">Open in Editor</a>
                </div>
            `;
        }).join('');

        // 5. Replace the "Loading..." message with the generated template cards
        templatesGrid.innerHTML = templatesHTML;

    } catch (error) {
        console.error("Error loading public templates:", error);
        templatesGrid.innerHTML = `
            <p class="section-subtitle" style="grid-column: 1 / -1; color: #E53E3E;">
                Could not load public templates at this time. Please check the console for errors.
            </p>`;
        // Note for developer: This error often happens if the required Firestore index is not created.
        // Firebase usually provides a link in the developer console error message to create it automatically.
    }
};

// Add an event listener to run the function after the page's HTML has fully loaded.
document.addEventListener('DOMContentLoaded', loadPublicTemplates);