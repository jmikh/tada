let recorder: MediaRecorder | null = null;
let data: BlobPart[] = [];

// Notify background that we are ready
chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'START_RECORDING_OFFSCREEN') {
        const { streamId } = message;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false, // Can add audio support later
                video: {
                    mandatory: {
                        chromeMediaSource: 'tab',
                        chromeMediaSourceId: streamId
                    }
                } as any // TS doesn't know about chromeMediaSource in standard types sometimes
            });

            recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            data = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    data.push(event.data);
                }
            };

            recorder.onstop = async () => {
                const blob = new Blob(data, { type: 'video/webm' });

                // Save to IndexedDB
                await saveToIndexedDB(blob);

                // Open Editor Page via background (offscreen might not have tabs API access)
                chrome.runtime.sendMessage({ type: 'OPEN_EDITOR', url: 'src/editor/index.html' });

                // Stop all tracks
                stream.getTracks().forEach(t => t.stop());
            };

            recorder.start();
        } catch (err) {
            console.error("Offscreen recording error:", err);
        }
    } else if (message.type === 'STOP_RECORDING_OFFSCREEN') {
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
        }
    } else if (message.type === 'PING_OFFSCREEN') {
        // Just acknowledging receipt is enough for the sendResponse automatically handled by runtime? 
        // No, we should return something or just letting the message pass without error is enough?
        // Actually, if onMessage listener exists, `sendMessage` returns undefined, NOT an error.
        // The error "Receiving end does not exist" happens when NO listener is registered.
        // So just having the listener is enough.
        // But let's return a value to be explicit.
        return Promise.resolve("PONG");
    }
});

async function saveToIndexedDB(blob: Blob) {
    return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('RecordoDB', 1);

        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('recordings')) {
                db.createObjectStore('recordings', { keyPath: 'id' });
            }
        };

        request.onsuccess = (event: any) => {
            const db = event.target.result;
            const transaction = db.transaction(['recordings'], 'readwrite');
            const store = transaction.objectStore('recordings');

            // We'll just store one "latest" recording for now or use timestamp
            const recording = {
                id: 'latest',
                blob: blob,
                timestamp: Date.now()
            };

            const putRequest = store.put(recording);

            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
        };

        request.onerror = () => reject(request.error);
    });
}
