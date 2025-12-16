console.log("Background service worker running");

let isRecording = false;

// Ensure offscreen document exists
async function setupOffscreenDocument(path: string) {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });

    if (existingContexts.length > 0) {
        return;
    }

    await chrome.offscreen.createDocument({
        url: path,
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Recording screen',
    });
}

// Store metadata in memory for the current recording session
let clickEvents: any[] = [];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_RECORDING_STATE') {
        sendResponse({ isRecording });
    } else if (message.type === 'CLICK_EVENT') {
        if (isRecording) {
            clickEvents.push(message.payload);
            // Optionally back up to storage periodically
            chrome.storage.local.set({ currentSessionEvents: clickEvents });
        }
    } else if (message.type === 'START_RECORDING') {
        const { tabId } = message;

        (async () => {
            try {
                await setupOffscreenDocument('src/offscreen/offscreen.html');

                // Get stream ID
                const streamId = await chrome.tabCapture.getMediaStreamId({
                    targetTabId: tabId
                });

                // Wait for offscreen to be truly ready
                // We poll by sending a 'PING' message until we get a success (meaning the listener is active)
                // Sending 'OFFSCREEN_READY' from offscreen is good, but if it was already alive we missed it.
                // Best way: Background sends PING, offscreen responds PONG.

                let attempts = 0;
                while (attempts < 20) {
                    try {
                        await chrome.runtime.sendMessage({ type: 'PING_OFFSCREEN' });
                        break; // Success!
                    } catch (e) {
                        attempts++;
                        await new Promise(r => setTimeout(r, 100)); // Wait 100ms
                    }
                }

                if (attempts >= 20) {
                    throw new Error("Offscreen recorder timed out.");
                }

                await chrome.runtime.sendMessage({
                    type: 'START_RECORDING_OFFSCREEN',
                    streamId,
                    data: message
                });

                isRecording = true;
                clickEvents = []; // Reset events
                chrome.storage.local.set({ currentSessionEvents: [] });

                // Notify content script safely
                chrome.tabs.sendMessage(tabId, { type: 'RECORDING_STATUS_CHANGED', isRecording: true })
                    .catch(() => {
                        // Content script might not be injected (e.g. restricted page or stale tab)
                        // We continue recording without metadata in this case.
                        console.warn("Could not reach content script. Metadata capture disabled for this session.");
                    });

                sendResponse({ success: true });
            } catch (err: any) {
                console.error("Error starting recording:", err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true; // Keep channel open
    } else if (message.type === 'STOP_RECORDING') {
        chrome.runtime.sendMessage({ type: 'STOP_RECORDING_OFFSCREEN' });
        isRecording = false;

        // Notify all tabs (or just active)
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, { type: 'RECORDING_STATUS_CHANGED', isRecording: false })
                        .catch(() => {
                            // Ignore errors for tabs without content script
                        });
                }
            });
        });

        // Save final metadata state
        chrome.storage.local.set({ recordingMetadata: clickEvents });

        sendResponse({ success: true });
    } else if (message.type === 'OPEN_EDITOR') {
        chrome.tabs.create({ url: message.url });
    }
});
