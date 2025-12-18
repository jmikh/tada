
import { strict as assert } from 'node:assert';
import { TimelineImpl } from './Timeline';
import { TrackImpl } from './Track';
import { ClipImpl } from './Clip';
import { Clip } from '../types';

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

function createMockClip(timelineIn: number, duration: number, linkGroup?: string): Clip {
    return ClipImpl.create('source-1', 0, duration, timelineIn, { linkGroupId: linkGroup });
}

console.log('=== Starting Targeted Splitting Tests ===');

runTest('Targeted Split vs Logic', () => {
    let timeline = TimelineImpl.create();

    // T1: Unlinked (Video)
    let t1 = TrackImpl.create('Video');
    t1 = TrackImpl.addClip(t1, createMockClip(0, 10000));

    // T2: Linked Group A (Screen)
    let t2 = TrackImpl.create('Screen');
    t2 = TrackImpl.addClip(t2, createMockClip(0, 10000, 'A'));

    // T3: Linked Group A (Audio)
    let t3 = TrackImpl.create('Audio');
    t3 = TrackImpl.addClip(t3, createMockClip(0, 10000, 'A'));

    timeline = TimelineImpl.addTrack(timeline, t1);
    timeline = TimelineImpl.addTrack(timeline, t2);
    timeline = TimelineImpl.addTrack(timeline, t3);

    // CASE 1: Split T2 (Screen). Should split T2 + T3 (Linked), but leave T1 (Unlinked) alone.
    console.log('--- Splitting Only Track 2 (and links) ---');
    const splitTimeline = TimelineImpl.splitAt(timeline, 5000, t2.id);

    // Verify T2 (Target) -> SPLIT
    assert.equal(splitTimeline.tracks[1].clips.length, 2, 'T2 (Target) should be split');

    // Verify T3 (Linked) -> SPLIT
    assert.equal(splitTimeline.tracks[2].clips.length, 2, 'T3 (Linked) should be split');

    // Verify T1 (Unlinked) -> NOT SPLIT
    assert.equal(splitTimeline.tracks[0].clips.length, 1, 'T1 (Unlinked) should NOT be split');
});

runTest('Razor All (No Target)', () => {
    let timeline = TimelineImpl.create();

    let t1 = TrackImpl.create('Video');
    t1 = TrackImpl.addClip(t1, createMockClip(0, 10000));

    let t2 = TrackImpl.create('Audio');
    t2 = TrackImpl.addClip(t2, createMockClip(0, 10000));

    timeline = TimelineImpl.addTrack(timeline, t1);
    timeline = TimelineImpl.addTrack(timeline, t2);

    // No target arg provided -> Razor All
    const splitTimeline = TimelineImpl.splitAt(timeline, 5000);

    assert.equal(splitTimeline.tracks[0].clips.length, 2, 'T1 Split');
    assert.equal(splitTimeline.tracks[1].clips.length, 2, 'T2 Split');
});
