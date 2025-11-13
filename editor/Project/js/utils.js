// js/utils.js

export const $ = id => document.getElementById(id);

export const throttle = (func, limit) => {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// --- SMOOTH AI TYPING ENGINE ---
export function smoothType(editorEl, code, speed = 10) {
    editorEl.value = "";
    let index = 0;

    const interval = setInterval(() => {
        editorEl.value += code[index];
        editorEl.scrollTop = editorEl.scrollHeight;
        index++;

        if (index >= code.length) clearInterval(interval);
    }, speed);
}

export function smoothTypeWithLines(editorEl, lineEl, code, speed = 10) {
    editorEl.value = "";
    lineEl.value = "";
    let index = 0;

    const interval = setInterval(() => {
        editorEl.value += code[index];

        const lines = editorEl.value.split("\n").length;
        lineEl.value = Array.from({ length: lines }, (_, i) => i + 1).join("\n");

        editorEl.scrollTop = editorEl.scrollHeight;
        lineEl.scrollTop = editorEl.scrollTop;

        index++;

        if (index >= code.length) clearInterval(interval);
    }, speed);
}


export const slugify = text => text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .substring(0, 50);