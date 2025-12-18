
import { Track, Clip, TimeMs } from '../types';
import { ClipImpl } from './Clip';

export class TrackImpl {
    static create(name: string, type: Track['type'] = 'video'): Track {
        return {
            id: crypto.randomUUID(),
            type,
            name,
            clips: [],
            effects: [],
            muted: false,
            locked: false,
            visible: true
        };
    }

    /**
     * Adds a clip to the track, maintaining order and ensuring NO OVERLAPS.
     * Throws if overlap detected.
     */
    static addClip(track: Track, clip: Clip): Track {
        // Simple O(N) check for now. Can optimize with binary search later.
        const newTrack = { ...track, clips: [...track.clips] };

        // Find insertion point
        // We want to sort by timelineInMs
        newTrack.clips.sort((a, b) => a.timelineInMs - b.timelineInMs);

        // Validate overlaps
        for (let i = 0; i < newTrack.clips.length; i++) {
            const current = newTrack.clips[i];
            const next = newTrack.clips[i + 1];

            // Check overlap with new clip (if we were simply pushing it, but we are doing a full re-validation here strictly speaking)
            // But let's actually just check the *candidate* clip against existing ones before adding?
            // The 'immutable' style suggests returning a new object.
        }

        // Better approach: Check collision of `clip` against all `track.clips`.
        for (const existing of track.clips) {
            if (TrackImpl.checkOverlap(existing, clip)) {
                throw new Error(`Clip overlaps with existing clip ${existing.id}`);
            }
        }

        // Add and Sort
        newTrack.clips.push(clip);
        newTrack.clips.sort((a, b) => a.timelineInMs - b.timelineInMs);

        return newTrack;
    }

    private static checkOverlap(a: Clip, b: Clip): boolean {
        const aStart = a.timelineInMs;
        const aEnd = ClipImpl.getTimelineOut(a);

        const bStart = b.timelineInMs;
        const bEnd = ClipImpl.getTimelineOut(b);

        return (aStart < bEnd) && (bStart < aEnd);
    }

    static findClipAtTime(track: Track, timeMs: TimeMs): Clip | null {
        // Linear search is fine for small N
        return track.clips.find(clip => ClipImpl.containsTime(clip, timeMs)) || null;
    }

    /**
     * Splits a clip in the track at the given time.
     * Returns new Track state.
     */
    static splitAt(track: Track, timeMs: TimeMs): Track {
        const targetClip = TrackImpl.findClipAtTime(track, timeMs);
        if (!targetClip) {
            return track; // Nothing to split
        }

        // Perform split
        const [left, right] = ClipImpl.split(targetClip, timeMs);

        // Replace targetClip with left and right
        const newClips = track.clips.filter(c => c.id !== targetClip.id);
        newClips.push(left, right);
        newClips.sort((a, b) => a.timelineInMs - b.timelineInMs);

        return {
            ...track,
            clips: newClips
        };
    }
}
