export interface Point { x: number; y: number; }
export interface Size { width: number; height: number; }

export interface BaseEvent {
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
}

export interface MouseEvent extends BaseEvent {
    type: 'mouse';
    x: number;
    y: number;
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
    isInput?: boolean;
    isModifier?: boolean;
    isSpecial?: boolean;
    tagName?: string;
}

export interface MouseDownEvent extends BaseEvent {
    type: 'mousedown';
    x: number;
    y: number;
}

export interface MouseUpEvent extends BaseEvent {
    type: 'mouseup';
    x: number;
    y: number;
}

export interface DomMutationEvent extends BaseEvent {
    type: 'mutation';
    x: number;
    y: number;
    width: number;
    height: number;
    tagName?: string;
}

export type ZoomEvent = ClickEvent | MouseEvent | UrlEvent | KeystrokeEvent | MouseDownEvent | MouseUpEvent | DomMutationEvent;



export interface ZoomConfig {
    zoomIntensity: number; // Global zoom setting (e.g. 1.0)
    zoomDuration: number; // Duration of validity (e.g. 2000ms)
    zoomOffset: number;   // Start time relative to event timestamp (e.g. -2000ms starts 2s before)
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

export interface ZoomKeyframe {
    timestamp: number;
    zoomBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
