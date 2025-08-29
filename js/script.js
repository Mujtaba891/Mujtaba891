/**
 * @file Main script for the index.html page.
 * @author Mujtaba Alam
 * @version 2.1.0
 * @description FIX: Implemented a robust, fully-functional mobile sidebar toggle.
 *              - Handles open, close, click-outside-to-close, and Escape key closing.
 *              - Prevents body scroll when the sidebar is open.
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

    const UIElements = {
        hamburger: document.querySelector('.hamburger'),
        mobileSidebar: document.querySelector('.mobile-sidebar'),
        closeIcon: document.querySelector('.close-icon'),
        mobileNavLinks: document.querySelectorAll('.nav-menu-mobile a'),
        animationTargets: document.querySelectorAll('.animate-on-scroll'),
        pageBody: document.body
    };

    function initializePage() {
        console.log("Initializing page scripts...");
        setupMobileNavigation();
        setupScrollAnimations();
        console.log("Page scripts initialized successfully.");
    }

    /**
     * FIX: This is the fully functional and robust sidebar setup.
     */
    function setupMobileNavigation() {
        if (!UIElements.hamburger || !UIElements.mobileSidebar || !UIElements.closeIcon) {
            console.warn("Mobile navigation elements not found. Aborting setup.");
            return;
        }

        const openSidebar = () => {
            UIElements.mobileSidebar.classList.add('active');
            UIElements.pageBody.style.overflow = 'hidden'; // Prevent background scroll
        };

        const closeSidebar = () => {
            UIElements.mobileSidebar.classList.remove('active');
            UIElements.pageBody.style.overflow = ''; // Restore scrolling
        };

        UIElements.hamburger.addEventListener('click', (event) => {
            event.stopPropagation();
            openSidebar();
        });

        UIElements.closeIcon.addEventListener('click', closeSidebar);
        
        UIElements.mobileNavLinks.forEach(link => {
            link.addEventListener('click', closeSidebar);
        });

        document.addEventListener('click', (event) => {
            if (UIElements.mobileSidebar.classList.contains('active') && !UIElements.mobileSidebar.contains(event.target)) {
                closeSidebar();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && UIElements.mobileSidebar.classList.contains('active')) {
                closeSidebar();
            }
        });
    }

    function setupScrollAnimations() {
        if (!('IntersectionObserver' in window)) {
            UIElements.animationTargets.forEach(el => el.classList.add('visible'));
            return;
        }

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        UIElements.animationTargets.forEach(target => observer.observe(target));
    }

    initializePage();
});

// Add this to your existing script.js file

document.addEventListener("DOMContentLoaded", () => {
    
    // --- SKILL BAR ANIMATION ---
    const skillsSection = document.querySelector("#skills");
    const skillLevels = document.querySelectorAll(".skill-level");

    const animateSkills = () => {
        skillLevels.forEach(skillLevel => {
            // Get the target width from the data-level attribute
            const targetWidth = skillLevel.dataset.level;
            // Set the width to trigger the CSS transition
            skillLevel.style.width = targetWidth;
        });
    };

    // Use Intersection Observer to trigger animation when section is visible
    const skillObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateSkills();
                // Stop observing once the animation has been triggered
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 }); // Trigger when 30% of the section is visible

    if (skillsSection) {
        skillObserver.observe(skillsSection);
    }

    // --- PHOTO GALLERY LIGHTBOX ---
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const galleryImages = document.querySelectorAll('.gallery-img');
    const lightboxClose = document.querySelector('.lightbox-close');

    if (lightbox) {
        galleryImages.forEach(image => {
            image.addEventListener('click', () => {
                lightbox.style.display = 'flex';
                lightboxImg.src = image.src;
                document.body.style.overflow = 'hidden'; // Prevent background scrolling
            });
        });

        const closeLightbox = () => {
            lightbox.style.display = 'none';
            document.body.style.overflow = 'auto'; // Restore scrolling
        };

        // Close lightbox when the close button or the background is clicked
        lightboxClose.addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });
    }

    // You can also add the hamburger menu and scroll animation observers here
    // if they are not already in your script.js file.
    
});