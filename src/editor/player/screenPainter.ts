
import type { Size } from '../../core/types';
import type { RenderState } from '../../core/project/Project';
import { ViewTransform } from '../../core/effects/viewTransform';
import { getViewportStateAtTime } from '../../core/effects/viewportMotion';
import { drawMouseEffects } from './mousePainter';

/**
 * Draws the screen recording frame, applying viewport transformations and mouse effects.
 */
export function drawScreen(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    renderState: RenderState,
    outputSize: Size
) {
    const { screenSource, recording, sourceTimeMs } = renderState;
    if (!screenSource) return;

    // Use video dimensions if available, otherwise source metadata
    const inputSize = video.videoWidth && video.videoHeight
        ? { width: video.videoWidth, height: video.videoHeight }
        : screenSource.size;

    if (!inputSize) return;

    const paddingPercentage = 0; // Configurable?

    // 1. Calculate Viewport (Source Space)
    const config = new ViewTransform(inputSize, outputSize, paddingPercentage);
    const viewportMotions = recording.viewportMotions || [];

    // Calculate the effective viewport at the current playback time
    const effectiveViewport = getViewportStateAtTime(viewportMotions, sourceTimeMs, outputSize);

    // 2. Resolve render rectangles (Source -> Dest)
    const renderRects = config.resolveRenderRects(effectiveViewport);

    if (renderRects) {
        ctx.drawImage(
            video,
            renderRects.sourceRect.x, renderRects.sourceRect.y, renderRects.sourceRect.width, renderRects.sourceRect.height,
            renderRects.destRect.x, renderRects.destRect.y, renderRects.destRect.width, renderRects.destRect.height
        );
    }

    // 3. Draw Mouse Effects Overlay
    if (recording.clickEvents || recording.dragEvents) {
        drawMouseEffects(ctx, recording, sourceTimeMs, effectiveViewport, config);
    }
}
