import type { UserEvents, Project, ID, TimeMs } from '../../core/types';
import { ViewMapper } from '../../core/effects/viewMapper';
import { paintMouseClicks } from './mouseClickPainter';
import { drawDragEffects } from './mouseDragPainter';
import { mapTimelineToOutputTime } from '../../core/effects/timeMapper';
import { getViewportStateAtTime } from '../../core/effects/viewportMotion';

/**
 * Draws the screen recording frame.
 * Encapsulates logic for viewport calculation and event lookup.
 */
export function drawScreen(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    project: Project,
    userEventsCache: Record<ID, UserEvents>,
    currentTimeMs: TimeMs
) {
    const { timeline, sources, outputSettings, background } = project;
    const { recording, outputWindows } = timeline;

    // 1. Resolve Data
    const screenSource = sources[recording.screenSourceId];
    if (!screenSource) return;

    // 2. Calculate Times
    // Source Time: time relative to the video file
    const sourceTimeMs = currentTimeMs - recording.timelineOffsetMs;
    // Output Time: time relative to the gapless output video
    const outputTimeMs = mapTimelineToOutputTime(currentTimeMs, outputWindows);

    // 3. Resolve Viewport
    const viewportMotions = recording.viewportMotions || [];
    const effectiveViewport = getViewportStateAtTime(
        viewportMotions,
        outputTimeMs, // Use Output Time for Viewport motion (smoothness)
        outputSettings.size,
        outputWindows,
        recording.timelineOffsetMs
    );

    // Use video dimensions if available, otherwise source metadata
    // Note: Video dimensions might be 0 if not loaded, fallback to metadata size
    const inputSize = video.videoWidth && video.videoHeight
        ? { width: video.videoWidth, height: video.videoHeight }
        : screenSource.size;

    if (!inputSize || inputSize.width === 0) return;

    // 4. Resolve View Mapping
    const viewMapper = new ViewMapper(inputSize, outputSettings.size, background.padding ?? 0.1);

    // 5. Draw Video
    const renderRects = viewMapper.resolveRenderRects(effectiveViewport);
    if (renderRects) {
        ctx.drawImage(
            video,
            renderRects.sourceRect.x, renderRects.sourceRect.y, renderRects.sourceRect.width, renderRects.sourceRect.height,
            renderRects.destRect.x, renderRects.destRect.y, renderRects.destRect.width, renderRects.destRect.height
        );
    }

    // 6. Draw Mouse Effects Overlay
    const activeEvents = userEventsCache[recording.screenSourceId];
    if (activeEvents) {
        // These painters use Source Time because events are recorded in Source Time
        if (activeEvents.mouseClicks) {
            paintMouseClicks(ctx, activeEvents.mouseClicks, sourceTimeMs, effectiveViewport, viewMapper);
        }
        if (activeEvents.drags) {
            drawDragEffects(ctx, activeEvents.drags, sourceTimeMs, effectiveViewport, viewMapper);
        }
    }
}
