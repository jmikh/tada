import React from 'react';
import type { Segment } from '../store';

interface TimelineTrackVideoProps {
    virtualSegments: (Segment & { virtualStart: number; virtualEnd: number; duration: number })[];
    pixelsPerSec: number;
    trackHeight: number;
    onDragStart: (e: React.MouseEvent, id: string, type: 'left' | 'right', val: number) => void;
}

export const TimelineTrackVideo: React.FC<TimelineTrackVideoProps> = ({ virtualSegments, pixelsPerSec, trackHeight, onDragStart }) => {
    return (
        <div className="relative w-full" style={{ height: trackHeight }}>
            {virtualSegments.map((seg) => {
                const left = (seg.virtualStart / 1000) * pixelsPerSec;
                const width = (seg.duration / 1000) * pixelsPerSec;

                return (
                    <div
                        key={seg.id}
                        className="absolute top-0 bottom-0 bg-green-600/90 border border-green-500/50 rounded-md overflow-hidden group hover:brightness-110 transition-all cursor-pointer box-border"
                        style={{ left: `${left}px`, width: `${width}px` }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center px-2 h-full gap-2 text-xs font-medium text-white shadow-sm">
                            <span>🎥 Clip</span>
                            <span className="opacity-70 font-normal">{(seg.duration / 1000).toFixed(1)}s</span>
                        </div>

                        <div
                            className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize hover:bg-white/30 z-20"
                            onMouseDown={(e) => onDragStart(e, seg.id, 'left', seg.sourceStart)}
                        />
                        <div
                            className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize hover:bg-white/30 z-20"
                            onMouseDown={(e) => onDragStart(e, seg.id, 'right', seg.sourceEnd)}
                        />
                    </div>
                );
            })}
        </div>
    );
};
