// home.js

import { db } from './firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// --- STATE, CONSTANTS, & UI ELEMENTS ---
const CATEGORIES = [
    'All', 'Portfolio', 'AI Tools', 'E-commerce', 'Business', 
    'Marketing & Sales', 'Forms & Surveys', 'Blog & Content', 'Education', 
    'Technology', 'Real Estate', 'Health & Fitness', 'Food & Drink', 'Events', 'Other'
];

let allTemplates = [];
let templatesInitialized = false; // Flag to prevent multiple fetches
let currentCategory = 'All';
let currentSearchTerm = '';

const gridEl = document.getElementById('public-templates-grid');
const searchInput = document.getElementById('template-search');
const categoriesContainer = document.getElementById('category-filters');
const showTemplatesBtn = document.getElementById('show-templates-btn');
const navTemplatesLink = document.getElementById('nav-templates-link');
const templatesSection = document.getElementById('templates');

// --- "AI" CATEGORIZATION LOGIC ---
const determineCategory = (name) => {
    const n = name.toLowerCase();
    if (n.includes('form') || n.includes('survey') || n.includes('inquiry') || n.includes('registration') || n.includes('application') || n.includes('feedback') || n.includes('onboarding') || n.includes('proposal') || n.includes('enrollment')) return 'Forms & Surveys';
    if (n.includes('portfolio') || n.includes('resume') || n.includes('cv') || n.includes('personal bio') || n.includes('photographer') || n.includes('designer') || n.includes('scholar') || n.includes('speaker')) return 'Portfolio';
    if (n.includes(' ai') || n.includes('advisor') || n.includes('optimization') || n.includes('assistant') || n.includes('co-pilot')) return 'AI Tools';
    if (n.includes('shop') || n.includes('store') || n.includes('e-commerce') || n.includes('product')) return 'E-commerce';
    if (n.includes('agency') || n.includes('business') || n.includes('startup') || n.includes('saas') || n.includes('consultancy') || n.includes('analytics') || n.includes('customer support')) return 'Business';
    if (n.includes('marketing') || n.includes('sales') || n.includes('lead generation') || n.includes('landing page')) return 'Marketing & Sales';
    if (n.includes('blog') || n.includes('news') || n.includes('magazine')) return 'Blog & Content';
    if (n.includes('education') || n.includes('madrasa')) return 'Education';
    if (n.includes('crypto') || n.includes('tech') || n.includes('app launch') || n.includes('ai tool')) return 'Technology';
    if (n.includes('real estate')) return 'Real Estate';
    if (n.includes('fitness') || n.includes('salon') || n.includes('spa')) return 'Health & Fitness';
    if (n.includes('cafe') || n.includes('restaurant') || n.includes('grocery')) return 'Food & Drink';
    if (n.includes('artist') || n.includes('musician') || n.includes('event')) return 'Events';
    return 'Other';
};

// --- RENDERING FUNCTIONS ---
const renderTemplates = (templatesToRender) => {
    if (!gridEl) return;
    if (templatesToRender.length === 0) {
        gridEl.innerHTML = `<div class="templates-empty"><i class="fas fa-search"></i><p>No templates found matching your criteria.</p></div>`;
        return;
    }
    const templatesHTML = templatesToRender.map(t => {
        const placeholderImage = 'logo.png';
        let imageUrl = t.data.thumbnailUrl || placeholderImage;
        if (imageUrl.includes('cloudinary')) {
            imageUrl = imageUrl.replace('/upload/', '/upload/w_400,c_fill,q_auto/');
        }
        return `
            <div class="template-card">
                <img src="${imageUrl}" alt="${t.data.name}" loading="lazy">
                <h3>${t.data.name}</h3>
                <a href="./Project?project=${t.id}" class="btn btn--secondary">Open in Editor</a>
            </div>
        `;
    }).join('');
    gridEl.innerHTML = templatesHTML;
};

const renderCategoryFilters = () => {
    if (!categoriesContainer) return;
    const buttonsHTML = CATEGORIES.map(category => `
        <button class="filter-btn ${category === 'All' ? 'active' : ''}" data-category="${category}">
            ${category}
        </button>
    `).join('');
    categoriesContainer.innerHTML = buttonsHTML;
};

// --- CORE LOGIC ---
const filterAndRender = () => {
    const term = currentSearchTerm.toLowerCase();
    const filtered = allTemplates.filter(t => {
        const categoryMatch = currentCategory === 'All' || t.derivedCategory === currentCategory;
        const searchMatch = !term || t.data.name.toLowerCase().includes(term);
        return categoryMatch && searchMatch;
    });
    renderTemplates(filtered);
};

const initializeTemplates = async () => {
    if (!gridEl || templatesInitialized) return;
    templatesInitialized = true; // Set flag to true

    gridEl.innerHTML = `<div class="templates-loading"><div class="spinner"></div><p>Loading community templates...</p></div>`;

    try {
        const q = query(
            collection(db, 'ai_templates'),
            where("isPublic", "==", true)
        );
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            gridEl.innerHTML = `<div class="templates-empty"><i class="fas fa-folder-open"></i><p>No public templates available yet. Be the first!</p></div>`;
            return;
        }

        let templatesFromDB = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return { id: doc.id, data: data, derivedCategory: determineCategory(data.name) };
        });

        // Fisher-Yates shuffle algorithm
        for (let i = templatesFromDB.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [templatesFromDB[i], templatesFromDB[j]] = [templatesFromDB[j], templatesFromDB[i]];
        }
        allTemplates = templatesFromDB;

        renderCategoryFilters();
        renderTemplates(allTemplates);
    } catch (error) {
        console.error("Error loading templates:", error);
        gridEl.innerHTML = `<div class="templates-empty"><p style="color: #E53E3E;">Error loading templates. Check console.</p></div>`;
    }
};

// --- EVENT LISTENERS ---
const handleShowTemplatesClick = (e) => {
    e.preventDefault();
    if (templatesSection) {
        // Make the section visible
        templatesSection.style.display = 'block';

        // Scroll to the section smoothly
        templatesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Fetch templates if they haven't been fetched yet
        initializeTemplates();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners for showing the templates
    if (showTemplatesBtn) {
        showTemplatesBtn.addEventListener('click', handleShowTemplatesClick);
    }
    if (navTemplatesLink) {
        navTemplatesLink.addEventListener('click', handleShowTemplatesClick);
    }

    // Event listener for search input
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                currentSearchTerm = searchInput.value.trim();
                filterAndRender();
            }, 300);
        });
    }

    // Event delegation for category filters
    if (categoriesContainer) {
        categoriesContainer.addEventListener('click', (e) => {
            if (!e.target.matches('.filter-btn')) return;
            document.querySelector('.filter-btn.active')?.classList.remove('active');
            e.target.classList.add('active');
            currentCategory = e.target.dataset.category;
            filterAndRender();
        });
    }

});
