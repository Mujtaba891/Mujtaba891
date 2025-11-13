// mobile.js

document.addEventListener("DOMContentLoaded", function () {
    const isMobile =
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
        ) || window.innerWidth < 768;

    if (!isMobile) return;

    // Create overlay
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "#ffffff";
    overlay.style.zIndex = "999999";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.textAlign = "center";
    overlay.style.padding = "20px";

    overlay.innerHTML = `
        <div style="font-size: 60px; color:#dc3545; margin-bottom: 20px;">
            <i class="fa-solid fa-triangle-exclamation"></i>
        </div>

        <h2 style="font-size: 22px; color:#111; font-weight:600;">
            Please open in Desktop Mode
        </h2>

        <button id="desktopBtn"
            style="
                margin-top:20px;
                padding:10px 20px;
                font-size:16px;
                background:#4f46e5;
                color:white;
                border:none;
                border-radius:8px;
                cursor:pointer;
            ">
            Visit Desktop Site
        </button>
    `;

    document.body.appendChild(overlay);

    // Button action
    document.getElementById("desktopBtn").onclick = function () {
        alert("Please enable Desktop Mode in your browser settings.");
    };
});
