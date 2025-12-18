import { useState, useEffect, useRef } from 'react';
import { PlayerCanvas } from './PlayerCanvas';
import { logger } from '../utils/logger';
import { useEditorStore, type Metadata } from './store';
import { Timeline } from './Timeline';
import { EventInspector } from './EventInspector';
import { ZoomInspector } from './ZoomInspector';
import { virtualToSourceTime } from './utils';
import { calculateZoomSchedule, type ZoomEvent, type ZoomKeyframe, VideoMappingConfig } from '../lib/zoom';

interface BoxRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

function Editor() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Visualization State
    const [zoomViz, setZoomViz] = useState<{
        zoomBox: BoxRect | null;
        activeClick: { x: number; y: number } | null;
    }>({ zoomBox: null, activeClick: null });

    const [containerSize, setContainerSize] = useState({ width: 800, height: 450 });
    const [schedule, setSchedule] = useState<ZoomKeyframe[]>([]);
    const [videoDim, setVideoDim] = useState<{ w: number, h: number } | null>(null);

    const onVideoLoaded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        setVideoDim({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight });
    };

    // Store State
    const {
        videoUrl,
        metadata,
        recordingStartTime,
        zoomIntensity,
        segments,
        currentTime,
        isPlaying,
        setVideoUrl,
        setMetadata,
        setRecordingStartTime,
        initSegments,
        setCurrentTime,
        setIsPlaying,
        paddingPercentage
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
                    if (result.startTime) setRecordingStartTime(result.startTime);
                    else if (result.timestamp) setRecordingStartTime(result.timestamp);

                    if (result.duration && result.duration > 0 && result.duration !== Infinity) {
                        initSegments(result.duration);
                    }
                }
            };
        };
    }, []);

    useEffect(() => {
        logger.log("Segments updated:", segments);
    }, [segments]);

    // Virtual Player Logic
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const targetSourceTime = virtualToSourceTime(currentTime, segments);

        if (targetSourceTime !== null) {
            const diff = Math.abs((video.currentTime * 1000) - targetSourceTime);
            if (diff > 100) {
                video.currentTime = targetSourceTime / 1000;
            }
        }

        if (isPlaying && video.paused) {
            video.play().catch(console.error);
        } else if (!isPlaying && !video.paused) {
            video.pause();
        }

    }, [currentTime, isPlaying, segments]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isPlaying) return;

        let rAFId: number;

        const loop = () => {
            const currentSourceMs = video.currentTime * 1000;
            let foundSeg = false;
            for (const seg of segments) {
                if (currentSourceMs >= seg.sourceStart && currentSourceMs < seg.sourceEnd) {
                    const offset = currentSourceMs - seg.sourceStart;
                    let virtualStartOfSeg = 0;
                    for (const s of segments) {
                        if (s.id === seg.id) break;
                        virtualStartOfSeg += (s.sourceEnd - s.sourceStart);
                    }
                    setCurrentTime(virtualStartOfSeg + offset);
                    foundSeg = true;
                    break;
                }
            }

            if (!foundSeg && segments.length > 0) {
                const nextSeg = segments.find((s: any) => s.sourceStart > currentSourceMs);
                if (nextSeg) {
                    video.currentTime = nextSeg.sourceStart / 1000;
                } else {
                    const lastSeg = segments[segments.length - 1];
                    if (currentSourceMs > lastSeg.sourceEnd) {
                        setIsPlaying(false);
                        return;
                    }
                }
            }

            rAFId = requestAnimationFrame(loop);
        };

        loop();
        return () => cancelAnimationFrame(rAFId);
    }, [isPlaying, segments]);

    // Handle Resize for Centering
    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // Calculate Schedule when metadata/video ready
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !metadata || metadata.length === 0) return;

        const videoW = video.videoWidth;
        const videoH = video.videoHeight;
        if (videoW === 0 || videoH === 0) return;

        const events = metadata as unknown as ZoomEvent[];
        // Attempt to find viewport size from first relevant event, or default to video size
        const firstEvent = events.find(e => e.viewportWidth && e.viewportHeight);
        const viewportSize = firstEvent
            ? { width: firstEvent.viewportWidth, height: firstEvent.viewportHeight }
            : { width: videoW, height: videoH };

        const mappingConfig = new VideoMappingConfig(
            viewportSize, // inputVideoSize
            { width: videoW, height: videoH }, // outputVideoSize
            paddingPercentage // padding percentage
        );

        const config = {
            zoomIntensity: zoomIntensity,
            zoomDuration: 0,
            zoomOffset: 2000 // Start zooming 2s before the click
        };

        const newSchedule = calculateZoomSchedule(config, mappingConfig, events);
        setSchedule(newSchedule);

    }, [metadata, zoomIntensity, videoUrl, videoDim, paddingPercentage]);

    // Video Dimensions & Rendering Logic - Moved to top


    // Visualization Update Loop
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleVisualization = () => {
            const currentMs = video.currentTime * 1000;
            const absTime = recordingStartTime + currentMs;

            // 1. Find Active Keyframe
            let activeKeyframe: ZoomKeyframe | null = null;
            for (let i = schedule.length - 1; i >= 0; i--) {
                if (absTime >= schedule[i].timestamp) {
                    activeKeyframe = schedule[i];
                    break;
                }
            }

            if (!activeKeyframe) return;

            // Transient Visualization: Only show for 1 second after the keyframe timestamp
            const durationSinceKeyframe = absTime - activeKeyframe.timestamp;
            if (durationSinceKeyframe > 1000) {
                setZoomViz({ zoomBox: null, activeClick: null });
                return;
            }

            const { zoomBox } = activeKeyframe;
            console.log(zoomBox)



            // Active Click Highlight
            let activeClickPos = null;
            if (videoDim && videoDim.w > 0) { // Only calculate if we have dims? Or assume metadata events are valid?
                // Actually events logic is independent of videoDim state, but we need activeEvent from metadata
                const events = metadata as unknown as ZoomEvent[];
                const config = { zoomOffset: -2000, zoomDuration: 2000 };
                const activeEvent = events.find(e => {
                    if (e.type !== 'click') return false;
                    const rel = absTime - e.timestamp;
                    return rel >= config.zoomOffset && rel < (config.zoomOffset + config.zoomDuration);
                });

                if (activeEvent && activeEvent.type === 'click') {
                    // Need videoDims to map viewport to source if we want accuracy?
                    // In handleVisualization we can use video.videoWidth directly since we are in the effect callback!
                    const vw = video.videoWidth;
                    const vh = video.videoHeight;
                    if (vw > 0 && vh > 0) {
                        const sx = vw / activeEvent.viewportWidth;
                        const sy = vh / activeEvent.viewportHeight;
                        const ex = (activeEvent.x - activeEvent.scrollX) * sx;
                        const ey = (activeEvent.y - activeEvent.scrollY) * sy;
                        activeClickPos = { x: ex, y: ey };
                    }
                }
            }

            setZoomViz({ zoomBox, activeClick: activeClickPos });
        };

        video.addEventListener('timeupdate', handleVisualization);
        return () => video.removeEventListener('timeupdate', handleVisualization);
    }, [metadata, recordingStartTime, schedule, videoDim]); // Depend on videoDim if we use it, or just use video ref


    // Calculate Rendered Rect (for overlay positioning)
    let renderedStyle = {};
    if (videoDim && videoDim.w > 0 && videoDim.h > 0) {
        const containerAspect = containerSize.width / containerSize.height;
        const videoAspect = videoDim.w / videoDim.h;

        let rw, rh;
        if (containerAspect > videoAspect) {
            rh = containerSize.height;
            rw = rh * videoAspect;
        } else {
            rw = containerSize.width;
            rh = rw / videoAspect;
        }

        renderedStyle = {
            width: rw,
            height: rh
        };
    }

    // Tooltip Logic
    const [tooltip, setTooltip] = useState<{ x: number, y: number, text: string } | null>(null);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!videoDim || !videoDim.w || Object.keys(renderedStyle).length === 0) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Rendered Width/Height
        const rw = (renderedStyle as any).width;
        const rh = (renderedStyle as any).height;

        const scaleX = rw / videoDim.w;
        const scaleY = rh / videoDim.h;

        const sx = x / scaleX;
        const sy = y / scaleY;

        setTooltip({
            x: e.clientX + 15,
            y: e.clientY + 15,
            text: `X: ${Math.round(sx)}, Y: ${Math.round(sy)}`
        });
    };

    const handleMouseLeave = () => {
        setTooltip(null);
    };

    // Helper to scale Source Coords to Rendered Coords
    const s2r = (val: number, isX: boolean) => {
        if (!videoDim) return 0;
        const scale = isX ? ((renderedStyle as any).width / videoDim.w) : ((renderedStyle as any).height / videoDim.h);
        return val * scale;
    };

    return (
        <div className="w-full h-screen bg-black flex flex-col overflow-hidden">
            <div className="flex-1 flex overflow-hidden">
                <div
                    id="video-player-container"
                    className="flex-1 flex overflow-hidden relative items-center justify-center bg-[#1e1e1e]"
                >
                    <div
                        ref={containerRef}
                        className="relative flex items-center justify-center shadow-2xl"
                        style={{
                            width: '100%',
                            height: '100%',
                            overflow: 'hidden'
                        }}
                    >
                        {videoUrl && (
                            <div
                                className="bg-blue-200"
                                style={{ position: 'relative', ...renderedStyle }}
                                onMouseMove={handleMouseMove}
                                onMouseLeave={handleMouseLeave}
                            >
                                <PlayerCanvas
                                    ref={videoRef}
                                    src={videoUrl}
                                    onLoadedMetadata={onVideoLoaded}
                                    muted
                                />
                                {/* Overlays */}
                                {zoomViz.zoomBox && (
                                    <div
                                        className="absolute border-2 border-red-500 pointer-events-none z-10 box-border"
                                        style={{
                                            left: s2r(zoomViz.zoomBox.x, true),
                                            top: s2r(zoomViz.zoomBox.y, false),
                                            width: s2r(zoomViz.zoomBox.width, true),
                                            height: s2r(zoomViz.zoomBox.height, false),
                                        }}
                                    >
                                        <div className="absolute top-0 left-0 bg-green-500 text-black text-[10px] px-1 font-bold">Zoom Box</div>
                                    </div>
                                )}

                                {/* Active Click Indicator */}
                                {zoomViz.activeClick && (
                                    <div
                                        className="absolute w-4 h-4 bg-yellow-400 rounded-full border-2 border-white z-20 shadow-lg animate-pulse"
                                        style={{
                                            left: s2r(zoomViz.activeClick.x, true),
                                            top: s2r(zoomViz.activeClick.y, false),
                                            transform: 'translate(-50%, -50%)'
                                        }}
                                    />
                                )}

                                {/* All event markers (faint) */}
                                {metadata.map(() => {
                                    return null;
                                })}
                            </div>
                        )}
                        {!videoUrl && <div className="text-white">Loading...</div>}
                    </div>

                    {/* Tooltip */}
                    {tooltip && (
                        <div style={{
                            position: 'fixed',
                            left: tooltip.x + 10,
                            top: tooltip.y + 10,
                            zIndex: 9999,
                            background: 'rgba(0, 0, 0, 0.8)',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap'
                        }}>
                            {tooltip.text}
                        </div>
                    )}
                </div>

                <div id="debug-side-panel" className="w-80 bg-[#252526] border-l border-[#333] flex flex-col overflow-hidden text-xs text-gray-300">
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <EventInspector metadata={metadata as unknown as ZoomEvent[]} />
                    </div>
                    <div className="flex-1 flex flex-col overflow-hidden border-t border-[#333]">
                        <ZoomInspector
                            schedule={schedule}
                            currentTime={recordingStartTime + currentTime}
                        />
                    </div>
                </div>
            </div>

            <div id="timeline-container" className="h-64 border-t border-[#333] shrink-0 z-20 bg-[#1e1e1e]">
                <Timeline />
            </div>
        </div>
    );
}

export default Editor;
