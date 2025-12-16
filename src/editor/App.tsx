import { useState, useEffect, useRef } from 'react';

interface Metadata {
    timestamp: number;
    tagName: string;
    x: number;
    y: number;
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
    scrollX: number;
    scrollY: number;
}

function Editor() {
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<Metadata[]>([]);
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const recordingStartTimeRef = useRef<number>(0);

    // Load data
    useEffect(() => {
        // Load metadata
        chrome.storage.local.get(['recordingMetadata'], (result) => {
            if (result.recordingMetadata) {
                setMetadata(result.recordingMetadata as Metadata[]);
            }
        });

        // Load video from IndexedDB
        const request = indexedDB.open('RecordoDB', 1);
        request.onsuccess = (event: any) => {
            const db = event.target.result;
            const transaction = db.transaction(['recordings'], 'readonly');
            const store = transaction.objectStore('recordings');
            const getRequest = store.get('latest');

            getRequest.onsuccess = () => {
                if (getRequest.result) {
                    const blob = getRequest.result.blob;
                    const url = URL.createObjectURL(blob);
                    setVideoUrl(url);
                }
            };
        };
    }, []);

    // Zoom Logic
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (metadata.length > 0 && recordingStartTimeRef.current === 0) {
            // Estimate start time based on first event or just assume 0 for now
            // Ideally we pass startTime in metadata.
            // For this MVP, let's assume the first click happens at least a few seconds in.
            // Or better: The metadata timestamps are absolute (Date.now()). 
            // We need the absolute time when the video started recording. 
            // We stored { timestamp } in recordings object store in recorder.ts!
            // Let's fetch that.
            const request = indexedDB.open('RecordoDB', 1);
            request.onsuccess = (event: any) => {
                const db = event.target.result;
                const transaction = db.transaction(['recordings'], 'readonly');
                const store = transaction.objectStore('recordings');
                const getRequest = store.get('latest');
                getRequest.onsuccess = () => {
                    if (getRequest.result && getRequest.result.timestamp) {
                        recordingStartTimeRef.current = getRequest.result.timestamp;
                    }
                };
            };
        }

        const handleTimeUpdate = () => {
            const currentTime = video.currentTime * 1000; // ms
            // Simple logic: Find the latest event that happened before current time
            // but within a reasonable window (e.g. 2 seconds)
            // Ideally we'd map timestamps to video duration, but raw timestamp diffs work for MVP
            // Metadata timestamp is absolute, video time is relative.
            // We need the START absolute timestamp. 
            // For MVP, let's assume the first event starts at or after 0.
            // Wait, we need to normalize timestamps. 
            // We really should have stored the "recordingStartTime" in both places.
            // Let's assume the first metadata event is roughly where we want to be, or use the first frame as reference.
            // Better: We stored "timestamp" in metadata. We really need the timestamp of when recording STARTED.
            // I'll fix this in background script later. For now, let's just try to sync based on first event or similar.

            // Actually, let's just show the raw video for now.
            const absTime = recordingStartTimeRef.current + currentTime;

            // Find active zoom event
            // Logic: specific click event triggers zoom for X seconds (e.g. 3s)
            const ZOOM_DURATION = 3000;

            const activeEvent = metadata.find(m => {
                const diff = absTime - m.timestamp;
                return diff >= 0 && diff < ZOOM_DURATION;
            });

            if (activeEvent) {
                // Calculate Zoom
                const padding = 200; // px
                const targetWidth = activeEvent.width + padding;
                const targetHeight = activeEvent.height + padding;

                // Calculate scale (limited to 1x - 3x)
                const scaleX = activeEvent.viewportWidth / targetWidth;
                const scaleY = activeEvent.viewportHeight / targetHeight;
                const rawScale = Math.min(scaleX, scaleY);
                const scale = Math.min(Math.max(rawScale, 1.2), 3); // Clamp

                // Center Point of the target


                // Calculate offsets
                // transform-origin is 0 0 (top left of video)
                // We want (centerX, centerY) of video to change to (vw/2, vh/2) of container
                // Video dimensions might match viewport (assuming fullscreen recording)
                // offset = center_of_container - center_of_target_scaled

                // Note: The click coordinates are relative to the DOCUMENT (cached with scroll).
                // But the video captures the viewport.
                // If the user scrolled, the video content changes.
                // But wait, the video IS the viewport.
                // So x/y in metadata should be relative to the VIEWPORT at that moment?
                // My content script captured: x = rect.x + window.scrollX.
                // That is document coordinates.
                // But video is just what's on screen.
                // If user scrolls, the "viewport" moves over the document.
                // The video doesn't have "scroll".
                // We need coordinates relative to the VIEWPORT (clientX/clientY).
                // Content script captured `rect` which is relative to viewport (getClientBoundingRect).
                // Wait, I did `x: rect.x + window.scrollX`. That effectively makes it absolute.
                // I should use `rect.x` and `rect.y` directly if I want viewport coordinates?
                // YES. The video records the VIEWPORT.
                // So I must rely on the fact that if the user clicked it, it WAS in the viewport.
                // So I should calculate position based on `x - scrollX` if I stored absolute.
                // My metadata has `scrollX`. So `viewportX = storedX - storedScrollX`.

                const eventViewportX = activeEvent.x - activeEvent.scrollX;
                const eventViewportY = activeEvent.y - activeEvent.scrollY;

                const eventCenterX = eventViewportX + activeEvent.width / 2;
                const eventCenterY = eventViewportY + activeEvent.height / 2;

                // Assuming container size matches viewport size roughly or we use percentages
                // Let's assume the video element size represents the viewport size
                // We'll trust the browser allows simple scaling.

                // Container dimensions
                const containerW = containerRef.current?.clientWidth || 800;
                const containerH = containerRef.current?.clientHeight || 450;

                // Scale coords to container (if video is scaled down to fit container)
                // Ideally video fits container.

                const finalScale = scale;
                // Calculate translate (relative to the scaled video)
                // We want eventCenter to be at containerCenter.
                // The video itself is scaled.
                // pos_on_screen = pos_in_video * scale + translate
                // containerCenter = eventCenter * scale + translate
                // translate = containerCenter - eventCenter * scale

                const x = (containerW / 2) - (eventCenterX * finalScale);
                const y = (containerH / 2) - (eventCenterY * finalScale);

                setTransform({ x, y, scale: finalScale });
            } else {
                setTransform({ x: 0, y: 0, scale: 1 });
            }
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        return () => video.removeEventListener('timeupdate', handleTimeUpdate);
    }, [metadata]);

    // Apply transform style
    const videoStyle = {
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        transformOrigin: '0 0'
    };

    const [isExporting, setIsExporting] = useState(false);

    const exportVideo = async () => {
        if (!videoRef.current || !videoUrl) return;
        setIsExporting(true);

        const video = videoRef.current;
        const width = video.videoWidth;
        const height = video.videoHeight;

        // Setup Canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Setup Stream and Recorder
        const stream = canvas.captureStream(30); // 30 FPS
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks: BlobPart[] = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `recordo-export-${Date.now()}.webm`;
            a.click();
            setIsExporting(false);

            // Clean up
            // Revert video state? We manipulated the main video element.
            // Ideally we should use a separate video element for export or restore state.
        };

        recorder.start();

        // Play video from start
        video.currentTime = 0;
        await video.play();

        // Render loop
        const draw = () => {
            if (video.ended || video.paused) {
                if (recorder.state === 'recording') {
                    recorder.stop();
                }
                return;
            }

            // Calculate current transform (reuse logic? ideally extract it)
            // For now, duplicate logic or access state if it updates synchronously enough?
            // State `transform` updates via `timeupdate` event.
            // `timeupdate` fires periodically, not every frame.
            // But `requestAnimationFrame` fires every frame.
            // We need to calculate transform for THIS EXACT FRAME.
            // So we really should extract the logic.

            const currentTime = video.currentTime * 1000;
            const absTime = recordingStartTimeRef.current + currentTime;

            // Logic duplicated for MVP (Create a helper function in real app)


            const ZOOM_DURATION = 3000;
            const activeEvent = metadata.find(m => {
                const diff = absTime - m.timestamp;
                return diff >= 0 && diff < ZOOM_DURATION;
            });

            if (activeEvent) {
                const padding = 200;
                const targetWidth = activeEvent.width + padding;
                const targetHeight = activeEvent.height + padding;

                const scaleX = activeEvent.viewportWidth / targetWidth;
                const scaleY = activeEvent.viewportHeight / targetHeight;
                const scale = Math.min(Math.max(Math.min(scaleX, scaleY), 1.2), 3);

                const eventViewportX = activeEvent.x - activeEvent.scrollX;
                const eventViewportY = activeEvent.y - activeEvent.scrollY;
                const eventCenterX = eventViewportX + activeEvent.width / 2;
                const eventCenterY = eventViewportY + activeEvent.height / 2;

                // Canvas calculations
                // We want to transform the drawing context.
                // Translate to center. Scale. Translate back.
                // Wait, we need to map the "Center of Target" to "Center of Canvas".

                // Center of Canvas
                const cx = width / 2;
                const cy = height / 2;

                // We shift the image so that eventCenterX moves to cx.
                // shiftX = cx - eventCenterX
                // Then scale around that center? 
                // If we scale, we should scale around the event center?
                // Standard zoom: translate(cx, cy) scale(s) translate(-eventCenterX, -eventCenterY)
                // This puts eventCenterX at the origin, scales it, then puts it at (cx, cy).
                // YES.

                ctx.setTransform(scale, 0, 0, scale, cx - eventCenterX * scale, cy - eventCenterY * scale);
            } else {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            }

            ctx.clearRect(0, 0, width, height); // Clear (though drawImage covers usually)

            // Draw video (which has the raw image)
            // NOTE: The video element on screen HAS CSS transform applied.
            // But `ctx.drawImage(video)` draws the raw video frame. (Good).
            ctx.drawImage(video, 0, 0, width, height);

            requestAnimationFrame(draw);
        };

        draw();
    };

    return (
        <div className="w-full h-screen bg-slate-900 flex flex-col items-center justify-center p-8">
            <h1 className="text-3xl font-bold text-white mb-4">Editor {isExporting && "(Exporting...)"}</h1>
            {/* ... rest of UI ... */}

            <div
                ref={containerRef}
                className="relative overflow-hidden border-4 border-slate-700 rounded-lg shadow-2xl bg-black"
                style={{ width: '800px', height: '450px' }}
            >
                {videoUrl ? (
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        controls
                        className="w-full h-full object-contain transition-transform duration-500 ease-in-out"
                        style={videoStyle}
                    />
                ) : (
                    <div className="text-white flex items-center justify-center h-full">Loading recording...</div>
                )}
            </div>

            <div className="mt-8 text-white w-[800px] flex gap-4">
                <div className="flex-1">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-xl font-bold">Zoom Events</h2>
                        <button
                            onClick={() => {
                                const video = videoRef.current;
                                if (!video) return;
                                const currentTime = video.currentTime * 1000;
                                const absTime = recordingStartTimeRef.current + currentTime;

                                const newEvent: Metadata = {
                                    timestamp: absTime,
                                    tagName: 'Manual Zoom',
                                    x: window.innerWidth / 2, // Centerish (relative to doc?)
                                    y: window.innerHeight / 2, // approximation
                                    width: 100,
                                    height: 100,
                                    viewportWidth: window.innerWidth,
                                    viewportHeight: window.innerHeight,
                                    scrollX: 0,
                                    scrollY: 0
                                };

                                const newMetadata = [...metadata, newEvent].sort((a, b) => a.timestamp - b.timestamp);
                                setMetadata(newMetadata);
                                chrome.storage.local.set({ recordingMetadata: newMetadata });
                            }}
                            className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm transition-colors"
                        >
                            + Add Zoom Here
                        </button>
                    </div>
                    <div className="h-60 overflow-y-auto bg-slate-800 p-4 rounded border border-slate-700">
                        {metadata.length === 0 ? (
                            <p className="text-slate-500 text-center py-4">No zoom events found.</p>
                        ) : (
                            metadata.map((m, i) => (
                                <div
                                    key={i}
                                    className="text-sm mb-2 p-2 bg-slate-900 rounded cursor-pointer hover:bg-slate-700 transition-colors border border-slate-800 flex justify-between items-center group"
                                    onClick={() => {
                                        if (videoRef.current && recordingStartTimeRef.current) {
                                            const time = (m.timestamp - recordingStartTimeRef.current) / 1000;
                                            videoRef.current.currentTime = Math.max(0, time);
                                            videoRef.current.play();
                                        }
                                    }}
                                >
                                    <div>
                                        <span className="font-mono text-blue-400">
                                            {new Date(m.timestamp).toLocaleTimeString()}
                                        </span>
                                        <span className="ml-2 text-slate-300">
                                            {m.tagName}
                                        </span>
                                    </div>
                                    <button
                                        className="text-red-500 opacity-0 group-hover:opacity-100 px-2 hover:bg-red-900/30 rounded"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newMetadata = metadata.filter((_, idx) => idx !== i);
                                            setMetadata(newMetadata);
                                            chrome.storage.local.set({ recordingMetadata: newMetadata });
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="w-64 bg-slate-800 p-4 rounded border border-slate-700 h-fit">
                    <h3 className="font-bold mb-4 text-slate-300">Global Settings</h3>
                    {/* Placeholders for settings */}
                    <div className="mb-4">
                        <label className="block text-xs text-slate-500 uppercase mb-1">Zoom Intensity</label>
                        <input type="range" min="1.2" max="3" step="0.1" defaultValue="2" className="w-full" />
                    </div>
                    <button
                        onClick={exportVideo}
                        disabled={isExporting}
                        className={`w-full py-2 rounded font-medium mt-4 transition-colors ${isExporting ? 'bg-slate-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                            }`}
                    >
                        {isExporting ? 'Exporting...' : 'Export Video'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Editor;
