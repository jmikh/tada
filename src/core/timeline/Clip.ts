
import { Clip, ID, TimeMs } from '../types';

export class ClipImpl {
    /**
     * Creates a new Clip with validation.
     */
    static create(
        sourceId: string,
        sourceInMs: TimeMs,
        sourceOutMs: TimeMs,
        timelineInMs: TimeMs,
        options: Partial<Omit<Clip, 'id' | 'sourceId' | 'sourceInMs' | 'sourceOutMs' | 'timelineInMs'>> = {}
    ): Clip {
        if (sourceInMs >= sourceOutMs) {
            throw new Error(`Invalid Clip Duration: sourceIn (${sourceInMs}) >= sourceOut (${sourceOutMs})`);
        }

        return {
            id: crypto.randomUUID(),
            sourceId,
            sourceInMs,
            sourceOutMs,
            timelineInMs,
            speed: 1.0,
            audioVolume: 1.0,
            audioMuted: false,
            ...options
        };
    }

    static getDuration(clip: Clip): TimeMs {
        return (clip.sourceOutMs - clip.sourceInMs) / clip.speed;
    }

    static getTimelineOut(clip: Clip): TimeMs {
        return clip.timelineInMs + ClipImpl.getDuration(clip);
    }

    /**
     * Splits a clip at a specific TIMELINE time.
     * Returns 2 new clips.
     * Throws if split time is outside clip bounds.
     */
    static split(clip: Clip, splitTimeMs: TimeMs): [Clip, Clip] {
        const start = clip.timelineInMs;
        const end = ClipImpl.getTimelineOut(clip);

        // Allow tolerance for floating point math? Using integer ms for now.
        if (splitTimeMs <= start || splitTimeMs >= end) {
            throw new Error(`Split time ${splitTimeMs} is outside clip bounds [${start}, ${end}]`);
        }

        const offsetMs = (splitTimeMs - start) * clip.speed; // Convert timeline delta to source delta

        const splitSourceTime = clip.sourceInMs + offsetMs;

        // Clip 1: Start to Split
        const left: Clip = {
            ...clip,
            id: crypto.randomUUID(), // New ID
            sourceOutMs: splitSourceTime,
        };

        // Clip 2: Split to End
        const right: Clip = {
            ...clip,
            id: crypto.randomUUID(), // New ID
            sourceInMs: splitSourceTime,
            timelineInMs: splitTimeMs,
        };

        return [left, right];
    }

    /**
     * Checks if a timeline time falls within this clip.
     */
    static containsTime(clip: Clip, timeMs: TimeMs): boolean {
        return timeMs >= clip.timelineInMs && timeMs < ClipImpl.getTimelineOut(clip);
    }
}
