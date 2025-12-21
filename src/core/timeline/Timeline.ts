import type { Timeline, MainTrack, TimeMs, ID, Clip, Track } from '../types';
import { TrackImpl } from './track';
import { ClipImpl } from './clip'; // Used

/**
 * Functional logic for Timeline operations.
 * Orchestrates the Main Track.
 */
export class TimelineImpl {
    /**
     * Creates a new Timeline with a default Main Track.
     */
    static create(): Timeline {
        return {
            id: crypto.randomUUID(),
            mainTrack: TrackImpl.createMainTrack(),
            durationMs: 0
        };
    }

    /**
     * Splits clips on ALL tracks at the given time.
     * 
     * @param timeline - The timeline to operate on.
     * @param timeMs - The time at which to split.
     * 
     * @returns A new Timeline instance.
     */
    static splitAt(timeline: Timeline, timeMs: TimeMs): Timeline {
        const updates: Partial<Timeline> = {};

        // Find clips to split
        let mainClip: Clip | null = null;
        let overlayClip: Clip | null = null;

        if (!timeline.mainTrack.locked && timeline.mainTrack.visible) {
            mainClip = TrackImpl.findClipAtTime(timeline.mainTrack, timeMs);
        }
        if (timeline.overlayTrack && !timeline.overlayTrack.locked && timeline.overlayTrack.visible) {
            overlayClip = TrackImpl.findClipAtTime(timeline.overlayTrack, timeMs);
        }

        // Check if simultaneous split is happening on linked clips
        let newLinkGroupId: string | null = null;
        if (mainClip && overlayClip && mainClip.linkGroupId && mainClip.linkGroupId === overlayClip.linkGroupId) {
            // Both clips are linked and being split together.
            // The LEFT sides will keep the old Group ID.
            // The RIGHT sides need a NEW Group ID to stay linked to each other but separate from Left.
            newLinkGroupId = crypto.randomUUID();
        }

        // 1. Process Main Track
        if (mainClip) {
            const [left, right] = ClipImpl.split(mainClip, timeMs);
            if (newLinkGroupId) {
                // Determine which one is right side? ClipImpl.split returns [left, right]
                // Left keeps old ID (copied). Right gets new ID.
                right.linkGroupId = newLinkGroupId;
            } else if (mainClip.linkGroupId) {
                // Optimization: If only ONE linked clip is split (e.g. other track locked), 
                // the Right side arguably should NOT inherit the old link ID because it has no pair? 
                // Or it keeps it, potentially linking to the still-intact other clip?
                // Current behavior (copy) means Right links to the *original* other clip?
                // No, other clip is not split. So we have 3 clips in group?
                // Default behavior: Keep link ID. 
            }

            // Update Track
            const newClips = timeline.mainTrack.clips.filter(c => c.id !== mainClip!.id);
            newClips.push(left, right);
            newClips.sort((a, b) => a.timelineInMs - b.timelineInMs);
            updates.mainTrack = { ...timeline.mainTrack, clips: newClips };
        }

        // 2. Process Overlay Track
        if (overlayClip) {
            const [left, right] = ClipImpl.split(overlayClip, timeMs);
            if (newLinkGroupId) {
                right.linkGroupId = newLinkGroupId;
            }

            // Update Track
            const newClips = timeline.overlayTrack!.clips.filter(c => c.id !== overlayClip!.id);
            newClips.push(left, right);
            newClips.sort((a, b) => a.timelineInMs - b.timelineInMs);
            updates.overlayTrack = { ...timeline.overlayTrack!, clips: newClips };
        }

        return {
            ...timeline,
            ...updates
        };
    }

    /**
     * Updates a clip on the specified track.
     */
    static updateClip(timeline: Timeline, trackId: ID, updatedClip: Clip): Timeline {
        // Helper to apply updates
        const applyToTrack = (track: MainTrack | Track, clip: Clip) => {
            if (track.id === timeline.mainTrack.id) {
                return TrackImpl.updateClip(timeline.mainTrack, clip) as MainTrack;
            } else if (timeline.overlayTrack && track.id === timeline.overlayTrack.id) {
                return TrackImpl.updateClip(timeline.overlayTrack, clip);
            }
            return track;
        };

        // 1. Identify valid tracks
        const tracks: Track[] = [timeline.mainTrack];
        if (timeline.overlayTrack) tracks.push(timeline.overlayTrack);

        // 2. Find the original clip state (to calculate deltas)
        const targetTrack = tracks.find(t => t.id === trackId);
        if (!targetTrack) return timeline;

        const originalClip = targetTrack.clips.find(c => c.id === updatedClip.id);
        if (!originalClip) return timeline;

        let newTimeline = { ...timeline };

        // 3. Apply Update to Target Clip
        // We do this first.
        const updatedTargetTrack = applyToTrack(targetTrack, updatedClip);
        if (targetTrack.id === timeline.mainTrack.id) newTimeline.mainTrack = updatedTargetTrack as MainTrack;
        if (timeline.overlayTrack && targetTrack.id === timeline.overlayTrack.id) newTimeline.overlayTrack = updatedTargetTrack;

        // 4. Handle Linking
        if (updatedClip.linkGroupId) {
            // Calculate Deltas
            const deltaTimelineIn = updatedClip.timelineInMs - originalClip.timelineInMs;
            const deltaSourceIn = updatedClip.sourceInMs - originalClip.sourceInMs;
            const deltaSourceOut = updatedClip.sourceOutMs - originalClip.sourceOutMs;
            // Speed change? Not handling complex speed sync yet, assuming constant.

            // Find other linked clips
            for (const track of tracks) {
                if (track.id === trackId) continue; // Already updated target track

                // Find clip with same linkGroupId
                // Note: We search in the *original* timeline track state, as we haven't modified it yet in `newTimeline` (except target).
                // Actually `newTimeline` has updated target track. Other tracks are untouched in `newTimeline` so far.
                const linkedClip = track.clips.find(c => c.linkGroupId === updatedClip.linkGroupId);

                if (linkedClip) {
                    // Apply Deltas
                    // Constraints: We blindly apply deltas. 
                    // TrackImpl.updateClip will handle re-sorting, but collisions might be an issue?
                    // For now, trust the delta application.

                    const newLinkedClip = {
                        ...linkedClip,
                        timelineInMs: linkedClip.timelineInMs + deltaTimelineIn,
                        sourceInMs: linkedClip.sourceInMs + deltaSourceIn,
                        sourceOutMs: linkedClip.sourceOutMs + deltaSourceOut,
                        // timelineOutMs is derived
                    };

                    const updatedTrack = applyToTrack(track, newLinkedClip);

                    if (track.id === timeline.mainTrack.id) newTimeline.mainTrack = updatedTrack as MainTrack;
                    if (timeline.overlayTrack && track.id === timeline.overlayTrack.id) newTimeline.overlayTrack = updatedTrack;
                }
            }
        }

        return newTimeline;
    }
}
