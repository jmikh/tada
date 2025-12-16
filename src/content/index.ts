console.log("Recordo content script loaded");

let isRecording = false;

// Listen for recording state changes from background
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'RECORDING_STATUS_CHANGED') {
        isRecording = message.isRecording;
    }
});

// Also check initial state safely
chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' }, (response) => {
    if (chrome.runtime.lastError) {
        // Background might not be ready or we are orphaned
        return;
    }
    if (response?.isRecording) {
        isRecording = true;
    }
});

document.addEventListener('click', (event) => {
    if (!isRecording) return;

    const target = event.target as HTMLElement;
    const rect = target.getBoundingClientRect();

    const metadata = {
        timestamp: Date.now(),
        tagName: target.tagName,
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
    };

    chrome.runtime.sendMessage({
        type: 'CLICK_EVENT',
        payload: metadata
    });
}, true); // Capture phase to ensure we catch it
