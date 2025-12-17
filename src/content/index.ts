console.log("Recordo content script loaded");

let isRecording = false;

// Listen for recording state changes from background
chrome.runtime.onMessage.addListener((message) => {
    console.log("[Content] Received message:", message);
    if (message.type === 'RECORDING_STATUS_CHANGED') {
        isRecording = message.isRecording;
        console.log("[Content] isRecording updated to:", isRecording);
    }
});

// Also check initial state safely
chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' }, (response) => {
    if (chrome.runtime.lastError) {
        // Background might not be ready or we are orphaned
        console.log("[Content] Setup error or orphaned:", chrome.runtime.lastError.message);
        return;
    }
    console.log("[Content] Initial recording state:", response);
    if (response?.isRecording) {
        isRecording = true;
    }
});

// Event Capture State
let lastMouseX = 0;
let lastMouseY = 0;
let lastMouseTime = 0;
let isDragging = false;
const MOUSE_POLL_INTERVAL = 500;

document.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});

document.addEventListener('mousedown', () => {
    isDragging = true;
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});

// Helper to safely send messages
function sendMessageToBackground(type: string, payload: any) {
    if (!chrome.runtime?.id) {
        // Extension context invalidated (e.g. extension reloaded). 
        // Stop doing work to avoid errors.
        console.warn("[Recordo] Extension context invalidated. Please reload the page.");
        return;
    }
    chrome.runtime.sendMessage({ type, payload }).catch(() => {
        // Ignore connection errors
    });
}

// Poll for mouse position
setInterval(() => {
    if (!chrome.runtime?.id) return; // Stop polling if invalidated

    const now = Date.now();
    if (now - lastMouseTime >= MOUSE_POLL_INTERVAL) {
        lastMouseTime = now;

        sendMessageToBackground('MOUSE_POS', {
            timestamp: now,
            x: lastMouseX,
            y: lastMouseY,
            isDragging: isDragging,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY
        });
    }
}, MOUSE_POLL_INTERVAL);

// URL Capture
function sendUrlEvent() {
    sendMessageToBackground('URL_CHANGE', {
        timestamp: Date.now(),
        url: window.location.href,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
    });
}

window.addEventListener('popstate', sendUrlEvent);
window.addEventListener('hashchange', sendUrlEvent);
// Initial load
sendUrlEvent();

// History API Patch
const originalPushState = history.pushState;
history.pushState = function (...args) {
    originalPushState.apply(this, args);
    sendUrlEvent();
};
const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    sendUrlEvent();
};

// Key Capture
window.addEventListener('keydown', (e) => {
    if (!chrome.runtime?.id) return;

    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

    // If in input, only capture Modifiers or Special keys (Enter/Tab/Esc)
    // If NOT in input, capture everything (for tool shortcuts like Figma 'v', 'r')

    const isModifier = e.ctrlKey || e.metaKey || e.altKey;
    const isSpecial = ['Enter', 'Tab', 'Escape', 'Backspace'].includes(e.key);

    const shouldCapture = !isInput || (isInput && (isModifier || isSpecial));

    if (shouldCapture) {
        sendMessageToBackground('KEYDOWN', {
            timestamp: Date.now(),
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY
        });
    }
});

// Click Capture
document.addEventListener('click', (e) => {
    if (!isRecording) {
        console.log("[Content] Click ignored (not recording)");
        return;
    }
    if (!chrome.runtime?.id) return;

    const target = e.target as HTMLElement;
    const rect = target.getBoundingClientRect();

    console.log("Captured click on:", target.tagName);

    sendMessageToBackground('CLICK_EVENT', {
        timestamp: Date.now(),
        tagName: target.tagName,
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
    });
}, true);
