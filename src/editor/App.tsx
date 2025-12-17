import { useState, useEffect, useRef } from 'react';
import { useEditorStore, type Metadata } from './store';
import { Timeline } from './Timeline';
import { EventInspector } from './EventInspector';
import { virtualToSourceTime } from './utils';
import { calculateZoomTarget, resolveZoomTransform, type ZoomEvent } from '../lib/zoom';

function Editor() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

    // Store State
    const {
        videoUrl,
        metadata,
        recordingStartTime,
        isExporting,
        zoomIntensity,
        segments,
        currentTime,
        isPlaying,
        setVideoUrl,
        setMetadata,
        setRecordingStartTime,
        setIsExporting,
        setZoomIntensity,
        initSegments,
        setCurrentTime,
        setIsPlaying
    } = useEditorStore();

    // Data Loading
    useEffect(() => {
        chrome.storage.local.get(['recordingMetadata'], (result) => {
            if (result.recordingMetadata) {
                setMetadata(result.recordingMetadata as Metadata[]);
            }
        });

        const request = indexedDB.open('RecordoDB', 1);
        request.onsuccess = (event: any) => {
            const db = event.target.result;
            const transaction = db.transaction(['recordings'], 'readonly');
            const store = transaction.objectStore('recordings');
            const getRequest = store.get('latest');
            getRequest.onsuccess = () => {
                const result = getRequest.result;
                if (result) {
                    const blob = result.blob;
                    setVideoUrl(URL.createObjectURL(blob));
                    // Prioritize actual startTime, fallback to timestamp (legacy/safeguard)
                    if (result.startTime) setRecordingStartTime(result.startTime);
                    else if (result.timestamp) setRecordingStartTime(result.timestamp);

                    // Initialize segments with reliable duration if available
                    if (result.duration && result.duration > 0 && result.duration !== Infinity) {
                        initSegments(result.duration);
                    }
                }
            };
        };
    }, []);

    // Initialize Segments on Video Load (Logic removed temporarily to fix build)

    useEffect(() => {
        console.log("Segments updated:", segments);
    }, [segments]);

    // Virtual Player Logic
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Sync Store -> Video (Seek)
        // Only seek if difference is significant to avoid stutter during playback
        const targetSourceTime = virtualToSourceTime(currentTime, segments);

        if (targetSourceTime !== null) {
            const diff = Math.abs((video.currentTime * 1000) - targetSourceTime);
            if (diff > 100) { // 100ms tolerance
                video.currentTime = targetSourceTime / 1000;
            }
        }

        // Play/Pause Sync
        if (isPlaying && video.paused) {
            video.play().catch(console.error);
        } else if (!isPlaying && !video.paused) {
            video.pause();
        }

    }, [currentTime, isPlaying, segments]);

    // Video Time Update Loop (The heartbeat of the virtual player)
    // Uses requestAnimationFrame for smooth 60fps updates instead of timeupdate (4hz)
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isPlaying) return;

        let rAFId: number;

        const loop = () => {
            const currentSourceMs = video.currentTime * 1000;

            // Find which segment we are in
            let foundSeg = false;
            for (const seg of segments) {
                if (currentSourceMs >= seg.sourceStart && currentSourceMs < seg.sourceEnd) {
                    // Inside a segment, update virtual time
                    const offset = currentSourceMs - seg.sourceStart;
                    let virtualStartOfSeg = 0; // Calculate accumulated start
                    for (const s of segments) {
                        if (s.id === seg.id) break;
                        virtualStartOfSeg += (s.sourceEnd - s.sourceStart);
                    }
                    setCurrentTime(virtualStartOfSeg + offset);
                    foundSeg = true;
                    break;
                }
            }

            // Gap Jumping Logic
            if (!foundSeg && segments.length > 0) {
                // If we are not in a segment, we probably drifted or reached end of one.
                // Find the NEXT segment start
                const nextSeg = segments.find(s => s.sourceStart > currentSourceMs);
                if (nextSeg) {
                    // Jump to start of next segment
                    video.currentTime = nextSeg.sourceStart / 1000;
                } else {
                    // End of all segments
                    // Only stop if we really are past everything
                    const lastSeg = segments[segments.length - 1];
                    if (currentSourceMs > lastSeg.sourceEnd) {
                        setIsPlaying(false);
                        return; // Stop loop
                    }
                }
            }

            rAFId = requestAnimationFrame(loop);
        };

        // Start loop
        loop();

        return () => cancelAnimationFrame(rAFId);
    }, [isPlaying, segments]);




    // Zoom & Transform Logic
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTransform = () => {
            // 1. Prepare Config & State
            const currentTime = video.currentTime * 1000;
            const absTime = recordingStartTime + currentTime;

            // Map Metadata
            // We need to cast broadly first, then usage will depend on type guards or filtering
            const events = metadata as unknown as ZoomEvent[];

            const videoW = video.videoWidth;
            const videoH = video.videoHeight;

            if (videoW === 0 || videoH === 0) return;

            // Phase 1: Decide Target (Pure Logic)
            const config = {
                videoSize: { width: videoW, height: videoH },
                zoomIntensity: zoomIntensity,
                zoomDuration: 2000,
                zoomOffset: -2000,
                padding: 200
            };

            const target = calculateZoomTarget(config, events, absTime);

            // Phase 2: Resolve Transform (Projection)
            const containerW = containerRef.current?.clientWidth || 800;
            const containerH = containerRef.current?.clientHeight || 450;

            const result = resolveZoomTransform(
                target,
                { width: containerW, height: containerH },
                { width: videoW, height: videoH }
            );

            // 3. Apply
            setTransform(result);
        };

        video.addEventListener('timeupdate', handleTransform);
        return () => video.removeEventListener('timeupdate', handleTransform);
    }, [metadata, recordingStartTime, zoomIntensity]);


    const exportVideo = async () => {
        // ... (Keep existing implementation)
        if (!videoRef.current || !videoUrl) return;
        setIsExporting(true);
        const video = videoRef.current;
        const width = video.videoWidth;
        const height = video.videoHeight;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const stream = canvas.captureStream(30);
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
        };

        recorder.start();

        // Render Loop for Segments
        // We must manually play through each segment
        video.pause();

        for (const seg of segments) {
            await new Promise<void>((resolve) => {
                const startSec = seg.sourceStart / 1000;
                const endSec = seg.sourceEnd / 1000;
                video.currentTime = startSec;

                const onSeeked = () => {
                    video.removeEventListener('seeked', onSeeked);
                    video.play();
                };
                video.addEventListener('seeked', onSeeked);

                const checkTime = () => {
                    if (video.currentTime >= endSec || video.ended) {
                        video.pause();
                        video.removeEventListener('timeupdate', checkTime);
                        resolve();
                    }
                    // Draw frame
                    ctx.drawImage(video, 0, 0, width, height);
                    // TODO: Apply zoom transforms here too if we want them in export
                };
                video.addEventListener('timeupdate', checkTime);
            });
        }

        recorder.stop();
    };

    const exportDebugData = async () => {
        if (!videoUrl) return;

        // 1. Export Metadata JSON
        const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
        const metadataUrl = URL.createObjectURL(metadataBlob);
        const a1 = document.createElement('a');
        a1.href = metadataUrl;
        a1.download = 'recordo-metadata.json';
        a1.click();

        // 2. Export Video File (Raw)
        // We need to fetch the blob again from local URL or store
        const videoBlob = await fetch(videoUrl).then(r => r.blob());
        const videoDownloadUrl = URL.createObjectURL(videoBlob);
        const a2 = document.createElement('a');
        a2.href = videoDownloadUrl;
        a2.download = 'recordo-source.webm';
        a2.click();
    };

    const videoStyle: React.CSSProperties = {
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        transformOrigin: '0 0',
        transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)' // Smooth zoom
    };

    return (
        <div className="w-full h-screen bg-black flex flex-col overflow-hidden">
            {/* Main Area: Player + Side Panel */}
            <div className="flex-1 flex overflow-hidden">

                {/* Center: Video Player */}
                <div
                    id="video-player-container"
                    className="flex-1 flex overflow-hidden relative items-center justify-center bg-[#1e1e1e]"
                >
                    <div
                        id="video-transform-wrapper"
                        ref={containerRef}
                        className="relative shadow-2xl bg-black"
                        style={{
                            width: '800px', // Fixed size for now, or use responsive
                            height: '450px',
                            overflow: 'hidden'
                        }}
                    >
                        {videoUrl && (
                            <div
                                id="video-content-layer"
                                style={{
                                    ...videoStyle,
                                    width: '100%',
                                    height: '100%',
                                    position: 'relative'
                                }}
                            >
                                <video
                                    ref={videoRef}
                                    src={videoUrl}
                                    // onLoadedMetadata={onVideoLoaded} // Temporarily unused
                                    className="w-full h-full object-contain"
                                    muted
                                />
                                {/* Overlay for Debugging Click Positions */}
                                {metadata.map((m, i) => (
                                    <div
                                        key={i}
                                        id={`debug-click-marker-${i}`}
                                        className="absolute w-2 h-2 bg-red-500 rounded-full pointer-events-none z-50 border border-white"
                                        style={{
                                            left: m.x - m.scrollX,
                                            top: m.y - m.scrollY,
                                            transform: 'translate(-50%, -50%)'
                                        }}
                                        title={`Event ${i}: ${m.tagName}`}
                                    />
                                ))}
                            </div>
                        )}
                        {!videoUrl && <div className="text-white flex items-center justify-center h-full">Loading...</div>}
                    </div>
                </div>

                {/* Right: Debug Panel */}
                <div id="debug-side-panel" className="w-80 bg-[#252526] border-l border-[#333] flex flex-col overflow-hidden text-xs text-gray-300">

                    {/* Event Inspector */}
                    <EventInspector metadata={metadata as unknown as ZoomEvent[]} />

                    {/* Settings & Debug Actions */}
                    <div className="p-4 bg-[#1e1e1e] flex flex-col gap-4">
                        <div>
                            <h2 className="text-sm font-bold text-white mb-2">Editor Settings</h2>
                            <label className="block text-[10px] text-slate-500 uppercase mb-1">Preview Zoom Intensity</label>
                            <input
                                type="range" min="1" max="3" step="0.1"
                                value={zoomIntensity}
                                onChange={(e) => setZoomIntensity(parseFloat(e.target.value))}
                                className="w-full accent-blue-500"
                            />
                            <div className="text-right text-[10px] text-gray-400">{zoomIntensity.toFixed(1)}x</div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={exportVideo}
                                disabled={isExporting}
                                className={`w-full py-2 rounded font-medium transition-colors ${isExporting ? 'bg-slate-600' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                            >
                                {isExporting ? 'Exporting...' : 'Export Video'}
                            </button>

                            <button
                                onClick={exportDebugData}
                                className="w-full py-2 rounded font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors text-[10px]"
                            >
                                Export Debug Data (JSON + Video)
                            </button>

                            <div className="text-[10px] text-slate-500 text-center mt-2">
                                Segments: {segments.length} | Dur: {segments.reduce((acc, s) => acc + (s.sourceEnd - s.sourceStart), 0).toFixed(0)}ms
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom: Timeline Area */}
            <div id="timeline-container" className="h-64 border-t border-[#333] shrink-0 z-20 bg-[#1e1e1e]">
                <Timeline />
            </div>
        </div>
    );


}

export default Editor;
