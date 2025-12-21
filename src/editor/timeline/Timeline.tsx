import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
// import { useProject } from '../../hooks/useProject'; // REMOVED
import { useProjectStore, useProjectTimeline } from '../stores/useProjectStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrackVideo } from './TimelineTrackVideo';
import { TimelineTrackViewportMotions } from './TimelineTrackViewportMotions';
import { TimelineTrackMouseEffects } from './TimelineTrackMouseEffects';
import type { Clip } from '../../core/types';

// Constants
const MIN_PIXELS_PER_SEC = 10;
const MAX_PIXELS_PER_SEC = 200;
const TRACK_HEIGHT = 40;

export function Timeline() {
    const containerRef = useRef<HTMLDivElement>(null);

    // Legacy store for UI state (zoom/pixelsPerSec could move to store but keeping local for now if preferred)
    // Actually using store for isPlaying/currentTime since App.tsx might still drive it separately?
    // Plan said "Subsribe to useProject".
    // useProject has currentTimeMs and isPlaying.
    // -- Stores --
    const timeline = useProjectTimeline();
    const splitAt = useProjectStore(s => s.splitAt);
    const updateClip = useProjectStore(s => s.updateClip);

    const isPlaying = usePlaybackStore(s => s.isPlaying);
    const currentTimeMs = usePlaybackStore(s => s.currentTimeMs);
    const setIsPlaying = usePlaybackStore(s => s.setIsPlaying);
    const setCurrentTime = usePlaybackStore(s => s.setCurrentTime);

    // Zoom Level (Timeline Scale)
    const [pixelsPerSec, setPixelsPerSec] = useState(100);

    // TODO: Calculate total duration dynamically or from project
    // Project duration might not be updated automatically by core yet?
    // Let's calculate max end time of all clips.
    const totalDuration = useMemo(() => {
        let max = 10000; // Default min duration
        const t = timeline.mainTrack;
        t.clips.forEach(c => {
            const end = userClipEnd(c);
            if (end > max) max = end;
        });
        return max;
    }, [timeline]);

    const totalWidth = (totalDuration / 1000) * pixelsPerSec;

    // Interaction State
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [isCTIScrubbing, setIsCTIScrubbing] = useState(false);

    // Dragging State
    interface DragState {
        clipId: string;
        trackId: string;
        type: 'left' | 'right';
        startX: number;
        initialClip: Clip;
        currentClip: Clip; // The modified clip (visual state)
        constraints: {
            minTimelineIn: number;
            maxTimelineIn: number;
            maxSourceDuration: number;
        };
    }

    const [dragState, setDragState] = useState<DragState | null>(null);

    // --- Mouse Handlers ---

    const getTimeFromEvent = (e: React.MouseEvent | MouseEvent) => {
        if (!containerRef.current) return 0;
        const rect = containerRef.current.getBoundingClientRect();
        // Determine scroll offset safely
        const scrollLeft = containerRef.current.scrollLeft || 0;
        const x = e.clientX - rect.left + scrollLeft;
        const time = (x / pixelsPerSec) * 1000;
        return Math.max(0, time);
    };

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const time = getTimeFromEvent(e);
        setHoverTime(time);

        if (isCTIScrubbing) {
            setCurrentTime(Math.max(0, Math.min(time, totalDuration)));
        }
    }, [isCTIScrubbing, pixelsPerSec, totalDuration, setCurrentTime]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsCTIScrubbing(true);
        const time = getTimeFromEvent(e);
        setCurrentTime(Math.max(0, Math.min(time, totalDuration)));
    };

    const handleMouseLeave = () => {
        setHoverTime(null);
        setIsCTIScrubbing(false);
    };

    const handleMouseUp = () => {
        setIsCTIScrubbing(false);
    };

    // --- Dragging Logic for Trimming ---
    useEffect(() => {
        if (!dragState) return;

        const handleGlobalMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - dragState.startX;
            const deltaMs = (deltaX / pixelsPerSec) * 1000;
            const clip = dragState.initialClip;
            const { minTimelineIn, maxTimelineIn } = dragState.constraints;

            let newClip = { ...clip };

            if (dragState.type === 'left') {
                // Moving Start
                const proposedTimelineIn = clip.timelineInMs + deltaMs;

                // CLAMP 1: Boundary check
                const clampedTimelineIn = Math.min(Math.max(proposedTimelineIn, minTimelineIn), maxTimelineIn);

                // Calculate valid delta based on clamped value
                const finalTimelineDelta = clampedTimelineIn - clip.timelineInMs;
                const sourceDelta = finalTimelineDelta * clip.speed;

                const proposedSourceIn = clip.sourceInMs + sourceDelta;

                // CLAMP 2: Source Content check
                if (proposedSourceIn >= clip.sourceOutMs) return;

                newClip.timelineInMs = clampedTimelineIn;
                newClip.sourceInMs = proposedSourceIn;

            } else {
                // Moving End
                const sourceDelta = deltaMs * clip.speed;
                const proposedSourceOut = clip.sourceOutMs + sourceDelta;

                const proposedTimelineDuration = (proposedSourceOut - clip.sourceInMs) / clip.speed;
                const proposedTimelineOut = clip.timelineInMs + proposedTimelineDuration;

                let validSourceOut = proposedSourceOut;

                // Check Max Timeline Boundary
                if (proposedTimelineOut > dragState.constraints.maxTimelineIn) {
                    const maxDurationMs = dragState.constraints.maxTimelineIn - clip.timelineInMs;
                    validSourceOut = clip.sourceInMs + (maxDurationMs * clip.speed);
                }

                // Check Min Duration
                if (validSourceOut <= clip.sourceInMs) {
                    validSourceOut = clip.sourceInMs + 100; // Min 100ms
                }

                newClip.sourceOutMs = validSourceOut;
            }

            // UPDATE LOCAL STATE, NOT STORE
            setDragState(prev => prev ? { ...prev, currentClip: newClip } : null);
        };

        const handleGlobalMouseUp = () => {
            // COMMIT TO STORE
            if (dragState) {
                updateClip(dragState.trackId, dragState.currentClip);
            }
            setDragState(null);
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [dragState, pixelsPerSec, updateClip]);

    const handleDragStart = (e: React.MouseEvent, id: string, type: 'left' | 'right', trackId: string) => {
        e.preventDefault();
        e.stopPropagation();

        // Find the clip object (Search in the specified track)
        let track = null;
        if (trackId === timeline.mainTrack.id) {
            track = timeline.mainTrack;
        } else if (timeline.overlayTrack && trackId === timeline.overlayTrack.id) {
            track = timeline.overlayTrack;
        }

        if (!track) return;

        const clipIndex = track.clips.findIndex(c => c.id === id);
        if (clipIndex === -1) return;

        const clip = track.clips[clipIndex];

        // --- Calculate Constraints ---
        let minTimelineIn = 0;
        let maxTimelineIn = Infinity;

        if (type === 'left') {
            // LEFT Handle: 
            if (clipIndex > 0) {
                const prevClip = track.clips[clipIndex - 1];
                minTimelineIn = prevClip.timelineInMs + (prevClip.sourceOutMs - prevClip.sourceInMs) / prevClip.speed;
            }
            // Max is constrained by current End
            const timelineOut = clip.timelineInMs + (clip.sourceOutMs - clip.sourceInMs) / clip.speed;
            maxTimelineIn = timelineOut - 100;
        } else {
            // RIGHT Handle:
            if (clipIndex < track.clips.length - 1) {
                const nextClip = track.clips[clipIndex + 1];
                maxTimelineIn = nextClip.timelineInMs;
            }
        }

        setDragState({
            clipId: id,
            trackId,
            type,
            startX: e.clientX,
            initialClip: clip,
            currentClip: clip,
            constraints: {
                minTimelineIn,
                maxTimelineIn,
                maxSourceDuration: Infinity // TODO
            }
        });
    };

    // --- Format Helper ---
    const formatFullTime = (ms: number) => {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const sec = s % 60;
        const dec = Math.floor((ms % 1000) / 100);
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${dec}`;
    };

    // const videoTracks = project.timeline.tracks.filter(t => t.type === 'video'); // REMOVED

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] select-none text-white font-sans">
            {/* 1. Toolbar */}
            <div className="h-10 flex items-center px-2 bg-[#252526] border-b border-[#333] shrink-0 justify-between">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => splitAt(currentTimeMs)}
                        className="flex items-center gap-1 px-3 py-1 bg-[#333] hover:bg-[#444] rounded text-xs font-medium transition-colors"
                    >
                        ✂️ Split
                    </button>
                    <div className="w-[1px] h-4 bg-[#444] mx-2"></div>
                </div>

                <div className="flex items-center gap-4 bg-[#111] px-4 py-1 rounded-full border border-[#333]">
                    <button onClick={() => setIsPlaying(!isPlaying)} className="hover:text-green-400">
                        {isPlaying ? '⏸' : '▶️'}
                    </button>
                    <div className="font-mono text-xs text-gray-400 w-32 text-center">
                        {formatFullTime(currentTimeMs)} / {formatFullTime(totalDuration)}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">Scale</span>
                    <input
                        type="range" min={MIN_PIXELS_PER_SEC} max={MAX_PIXELS_PER_SEC}
                        value={pixelsPerSec}
                        onChange={(e) => setPixelsPerSec(Number(e.target.value))}
                        className="w-24 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>

            {/* 2. Timeline Surface */}
            <div
                className="flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar bg-[#1e1e1e]"
                ref={containerRef}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
            >
                <div
                    className="relative min-w-full"
                    style={{ width: `${Math.max(totalWidth + 400, 0)}px` }}
                >
                    {/* Ruler */}
                    <TimelineRuler totalWidth={totalWidth} pixelsPerSec={pixelsPerSec} />

                    {/* Tracks Container */}
                    <div className="py-2 flex flex-col gap-1">

                        {/* Render Main Video Track */}
                        {(() => {
                            const track = timeline.mainTrack;
                            // Optimistic Update: Replace dragged clip in the list
                            const displayClips = track.clips.map(c =>
                                (dragState && dragState.trackId === track.id && dragState.clipId === c.id)
                                    ? dragState.currentClip
                                    : c
                            );

                            return (
                                <div key={track.id} className="flex flex-col">
                                    <TimelineTrackVideo
                                        clips={displayClips}
                                        pixelsPerSec={pixelsPerSec}
                                        trackHeight={TRACK_HEIGHT}
                                        onDragStart={(e, id, type) => handleDragStart(e, id, type, track.id)}
                                    />
                                    {track.viewportMotions && track.viewportMotions.length > 0 && (
                                        <TimelineTrackViewportMotions
                                            motions={track.viewportMotions}
                                            pixelsPerSec={pixelsPerSec}
                                        />
                                    )}
                                    {track.mouseEffects && track.mouseEffects.length > 0 && (
                                        <TimelineTrackMouseEffects
                                            effects={track.mouseEffects}
                                            pixelsPerSec={pixelsPerSec}
                                        />
                                    )}
                                </div>
                            );
                        })()}

                        {/* Render Overlay Track */}
                        {timeline.overlayTrack && timeline.overlayTrack.visible && (
                            <div key={timeline.overlayTrack.id} className="flex flex-col mt-4">
                                {(() => {
                                    const track = timeline.overlayTrack!;
                                    // Optimistic Update
                                    const displayClips = track.clips.map(c =>
                                        (dragState && dragState.trackId === track.id && dragState.clipId === c.id)
                                            ? dragState.currentClip
                                            : c
                                    );

                                    return (
                                        <TimelineTrackVideo
                                            clips={displayClips}
                                            pixelsPerSec={pixelsPerSec}
                                            trackHeight={TRACK_HEIGHT}
                                            onDragStart={(e, id, type) => handleDragStart(e, id, type, track.id)}
                                        />
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                    {/* Hover Line */}
                    {hoverTime !== null && (
                        <div
                            className="absolute top-0 bottom-0 w-[1px] bg-white/30 z-20 pointer-events-none"
                            style={{ left: `${(hoverTime / 1000) * pixelsPerSec}px` }}
                        />
                    )}

                    {/* CTI */}
                    <div
                        className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-30 pointer-events-none"
                        style={{ left: `${(currentTimeMs / 1000) * pixelsPerSec}px` }}
                    >
                        <div className="absolute -top-1 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] border-t-red-500"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helper
function userClipEnd(c: Clip) {
    return c.timelineInMs + (c.sourceOutMs - c.sourceInMs) / c.speed;
}
