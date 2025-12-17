import React from 'react';
import type { Segment } from '../store';

interface TimelineTrackZoomProps {
    metadata: any[];
    segments: Segment[];
    pixelsPerSec: number;
    trackHeight: number;
    recordingStartTime: number;
}

export const TimelineTrackZoom: React.FC<TimelineTrackZoomProps> = ({
    metadata,
    segments,
    pixelsPerSec,
    trackHeight,
    recordingStartTime
}) => {
    return (
        <div className="relative w-full" style={{ height: trackHeight }}>
            {metadata.map((item, index) => {
                let virtualStart = -1;
                let currentVirtual = 0;
                let found = false;

                // Convert Absolute Timestamp (Date.now()) to Relative Source Time (0...duration)
                const relativeTimestamp = item.timestamp - recordingStartTime;

                for (const seg of segments) {
                    if (relativeTimestamp >= seg.sourceStart && relativeTimestamp <= seg.sourceEnd) {
                        virtualStart = currentVirtual + (relativeTimestamp - seg.sourceStart);
                        found = true;
                        break;
                    }
                    currentVirtual += (seg.sourceEnd - seg.sourceStart);
                }

                if (!found) return null;

                const duration = 3000;
                const left = (virtualStart / 1000) * pixelsPerSec;
                const width = (duration / 1000) * pixelsPerSec;

                return (
                    <div
                        key={index}
                        className="absolute top-0 bottom-0 bg-[#00acc1] border border-[#00acc1] rounded-md overflow-hidden text-xs text-white flex items-center px-2 shadow-sm"
                        style={{ left: `${left}px`, width: `${width}px` }}
                    >
                        🔍 Zoom
                    </div>
                );
            })}
        </div>
    );
};
