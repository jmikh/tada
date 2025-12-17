import React, { useRef, useState, useMemo, useCallback } from 'react';
import { useEditorStore } from './store';
import { getTotalDuration } from './utils';
import { TimelineRuler } from './timeline/TimelineRuler';
import { TimelineTrackVideo } from './timeline/TimelineTrackVideo';
import { TimelineTrackZoom } from './timeline/TimelineTrackZoom';

// Constants
const MIN_PIXELS_PER_SEC = 10;
const MAX_PIXELS_PER_SEC = 200;
const TRACK_HEIGHT = 40;

export function Timeline() {
    const containerRef = useRef<HTMLDivElement>(null);
    const {
        segments,
        metadata,
        currentTime,
        recordingStartTime,
        splitSegment,
        setCurrentTime,
        isPlaying,
        setIsPlaying,
        updateSegment
    } = useEditorStore();

    // Zoom Level (Timeline Scale)
    const [pixelsPerSec, setPixelsPerSec] = useState(100);

    const totalDuration = useMemo(() => getTotalDuration(segments), [segments]);
    const totalWidth = (totalDuration / 1000) * pixelsPerSec;

    // Interaction State
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [isCTIScrubbing, setIsCTIScrubbing] = useState(false);

    // Timeline tracks dragging logic is handled by store actions (updateSegment), 
    // but the drag interaction state originates here or in tracks.
    // The Tracks components emit onDragStart. We need to handle the drag listeners here or pass the handler.
    // The previous implementation had dragging state local to Timeline.
    // We should lift the state or handle it here.
    // Since TimelineTrackVideo calls onDragStart, we need the handler here.

    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragType, setDragType] = useState<'left' | 'right' | null>(null);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartVal, setDragStartVal] = useState(0); // This was sourceStart/End

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
        // Only start scrubbing if accessing the background/ruler area, not clips
        // But clips stop propagation, so this should be fine.
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
    // This effect handles global mouse move/up when dragging a handle
    React.useEffect(() => {
        if (!draggingId || !dragType) return;

        const handleGlobalMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - dragStartX;
            const deltaMs = (deltaX / pixelsPerSec) * 1000;

            // We need to know the original segment to apply constraints
            // But updateSegment handles logic if we pass raw new values? 
            // The store's updateSegment takes (id, newStart, newEnd).
            // We need to calculate new values based on delta.

            // Re-find segment to get current constraints? 
            // Or we just calculate new potential value.

            const segment = segments.find(s => s.id === draggingId);
            if (!segment) return;

            if (dragType === 'left') {
                const newStart = Math.max(0, dragStartVal + deltaMs);
                // Ensure start < end
                if (newStart < segment.sourceEnd) {
                    updateSegment(draggingId, newStart, segment.sourceEnd);
                }
            } else {
                const newEnd = Math.max(segment.sourceStart, dragStartVal + deltaMs);
                updateSegment(draggingId, segment.sourceStart, newEnd);
            }
        };

        const handleGlobalMouseUp = () => {
            setDraggingId(null);
            setDragType(null);
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [draggingId, dragType, dragStartX, dragStartVal, pixelsPerSec, segments, updateSegment]);

    const handleDragStart = (e: React.MouseEvent, id: string, type: 'left' | 'right', val: number) => {
        e.preventDefault();
        e.stopPropagation();
        setDraggingId(id);
        setDragType(type);
        setDragStartX(e.clientX);
        setDragStartVal(val);
    };

    // --- Format Helper for Toolbar ---
    const formatFullTime = (ms: number) => {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const sec = s % 60;
        const dec = Math.floor((ms % 1000) / 100);
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${dec}`;
    };

    // Calculate segments layout for Video Track
    const virtualSegments = useMemo(() => {
        let currentVirtual = 0;
        return segments.map(seg => {
            const duration = seg.sourceEnd - seg.sourceStart;
            const start = currentVirtual;
            currentVirtual += duration;
            return { ...seg, virtualStart: start, virtualEnd: currentVirtual, duration };
        });
    }, [segments]);

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] select-none text-white font-sans">
            {/* 1. Toolbar */}
            <div className="h-10 flex items-center px-2 bg-[#252526] border-b border-[#333] shrink-0 justify-between">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => splitSegment(currentTime)}
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
                        {formatFullTime(currentTime)} / {formatFullTime(totalDuration)}
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

                        {/* Video Track */}
                        <TimelineTrackVideo
                            virtualSegments={virtualSegments}
                            pixelsPerSec={pixelsPerSec}
                            trackHeight={TRACK_HEIGHT}
                            onDragStart={handleDragStart}
                        />

                        {/* Zoom Track */}
                        <TimelineTrackZoom
                            metadata={metadata}
                            segments={segments}
                            pixelsPerSec={pixelsPerSec}
                            trackHeight={TRACK_HEIGHT}
                            recordingStartTime={recordingStartTime}
                        />
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
                        style={{ left: `${(currentTime / 1000) * pixelsPerSec}px` }}
                    >
                        <div className="absolute -top-1 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] border-t-red-500"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
