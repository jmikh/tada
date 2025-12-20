import type { ClickEvent, ZoomConfig, UserEvent, CameraMotion, Size, MouseEvent } from '../types';
import { ViewTransform } from './viewTransform';

// export * from './types'; // Removed as types are now in core
export * from './viewTransform';

// ============================================================================
// Core Abstractions
// ============================================================================

// Box interface removed

export interface HoverBlock {
    startTime: number;
    endTime: number;
    centerX: number;
    centerY: number;
}

export function findHoverBlocks(
    events: UserEvent[],
    inputSize: Size
): HoverBlock[] {
    // 1. Determine Box Size (10% of the bigger dimension)
    const boxSize = Math.max(inputSize.width, inputSize.height) * 0.1;
    const minDuration = 1000; // 1 second in ms

    const blocks: HoverBlock[] = [];
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

                    blocks.push({
                        startTime: startEvent.timestamp,
                        endTime: endEvent.timestamp,
                        centerX,
                        centerY
                    });

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

    return blocks;
}

export function calculateZoomSchedule(
    config: ZoomConfig,
    mappingConfig: ViewTransform, // Kept for signature compatibility
    events: UserEvent[]
): CameraMotion[] {
    const motions: CameraMotion[] = [];

    // 1. Identify all Click Events and sort them.
    const clickEvents = events
        .filter((e): e is ClickEvent => e.type === 'click')
        .sort((a, b) => a.timestamp - b.timestamp);

    if (clickEvents.length === 0) {
        return motions;
    }

    // 2. Prepare for Zoom Level Calculation (Source Space)
    // We assume 'zoomIntensity' means "Scale Factor relative to full view".
    const zoomLevel = config.zoomIntensity;

    // Derived Crop Dimensions in Source Coordinates
    const baseCropWidth = mappingConfig.inputVideoSize.width / zoomLevel;
    const baseCropHeight = mappingConfig.inputVideoSize.height / zoomLevel;

    // Default duration for a zoom "scene" around a click
    const ZOOM_HOLD_DURATION = config.zoomDuration || 2000;
    const ZOOM_TRANSITION_DURATION = config.zoomOffset ? Math.abs(config.zoomOffset) : 500;

    for (let i = 0; i < clickEvents.length; i++) {
        const evt = clickEvents[i];

        // Calculate Target Box (Centered on Click, in SOURCE COORDINATES)
        let newBox: Rect = {
            x: evt.x - baseCropWidth / 2,
            y: evt.y - baseCropHeight / 2,
            width: baseCropWidth,
            height: baseCropHeight
        };

        // Shift-Clamping (Stay within Source Video)
        if (newBox.x < 0) newBox.x = 0;
        else if (newBox.x > mappingConfig.inputVideoSize.width - newBox.width) {
            newBox.x = mappingConfig.inputVideoSize.width - newBox.width;
        }

        if (newBox.y < 0) newBox.y = 0;
        else if (newBox.y > mappingConfig.inputVideoSize.height - newBox.height) {
            newBox.y = mappingConfig.inputVideoSize.height - newBox.height;
        }

        // Timing Logic
        const timeIn = Math.max(0, evt.timestamp - ZOOM_TRANSITION_DURATION);

        // We arrive at target exactly at click time
        const arrivalTime = evt.timestamp;

        motions.push({
            id: crypto.randomUUID(),
            timeInMs: timeIn,
            timeOutMs: arrivalTime,
            target: newBox,
            easing: 'ease_in_out'
        });

        // Hold the zoom
        const nextEvt = clickEvents[i + 1];
        const holdUntil = arrivalTime + ZOOM_HOLD_DURATION;

        if (nextEvt && nextEvt.timestamp < holdUntil + ZOOM_TRANSITION_DURATION * 2) {
            // Stay zoomed
        } else {
            // Zoom OUT to full view
            const fullView: Rect = {
                x: 0, y: 0,
                width: mappingConfig.inputVideoSize.width,
                height: mappingConfig.inputVideoSize.height
            };

            const zoomOutStart = Math.max(arrivalTime + 1000, arrivalTime + 500);
            const zoomOutEnd = zoomOutStart + ZOOM_TRANSITION_DURATION;

            motions.push({
                id: crypto.randomUUID(),
                timeInMs: zoomOutStart,
                timeOutMs: zoomOutEnd,
                target: fullView,
                easing: 'ease_in_out'
            });
        }
    }

    return motions;
}

// ============================================================================
// Runtime Execution / Interpolation
// ============================================================================

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Calculates the current visible rectangle (in Source Coordinates)
 * based on the list of motions and the current time.
 */
export function getCameraStateAtTime(
    motions: CameraMotion[],
    timeMs: number,
    fullSize: Size
): Rect {
    // 0. Base Case: Full View
    const fullRect: Rect = { x: 0, y: 0, width: fullSize.width, height: fullSize.height };

    if (!motions || motions.length === 0) {
        return fullRect;
    }

    // 1. Sort motions by time just in case
    // (Ideally they are already sorted, but safety first)
    const sortedMotions = [...motions].sort((a, b) => a.timeInMs - b.timeInMs);

    // 2. Find where we are
    // Possibilities:
    // A. Before first motion -> Full View
    // B. Inside a motion (Interpolating)
    // C. Between motions (Holding previous target)
    // D. After last motion (Holding last target)

    // A. Before first
    if (timeMs < sortedMotions[0].timeInMs) {
        return fullRect;
    }

    // D. After last
    const lastMotion = sortedMotions[sortedMotions.length - 1];
    if (timeMs >= lastMotion.timeOutMs) {
        return lastMotion.target;
    }

    // Find the relevant motion segment
    for (let i = 0; i < sortedMotions.length; i++) {
        const curr = sortedMotions[i];

        // B. Inside this motion
        if (timeMs >= curr.timeInMs && timeMs < curr.timeOutMs) {
            // Determine "Start State" for this interpolation.
            // If it's the first motion, start from Full View.
            // If it's a subsequent motion, start from the previous motion's target.
            // NOTE: This assumes continuous or hold-state. If there's a gap, we hold the previous state.

            let startRect = fullRect;
            if (i > 0) {
                startRect = sortedMotions[i - 1].target;
            }

            const duration = curr.timeOutMs - curr.timeInMs;
            const elapsed = timeMs - curr.timeInMs;
            const progress = duration === 0 ? 1 : elapsed / duration;

            const easedProgress = applyEasing(progress, curr.easing);

            return interpolateRect(startRect, curr.target, easedProgress);
        }

        // C. Between this motion and the next
        if (i < sortedMotions.length - 1) {
            const next = sortedMotions[i + 1];
            if (timeMs >= curr.timeOutMs && timeMs < next.timeInMs) {
                // We are in a "Hold" state after 'curr' finished, waiting for 'next' to start.
                return curr.target;
            }
        }
    }

    return fullRect; // Should not reach here
}

function applyEasing(t: number, type: CameraMotion['easing']): number {
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
