export interface Point { x: number; y: number; }
export interface Size { width: number; height: number; }

interface BaseEvent {
    timestamp: number;
    viewportWidth: number;
    viewportHeight: number;
    scrollX: number;
    scrollY: number;
}

export interface ClickEvent extends BaseEvent {
    type: 'click';
    tagName: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MouseEvent extends BaseEvent {
    type: 'mouse';
    x: number;
    y: number;
    isDragging: boolean;
}

export interface UrlEvent extends BaseEvent {
    type: 'url';
    url: string;
}

export interface KeystrokeEvent extends BaseEvent {
    type: 'keydown';
    key: string;
    code: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
}

export type ZoomEvent = ClickEvent | MouseEvent | UrlEvent | KeystrokeEvent;

export interface ZoomConfig {
    videoSize: Size;      // Physical dimensions of the video (e.g. 3840x2160)
    zoomIntensity: number; // Global zoom setting (e.g. 1.0)
    zoomDuration: number; // Duration of validity (e.g. 2000ms)
    zoomOffset: number;   // Start time relative to event timestamp (e.g. -2000ms starts 2s before)
    padding: number;      // Padding around target (e.g. 200px)
}

export interface ZoomTarget {
    scale: number;
    normalizedCenter: Point; // x, y in range [0, 1] relative to video full size
}

export interface Transform {
    x: number;
    y: number;
    scale: number;
}

/**
 * PHASE 1: Zoom Decision
 * Determines "What" to zoom on. Pure logic.
 * Independent of the container/screen it is being displayed on.
 */
export function calculateZoomTarget(
    config: ZoomConfig,
    events: ZoomEvent[],
    currentTimestamp: number
): ZoomTarget {
    const { videoSize, zoomDuration, zoomOffset, padding } = config;

    // 1. Find Active Event
    // We look for an event where the current time falls within its active window.
    // Window: [timestamp + offset, timestamp + offset + duration]
    const activeEvent = events.find((m): m is ClickEvent => {
        // Only zoom on clicks for now
        if (m.type !== 'click') return false;

        const relativeTime = currentTimestamp - m.timestamp;
        // e.g. if Offset is -2000, Duration 2000.
        // We want active if relativeTime is between -2000 and 0.
        return relativeTime >= zoomOffset && relativeTime < (zoomOffset + zoomDuration);
    });

    if (!activeEvent) {
        return {
            scale: config.zoomIntensity,
            normalizedCenter: { x: 0.5, y: 0.5 }
        };
    }

    // 2. Calculate Target Dimensions (in CSS pixels)
    const targetWidth = activeEvent.width + padding;
    const targetHeight = activeEvent.height + padding;

    // 3. Calculate Scale
    // We want the Target (CSS pixels) to fill the Viewport (CSS pixels)
    const scaleX = activeEvent.viewportWidth / targetWidth;
    const scaleY = activeEvent.viewportHeight / targetHeight;
    const zoomScale = Math.min(Math.max(Math.min(scaleX, scaleY), 1.2), 3);

    // 4. Calculate Center in Source Video Space
    // Account for High DPI (Video Resolution vs CSS Viewport)
    const sourceScaleX = videoSize.width / activeEvent.viewportWidth;
    const sourceScaleY = videoSize.height / activeEvent.viewportHeight;

    // Center in CSS Space
    const eventViewportX = activeEvent.x - activeEvent.scrollX;
    const eventViewportY = activeEvent.y - activeEvent.scrollY;

    // We clamp the event center logic to the viewport just in case negative scroll puts it outside?
    // Not strictly needed if data is good, but let's stick to raw.

    const eventCenterX_CSS = eventViewportX + activeEvent.width / 2;
    const eventCenterY_CSS = eventViewportY + activeEvent.height / 2;

    // Center in Video Source Space
    const centerX_Source = eventCenterX_CSS * sourceScaleX;
    const centerY_Source = eventCenterY_CSS * sourceScaleY;

    // Normalize (0 to 1)
    const normalizedX = centerX_Source / videoSize.width;
    const normalizedY = centerY_Source / videoSize.height;

    return {
        scale: zoomScale,
        normalizedCenter: { x: normalizedX, y: normalizedY }
    };
}

/**
 * PHASE 2: Zoom Projection
 * Determines "How" to transform the container to show the target.
 * Dependent on Container Size and Object Fit.
 */
export function resolveZoomTransform(
    target: ZoomTarget,
    containerSize: Size,
    videoSize: Size
): Transform {
    const { scale, normalizedCenter } = target;

    // 1. Calculate Video Element Position inside Container
    // Calculate aspect ratio fit (assuming object-contain equivalent)
    const fitRatio = Math.min(containerSize.width / videoSize.width, containerSize.height / videoSize.height);

    const renderedW = videoSize.width * fitRatio;
    const renderedH = videoSize.height * fitRatio;

    // Calculate Offsets (Letterboxing)
    const offsetX = (containerSize.width - renderedW) / 2;
    const offsetY = (containerSize.height - renderedH) / 2;

    // 2. Project Target from Normalized Space to Container Space
    // Where is the center point currently sitting in the container?
    const currentCenterX = offsetX + (normalizedCenter.x * renderedW);
    const currentCenterY = offsetY + (normalizedCenter.y * renderedH);

    // 3. Calculate Ideal XY Translation to center that point
    // We want: currentCenter * scale + translate = containerCenter
    let targetX = (containerSize.width / 2) - (currentCenterX * scale);
    let targetY = (containerSize.height / 2) - (currentCenterY * scale);

    // 4. Clamping
    // Prevent black bars by clamping the edge of the visual content to the container edge.
    // Visual Content Dimensions when scaled:
    const visualW = renderedW * scale;
    const visualH = renderedH * scale;

    // Visual Origin in Container Space (before translation) matches offsetX/Y * scale? 
    // No, Visual Origin relative to the container 0,0 AFTER expansion is:
    // We effectively apply the scale around the transform origin (0,0).
    // Our CSS is: transform: translate(x, y) scale(s); transform-origin: 0 0;

    // So the Visual Left Edge is at: `targetX + (offsetX * scale)`
    // The Visual Right Edge is at: `targetX + (offsetX * scale) + visualW`

    const scaledOffsetX = offsetX * scale;
    const scaledOffsetY = offsetY * scale;

    // X Clamping
    if (visualW > containerSize.width) {
        // Left Edge Constraint: visualLeft <= 0  => targetX + scaledOffsetX <= 0 => targetX <= -scaledOffsetX
        const maxX = -scaledOffsetX;

        // Right Edge Constraint: visualRight >= containerWidth
        // targetX + scaledOffsetX + visualW >= containerWidth => targetX >= containerWidth - visualW - scaledOffsetX
        const minX = containerSize.width - visualW - scaledOffsetX;

        targetX = Math.min(Math.max(targetX, minX), maxX);
    } else {
        // Center if smaller
        targetX = (containerSize.width - visualW) / 2 - scaledOffsetX; // This purely centers the video rect
    }

    // Y Clamping
    if (visualH > containerSize.height) {
        const maxY = -scaledOffsetY;
        const minY = containerSize.height - visualH - scaledOffsetY;
        targetY = Math.min(Math.max(targetY, minY), maxY);
    } else {
        targetY = (containerSize.height - visualH) / 2 - scaledOffsetY;
    }

    return { x: targetX, y: targetY, scale };
}
