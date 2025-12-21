import type { UserEvent, ViewportMotion, Size, MouseEvent, Rect, Clip } from '../types.ts';
import { ViewTransform } from './viewTransform.ts';
import { mapEventsToTimeline } from './timeMapper.ts';

export * from './viewTransform.ts';

// ============================================================================
// Core Abstractions
// ============================================================================


/**
 * Analyzes a stream of UserEvents to detect periods where the mouse remains
 * relatively stationary (within a bounding box) for a minimum duration.
 * Returns these periods as synthetic 'HoverEvents'.
 * 
 * @param events List of user events (can be raw or mapped to timeline)
 * @param inputSize Dimensions of the input view to determine hover bounding box size
 */
export function findHoverEvents(
    events: UserEvent[],
    inputSize: Size
): UserEvent[] {
    // 1. Determine Box Size (10% of the bigger dimension)
    const boxSize = Math.max(inputSize.width, inputSize.height) * 0.1;
    const minDuration = 1000; // 1 second in ms

    const hoverEvents: UserEvent[] = [];
    let currentSegment: MouseEvent[] = [];

    // Helper to process a continuous segment of mouse events
    const processSegment = (segment: MouseEvent[]) => {
        let i = 0;
        while (i < segment.length) {
            let j = i;
            let minX = segment[i].x;
            let maxX = segment[i].x;
            let minY = segment[i].y;
            let maxY = segment[i].y;

            // Greedy expansion: find the longest sequence starting at i that fits in the box
            // TODO: this ineffecient, might be find if we only calculate on clip changes.
            while (j < segment.length) {
                const p = segment[j];
                const newMinX = Math.min(minX, p.x);
                const newMaxX = Math.max(maxX, p.x);
                const newMinY = Math.min(minY, p.y);
                const newMaxY = Math.max(maxY, p.y);

                // Check if the bounding box dimensions are within the allowed boxSize
                if ((newMaxX - newMinX) <= boxSize && (newMaxY - newMinY) <= boxSize) {
                    minX = newMinX;
                    maxX = newMaxX;
                    minY = newMinY;
                    maxY = newMaxY;
                    j++;
                } else {
                    break;
                }
            }

            // Check if the identified block meets the duration requirement
            // j is exclusive, so the block is events[i] to events[j-1]
            if (j > i) {
                const startEvent = segment[i];
                const endEvent = segment[j - 1];
                const duration = endEvent.timestamp - startEvent.timestamp;

                if (duration >= minDuration) {
                    // Valid Hover Block found
                    const points = segment.slice(i, j);
                    const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
                    const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

                    hoverEvents.push({
                        type: 'hover',
                        timestamp: startEvent.timestamp,
                        x: centerX,
                        y: centerY,
                        endTime: endEvent.timestamp
                    } as UserEvent); // Cast needed if TS strictness issues with union, but actually fits HoverEvent

                    // Advance i to j to continue searching after this block
                    // (Try to fill "already created" implies we took the max possible, so we move on)
                    i = j;
                } else {
                    // Sequence too short, try starting from the next point
                    i++;
                }
            } else {
                i++;
            }
        }
    };

    // 2. Iterate events and split by separators (clicks, etc.)
    for (const evt of events) {
        if (evt.type === 'mouse') {
            currentSegment.push(evt);
        } else if (evt.type === 'click' || evt.type === 'url') {
            // These events break the "hover" continuity
            if (currentSegment.length > 0) {
                processSegment(currentSegment);
                currentSegment = [];
            }
        }
    }

    // Process potential remaining segment
    if (currentSegment.length > 0) {
        processSegment(currentSegment);
    }

    return hoverEvents;
}

export function calculateZoomSchedule(
    maxZoom: number,
    viewTransform: ViewTransform, // Kept for signature compatibility
    events: UserEvent[],
    clips: Clip[]
): ViewportMotion[] {
    const motions: ViewportMotion[] = [];

    // 1. Filter & Map Raw Events to Output Time (Applies Cuts & Latency)
    const mappedEvents = mapEventsToTimeline(events, clips);

    if (mappedEvents.length === 0) {
        return motions;
    }

    // 2. Detect Hovers on the TIMELINE (Visual Hovers)
    // We project the mapped events to a flat list using timeline time.
    // This ensures we detect hovers that exist *after* editing (e.g. across cuts).
    const timelineEvents: UserEvent[] = mappedEvents.map(m => ({
        ...m.originalEvent,
        timestamp: m.outputTime // Override with Timeline Time
    }));

    const hoverEvents = findHoverEvents(timelineEvents, viewTransform.inputVideoSize);

    // 3. Inject Hovers back into mappedEvents
    for (const hEvent of hoverEvents) {
        if (hEvent.type !== 'hover') continue;

        mappedEvents.push({
            outputTime: hEvent.timestamp,
            originalEvent: hEvent
        });
    }

    // 4. Re-sort (since we added new events)
    mappedEvents.sort((a, b) => a.outputTime - b.outputTime);

    // 5. Prepare for Zoom Level Calculation (Output Space)
    // Zoom 1x = Full Output Size.
    // Zoom 2x = Half Output Size (centered).
    const zoomLevel = maxZoom;

    const targetWidth = viewTransform.outputVideoSize.width / zoomLevel;
    const targetHeight = viewTransform.outputVideoSize.height / zoomLevel;

    // Default duration for a zoom "scene" around a click
    const ZOOM_HOLD_DURATION = 2000;
    const ZOOM_TRANSITION_DURATION = 500;

    for (let i = 0; i < mappedEvents.length; i++) {
        const { outputTime, originalEvent: evt } = mappedEvents[i];

        if (evt.type !== 'click' && evt.type !== 'hover') continue;

        // 1. Map Click to Output Space
        const clickOutput = viewTransform.inputToOutput({ x: evt.x, y: evt.y });

        // 2. Center Viewport on Click
        let viewportX = clickOutput.x - targetWidth / 2;
        let viewportY = clickOutput.y - targetHeight / 2;

        // 3. Clamp to Output Space Edges
        // The Viewport must stay within the Output Canvas (0,0 -> OutputW, OutputH)

        const maxX = viewTransform.outputVideoSize.width - targetWidth;
        const maxY = viewTransform.outputVideoSize.height - targetHeight;

        if (viewportX < 0) viewportX = 0;
        else if (viewportX > maxX) viewportX = maxX;

        if (viewportY < 0) viewportY = 0;
        else if (viewportY > maxY) viewportY = maxY;

        const newViewport: Rect = {
            x: viewportX,
            y: viewportY,
            width: targetWidth,
            height: targetHeight
        };

        // Timing Logic (All in Output Time / Timeline Time)
        const timeIn = Math.max(0, outputTime - ZOOM_TRANSITION_DURATION);

        // We arrive at target exactly at click time
        const arrivalTime = outputTime;

        motions.push({
            id: crypto.randomUUID(),
            timeInMs: timeIn,
            timeOutMs: arrivalTime,
            viewport: newViewport,
            easing: 'ease_in_out'
        });

        // Hold the zoom
        const nextMapped = mappedEvents[i + 1];
        const holdUntil = arrivalTime + ZOOM_HOLD_DURATION;

        if (nextMapped && nextMapped.outputTime < holdUntil + ZOOM_TRANSITION_DURATION * 2) {
            // Stay zoomed
        } else {
            // Zoom out to full view
            const fullView: Rect = {
                x: 0, y: 0,
                width: viewTransform.outputVideoSize.width,
                height: viewTransform.outputVideoSize.height
            };

            const zoomOutStart = Math.max(arrivalTime + 1000, arrivalTime + 500);
            const zoomOutEnd = zoomOutStart + ZOOM_TRANSITION_DURATION;

            motions.push({
                id: crypto.randomUUID(),
                timeInMs: zoomOutStart,
                timeOutMs: zoomOutEnd,
                viewport: fullView,
                easing: 'ease_in_out'
            });
        }
    }

    return motions;
}

// ============================================================================
// Runtime Execution / Interpolation
// ============================================================================

/*
 * Calculates the current Viewport (in Output Space)
 * based on the list of motions and the current time.
 */
export function getViewportStateAtTime(
    motions: ViewportMotion[],
    timeMs: number,
    fullSize: Size
): Rect {
    const fullRect: Rect = { x: 0, y: 0, width: fullSize.width, height: fullSize.height };

    if (!motions || motions.length === 0) {
        return fullRect;
    }

    // Ensure motions are sorted
    const sortedMotions = [...motions].sort((a, b) => a.timeInMs - b.timeInMs);

    // Before first motion
    if (timeMs < sortedMotions[0].timeInMs) {
        return fullRect;
    }

    // After last motion
    const lastMotion = sortedMotions[sortedMotions.length - 1];
    if (timeMs >= lastMotion.timeOutMs) {
        return lastMotion.viewport;
    }

    // Find the relevant motion segment
    for (let i = 0; i < sortedMotions.length; i++) {
        const curr = sortedMotions[i];

        // Case: Inside a motion (Interpolating)
        if (timeMs >= curr.timeInMs && timeMs < curr.timeOutMs) {
            let startRect = fullRect;
            if (i > 0) {
                startRect = sortedMotions[i - 1].viewport;
            }

            const duration = curr.timeOutMs - curr.timeInMs;
            const elapsed = timeMs - curr.timeInMs;
            const progress = duration === 0 ? 1 : elapsed / duration;

            const easedProgress = applyEasing(progress, curr.easing);

            return interpolateRect(startRect, curr.viewport, easedProgress);
        }

        // Case: Between motions (Holding previous target)
        if (i < sortedMotions.length - 1) {
            const next = sortedMotions[i + 1];
            if (timeMs >= curr.timeOutMs && timeMs < next.timeInMs) {
                return curr.viewport;
            }
        }
    }

    return fullRect;
}

function applyEasing(t: number, type: ViewportMotion['easing']): number {
    switch (type) {
        case 'ease_in':
            return t * t;
        case 'ease_out':
            return t * (2 - t);
        case 'ease_in_out':
            return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        case 'linear':
        default:
            return t;
    }
}

function interpolateRect(from: Rect, to: Rect, t: number): Rect {
    return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        width: from.width + (to.width - from.width) * t,
        height: from.height + (to.height - from.height) * t,
    };
}
