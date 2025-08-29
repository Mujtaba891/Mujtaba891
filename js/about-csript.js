/**
 * @file Script for the about.html page.
 * @author Mujtaba Alam
 * @version 1.0.0
 * @description Adds functionality for animated skill bars on scroll and
 *              an interactive photo gallery lightbox.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    /**
     * Handles the animated skill bars.
     */
    function setupSkillBarAnimations() {
        const skillLevels = document.querySelectorAll('.skill-level');

        if (!('IntersectionObserver' in window)) {
            // Fallback for older browsers: just show the skill bars
            skillLevels.forEach(skill => {
                skill.style.width = skill.dataset.level;
            });
            return;
        }

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const skillBar = entry.target;
                    // Animate the width from 0 to the value in data-level
                    skillBar.style.width = skillBar.dataset.level;
                    // Stop observing once the animation has been triggered
                    observer.unobserve(skillBar);
                }
            });
        }, {
            threshold: 0.5 // Trigger when 50% of the element is visible
        });

        skillLevels.forEach(skill => {
            observer.observe(skill);
        });
    }

    /**
     * Handles the photo gallery lightbox functionality.
     */
    function setupPhotoLightbox() {
        const galleryImages = document.querySelectorAll('.gallery-img');
        const lightbox = document.getElementById('lightbox');
        const lightboxImg = document.getElementById('lightbox-img');
        const lightboxClose = document.querySelector('.lightbox-close');

        if (!lightbox || !lightboxImg || !lightboxClose) {
            console.warn('Lightbox elements not found. Aborting lightbox setup.');
            return;
        }

        galleryImages.forEach(img => {
            img.parentElement.addEventListener('click', () => {
                lightbox.classList.add('active');
                lightboxImg.src = img.src;
            });
        });

        const closeLightbox = () => {
            lightbox.classList.remove('active');
        };

        lightboxClose.addEventListener('click', closeLightbox);
        
        // Also close lightbox when clicking on the background overlay
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });

        // Close lightbox with the Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lightbox.classList.contains('active')) {
                closeLightbox();
            }
        });
    }

    // --- Initialize all functionalities ---
    setupSkillBarAnimations();
    setupPhotoLightbox();
});