import type { UserEvent, MouseEffect } from '../types';

// ============================================================================
// GENERATION LOGIC
// ============================================================================

const CLICK_DISPLAY_DURATION = 500; // ms

export function generateMouseEffects(
    events: UserEvent[],
    totalDurationMs: number = 0 // Used for unfinished drags
): MouseEffect[] {
    const effects: MouseEffect[] = [];
    if (!events || events.length === 0) return effects;

    // 1. Sort Events
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    // 2. Single Pass Processing
    let activeDrag: Partial<MouseEffect> | null = null;

    for (const evt of sortedEvents) {
        if (evt.type === 'click') {
            effects.push({
                id: crypto.randomUUID(),
                type: 'click',
                timeInMs: evt.timestamp,
                timeOutMs: evt.timestamp + CLICK_DISPLAY_DURATION,
                start: { x: evt.x, y: evt.y }
            });
        }
        else if (evt.type === 'mousedown') {
            if (activeDrag) {
                continue;
            }
            // Start new drag
            activeDrag = {
                id: crypto.randomUUID(),
                type: 'drag',
                timeInMs: evt.timestamp,
                start: { x: evt.x, y: evt.y },
                path: [{ timestamp: evt.timestamp, x: evt.x, y: evt.y }]
            };
        }
        else if (evt.type === 'mouse') {
            // Mouse Move
            if (activeDrag && activeDrag.path) {
                activeDrag.path.push({ timestamp: evt.timestamp, x: evt.x, y: evt.y });
            }
        }
        else if (evt.type === 'mouseup') {
            // Drag End
            if (activeDrag) {
                activeDrag.timeOutMs = evt.timestamp;
                activeDrag.end = { x: evt.x, y: evt.y };
                if (activeDrag.path) {
                    activeDrag.path.push({ timestamp: evt.timestamp, x: evt.x, y: evt.y });
                }
                effects.push(activeDrag as MouseEffect);
                activeDrag = null;
            }
        }
    }

    // 3. Close open drag
    if (activeDrag) {
        activeDrag.timeOutMs = totalDurationMs;
        if (activeDrag.path && activeDrag.path.length > 0) {
            const last = activeDrag.path[activeDrag.path.length - 1];
            activeDrag.end = { x: last.x, y: last.y };
        } else {
            activeDrag.end = activeDrag.start;
        }
        effects.push(activeDrag as MouseEffect);
    }

    return effects;
}


