
import { strict as assert } from 'node:assert';
import { TimelineImpl } from './Timeline';
import { TrackImpl } from './Track';
import { ClipImpl } from './Clip';
import { Track, Clip } from '../types';

function runTest(name: string, fn: () => void) {
    try {
        console.log(`Running: ${name}`);
        fn();
        console.log(`✅ Passed`);
    } catch (e) {
        console.error(`❌ Failed: ${name}`);
        console.error(e);
        process.exit(1);
    }
}

// Helpers
function createMockClip(timelineIn: number, duration: number, linkGroup?: string): Clip {
    return ClipImpl.create('source-1', 0, duration, timelineIn, { linkGroupId: linkGroup });
}

console.log('=== Starting Timeline Core Tests ===');

runTest('Clip Splitting', () => {
    // 10s clip at t=0
    const clip = createMockClip(0, 10000);

    // Split at 4s
    const [left, right] = ClipImpl.split(clip, 4000);

    // Left: 0-4s
    assert.equal(left.timelineInMs, 0);
    assert.equal(left.sourceInMs, 0);
    assert.equal(left.sourceOutMs, 4000);

    // Right: 4-10s
    assert.equal(right.timelineInMs, 4000);
    assert.equal(right.sourceInMs, 4000);
    assert.equal(right.sourceOutMs, 10000);
});

runTest('Timeline Linkage Splitting', () => {
    let timeline = TimelineImpl.create();

    // Track 1: Video
    let videoTrack = TrackImpl.create('Video', 'video');
    const videoClip = createMockClip(0, 10000, 'group-1');
    videoTrack = TrackImpl.addClip(videoTrack, videoClip);

    // Track 2: Audio (Linked)
    let audioTrack = TrackImpl.create('Audio', 'audio');
    const audioClip = createMockClip(0, 10000, 'group-1'); // Same Group
    audioTrack = TrackImpl.addClip(audioTrack, audioClip);

    // Track 3: Overlay (Unlinked)
    let overlayTrack = TrackImpl.create('Overlay', 'overlay');
    const overlayClip = createMockClip(0, 10000); // No Group
    overlayTrack = TrackImpl.addClip(overlayTrack, overlayClip);

    timeline = TimelineImpl.addTrack(timeline, videoTrack);
    timeline = TimelineImpl.addTrack(timeline, audioTrack);
    timeline = TimelineImpl.addTrack(timeline, overlayTrack);

    // --- EXECUTE SPLIT AT 5000ms ---
    timeline = TimelineImpl.splitAt(timeline, 5000);

    // Verify Video Track (Should be split)
    const t1 = timeline.tracks[0];
    assert.equal(t1.clips.length, 2, 'Video Track should have 2 clips');
    assert.equal(t1.clips[0].sourceOutMs, 5000);
    assert.equal(t1.clips[1].timelineInMs, 5000);

    // Verify Audio Track (Should be split because of LINK)
    const t2 = timeline.tracks[1];
    assert.equal(t2.clips.length, 2, 'Audio Track should have 2 clips (Linked)');

    // Verify Overlay Track (Should NOT be split because unlinked and separate)
    // Wait, if the playhead is over it, it SHOULD split if we follow standard "Razor All" logic.
    // BUT my implementation only Razor's:
    // 1. Clips directly under playhead (if they are on selected tracks? Or all tracks?)
    // 2. Linked clips.

    // Current Implementation of splitAt:
    // "Identify which clips *would* be split normally (directly under playhead)" -> Loops ALL tracks.
    // So Overlay Track SHOULD be split too if it's under the playhead.

    const t3 = timeline.tracks[2];
    assert.equal(t3.clips.length, 2, 'Overlay Track should also split purely by position');
});

runTest('Linkage Splitting with Offset', () => {
    // Test where linked clips are NOT perfectly aligned but still share a group
    let timeline = TimelineImpl.create();

    // T1: Clip 0-10s (Group A)
    let t1 = TrackImpl.create('T1');
    t1 = TrackImpl.addClip(t1, createMockClip(0, 10000, 'A'));

    // T2: Clip 2-12s (Group A) -> Starts later
    let t2 = TrackImpl.create('T2');
    t2 = TrackImpl.addClip(t2, createMockClip(2000, 10000, 'A'));

    timeline = TimelineImpl.addTrack(timeline, t1);
    timeline = TimelineImpl.addTrack(timeline, t2);

    // Split at 1000ms.
    // T1 is hit (0-10s).
    // T2 is NOT hit by position (starts at 2000s).
    // Should T2 be split? No, split point is outside T2 bounds.
    timeline = TimelineImpl.splitAt(timeline, 1000);

    assert.equal(timeline.tracks[0].clips.length, 2, 'T1 Split');
    assert.equal(timeline.tracks[1].clips.length, 1, 'T2 Not Split (Out of bounds)');
});

runTest('Track Overlap Prevention', () => {
    let track = TrackImpl.create('T1');
    track = TrackImpl.addClip(track, createMockClip(0, 5000)); // 0-5s

    assert.throws(() => {
        // Try adding overlapping clip (4s-9s)
        TrackImpl.addClip(track, createMockClip(4000, 5000));
    }, /overlap/);
});
