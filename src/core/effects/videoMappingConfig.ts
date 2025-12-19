import type { Size, Point } from '../types';

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export class VideoMappingConfig {
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

    projectInputToOutput(point: Point): Point {
        const { x, y, scale } = this.projectedBox;
        return {
            x: x + point.x / scale,
            y: y + point.y / scale
        };
    }

    projectInputToOutputRect(rect: Box): Box {
        const { x, y, scale } = this.projectedBox;
        return {
            x: x + rect.x / scale,
            y: y + rect.y / scale,
            width: rect.width / scale,
            height: rect.height / scale
        };
    }
}
