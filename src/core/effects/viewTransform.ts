import type { Size, Point } from '../types';

/**
 * Represents a rectangle with position and dimensions.
 * Use consistent with Rect type in other files.
 */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export class ViewTransform {
    inputVideoSize: Size;
    outputVideoSize: Size;
    paddingPercentage: number;

    public readonly projectedBox: { x: number; y: number; width: number; height: number; scale: number; };

    constructor(
        inputVideoSize: Size,
        outputVideoSize: Size,
        paddingPercentage: number
    ) {
        this.outputVideoSize = outputVideoSize;
        this.inputVideoSize = inputVideoSize;
        this.paddingPercentage = paddingPercentage;

        const scale = Math.max(
            this.inputVideoSize.width / (this.outputVideoSize.width * (1 - 2 * this.paddingPercentage)),
            this.inputVideoSize.height / (this.outputVideoSize.height * (1 - 2 * this.paddingPercentage))
        );

        const projectedWidth = this.inputVideoSize.width / scale;
        const projectedHeight = this.inputVideoSize.height / scale;

        const x = (this.outputVideoSize.width - projectedWidth) / 2;
        const y = (this.outputVideoSize.height - projectedHeight) / 2;

        this.projectedBox = { x, y, width: projectedWidth, height: projectedHeight, scale };
    }

    /**
     * Projects a point from the 'Source' coordinate system (the video content) 
     * to the 'Destination' coordinate system (the canvas/screen).
     * 
     * This considers:
     * 1. The visible crop of the source (Zoom/Pan via visibleSourceRect).
     * 2. The layout of that crop on the destination canvas (Letterboxing/Padding via this.projectedBox).
     * 
     * @param point The point in the source video coordinates (e.g., [100, 100]).
     * @param visibleSourceRect The regions of the source video currently visible (the Camera Frame).
     *                          If fully zoomed out, this is { x:0, y:0, w:VideoWidth, h:VideoHeight }.
     */
    project(point: Point, visibleSourceRect: Rect): Point {
        // 1. Normalize Point in Source Rect (0.0 to 1.0)
        //    (point.x - sourceRect.x) gives offset from Left Edge of Camera
        const normalizedX = (point.x - visibleSourceRect.x) / visibleSourceRect.width;
        const normalizedY = (point.y - visibleSourceRect.y) / visibleSourceRect.height;

        // 2. Map that percentage to the Destination Rect (projectedBox)
        const destRect = this.projectedBox;
        return {
            x: destRect.x + normalizedX * destRect.width,
            y: destRect.y + normalizedY * destRect.height
        };
    }

    /**
     * Helper to map a full rectangle.
     */
    projectRect(rect: Rect, visibleSourceRect: Rect): Rect {
        const p1 = this.project({ x: rect.x, y: rect.y }, visibleSourceRect);
        const p2 = this.project({ x: rect.x + rect.width, y: rect.y + rect.height }, visibleSourceRect);

        return {
            x: p1.x,
            y: p1.y,
            width: p2.x - p1.x,
            height: p2.y - p1.y
        };
    }
}
