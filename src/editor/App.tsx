import { useState, useEffect, useRef } from 'react';
import { PlayerCanvas } from './player/PlayerCanvas';
// import { useEditorStore } from './store'; // REMOVED
import { loadSessionData } from './session/sessionLoader';
import { useProjectStore, useProjectData, useMaxZoom } from './stores/useProjectStore';
import { usePlaybackStore } from './stores/usePlaybackStore';
import { Timeline } from './timeline/Timeline';
import { EventInspector } from './EventInspector';
import { HoverInspector } from './HoverInspector';
// import { useProject } from '../hooks/useProject'; // REMOVED
import { ProjectImpl } from '../core/project/project';
// import { TimelineImpl } from '../core/timeline/timeline'; // Unused
import { TrackImpl } from '../core/timeline/track';
import { ClipImpl } from '../core/timeline/clip';
import type { Source } from '../core/types';
import type { UserEvent } from '../core/types';
import { ViewTransform } from '../core/effects/viewTransform';
import { calculateZoomSchedule } from '../core/effects/cameraMotion';
import { generateMouseEffects } from '../core/effects/mouseEffects';
import { type ZoomConfig } from '../core/types';




function Editor() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [containerSize, setContainerSize] = useState({ width: 800, height: 450 });
    const [debugCameraMode, setDebugCameraMode] = useState<'active' | 'visualize'>('active');

    // -- Project State --
    const project = useProjectData();
    const loadProject = useProjectStore(s => s.loadProject);
    const maxZoom = useMaxZoom(); // Selected from project

    // -- Playback State --
    const isPlaying = usePlaybackStore(s => s.isPlaying);
    const currentTimeMs = usePlaybackStore(s => s.currentTimeMs);
    const setPlaybackTime = usePlaybackStore(s => s.setCurrentTime);

    // Local Session State (loaded from storage)
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<UserEvent[]>([]);



    // We need to store recordingStartTime to use it in onVideoLoaded
    const [recordingStartTime, setRecordingStartTime] = useState<number>(0);

    // Update useEffect to set it
    useEffect(() => {
        loadSessionData().then(data => {
            if (data.videoUrl) setVideoUrl(data.videoUrl);
            if (data.metadata) setMetadata(data.metadata);
            if (data.recordingStartTime) setRecordingStartTime(data.recordingStartTime);

            if (data.videoUrl && data.recordingStartTime) {
                const currentProject = useProjectStore.getState().project;
                const sourceId = `source-${data.recordingStartTime}`;
                if (!currentProject.sources[sourceId]) {
                    // Force Reset Project so onVideoLoaded sees "empty" or "mismatch"
                    // Actually, better to just load a fresh project here.
                    loadProject(ProjectImpl.create('New Recording'));
                }
            }
        });
    }, []);

    // ... 




    // Derived State from Project
    const outputVideoSize = project.outputSettings.size;
    // TODO: Do not rely on source[0], find the correct active source or main source.
    const inputVideoSize = Object.values(project.sources)[0]?.size || null;

    const onVideoLoaded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        console.log('Video loaded');
        const video = e.currentTarget;
        const w = video.videoWidth;
        const h = video.videoHeight;

        // Smart Init: Use recording timestamp to identify this unique recording session
        const sourceId = `source-${recordingStartTime || 'main'}`;

        // Initialize Project if this specific source is missing
        if (!project.sources[sourceId] && videoUrl) {
            console.log('Initializing Project for Source:', sourceId);

            // Start with a clean slate to ensure we don't have leftover tracks from a previous project
            let newProject = ProjectImpl.create('Recording ' + (new Date(recordingStartTime || Date.now()).toLocaleTimeString()));

            const durationMs = (video.duration && video.duration !== Infinity) ? video.duration * 1000 : 10000;

            const source: Source = {
                id: sourceId,
                type: 'video',
                url: videoUrl,
                durationMs: durationMs,
                size: { width: w, height: h },
                hasAudio: true,
                events: metadata // Attach events to source
            };

            newProject = ProjectImpl.addSource(newProject, source);

            // Create Track
            let track = TrackImpl.create('Main Video', 'video');

            // Generate Camera Motions if metadata exists
            if (metadata && metadata.length > 0) {
                // 1. Configs
                const zoomConfig: ZoomConfig = {
                    zoomIntensity: maxZoom,
                    zoomDuration: 2000,
                    zoomOffset: -500
                };

                const videoMappingConfig = new ViewTransform(
                    { width: w, height: h }, // Input
                    outputVideoSize,         // Output (Project Settings)
                    0
                );

                // 2. Generate
                const motions = calculateZoomSchedule(zoomConfig, videoMappingConfig, metadata);
                track.cameraMotions = motions;

                // 3. Generate Mouse Effects
                const mouseEffects = generateMouseEffects(metadata, durationMs);
                track.mouseEffects = mouseEffects;
            }

            // Create Clip covering entire duration
            const clip = ClipImpl.create(sourceId, 0, durationMs, 0);

            track = TrackImpl.addClip(track, clip);

            // Add Track to Timeline
            const newTimeline = { ...newProject.timeline, mainTrack: track };

            newProject = { ...newProject, timeline: newTimeline };

            loadProject(newProject);
            console.log('Project Initialized with Video Source', newProject);
        }
    };

    // Data Loading
    // Data Loading moved to top-level effect


    // Playback Loop & Video Sync
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        let rAFId: number;
        let lastTime = performance.now();

        const loop = () => {
            const now = performance.now();
            const delta = now - lastTime;
            lastTime = now;

            if (isPlaying) {
                const newTime = currentTimeMs + delta;
                setPlaybackTime(newTime);

                // Sync Video Element
                const renderState = ProjectImpl.getRenderState(project, newTime);

                // Assume first track is main video for now
                // Find visible clip in render tracks
                const trackState = renderState.tracks.find(t => t.clip);

                if (trackState && trackState.clip) {
                    const targetSourceTime = trackState.clip.sourceTimeMs / 1000;

                    if (Math.abs(video.currentTime - targetSourceTime) > 0.1) {
                        video.currentTime = targetSourceTime;
                    }
                    if (video.paused) {
                        video.play().catch(console.error);
                    }
                } else {
                    // Gap
                    if (!video.paused) video.pause();
                }
            } else {
                // Paused state: Sync playhead to video if scrubbing happened externally?
                // Or ensure video frame matches playhead?
                const renderState = ProjectImpl.getRenderState(project, currentTimeMs);
                const trackState = renderState.tracks.find(t => t.clip);
                if (trackState && trackState.clip) {
                    const targetSourceTime = trackState.clip.sourceTimeMs / 1000;
                    if (Math.abs(video.currentTime - targetSourceTime) > 0.1) {
                        video.currentTime = targetSourceTime;
                    }
                }
                if (!video.paused) video.pause();
            }

            rAFId = requestAnimationFrame(loop);
        };

        if (isPlaying) {
            lastTime = performance.now();
        }

        rAFId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rAFId);
    }, [isPlaying, project, currentTimeMs]); // Dependency on currentTimeMs might cause 60fps re-bind?

    // Optimization: Don't depend on currentTimeMs in effect dependency if possible.
    // But we need the initial value. 
    // Actually, setting state inside loop is fine, but reading it?
    // We should use a ref for local accumulating time to avoid effect re-run loop?
    // Yes.

    // Better Loop Implementation:


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


    // Video Dimensions & Rendering Logic - Moved to top


    // Visualization Update Loop
    // Removed overlay visualization logic as it moved to PlayerCanvas


    // Calculate Rendered Rect (for overlay positioning)
    let renderedStyle = {};
    if (outputVideoSize && outputVideoSize.width > 0) {
        const containerAspect = containerSize.width / containerSize.height;
        const videoAspect = outputVideoSize.width / outputVideoSize.height;

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
        // inputVideoSize from store
        if (!inputVideoSize || !inputVideoSize.width || Object.keys(renderedStyle).length === 0) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Rendered Width/Height
        const rw = (renderedStyle as any).width;
        const rh = (renderedStyle as any).height;

        // Calculate coords relative to source video
        const scaleX = rw / inputVideoSize.width;
        const scaleY = rh / inputVideoSize.height;

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
                                    debugCameraMode={debugCameraMode}
                                />

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
                    <div className="p-2 border-b border-[#333]">
                        <button
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
                            onClick={() => console.log(project)}
                        >
                            Log Project Struct
                        </button>
                        <div className="h-2" />
                        <button
                            className={`w-full px-2 py-1 rounded text-white ${debugCameraMode === 'visualize' ? 'bg-green-600' : 'bg-gray-600'}`}
                            onClick={() => setDebugCameraMode(prev => prev === 'active' ? 'visualize' : 'active')}
                        >
                            {debugCameraMode === 'visualize' ? 'Debug: Show Rect' : 'Debug: Active Camera'}
                        </button>
                    </div>
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-b border-[#333]">
                            <EventInspector metadata={metadata} />
                        </div>
                        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                            <HoverInspector events={metadata} inputSize={inputVideoSize} />
                        </div>
                    </div>
                </div>
            </div>

            <div id="timeline-container" className="h-64 border-t border-[#333] shrink-0 z-20 bg-[#1e1e1e] flex flex-col">
                <Timeline />
            </div>
        </div>
    );
}

export default Editor;
