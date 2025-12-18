
// ==========================================
// CONFIG & SHARED
// ==========================================

export type ID = string;

// Time is always in Milliseconds
export type TimeMs = number;

// ==========================================
// PROJECT
// ==========================================

export interface Project {
    id: ID;
    name: string;
    createdAt: Date;
    updatedAt: Date;

    // Global settings
    outputSettings: OutputSettings;

    // Data
    sources: Record<ID, Source>; // Map for O(1) access
    timeline: Timeline;
}

export interface OutputSettings {
    width: number;
    height: number;
    frameRate: number;
    // We can add bitrate/etc later
}

// ==========================================
// SOURCE
// ==========================================

export interface Source {
    id: ID;
    type: 'video' | 'audio' | 'image';
    url: string;

    // Metadata
    durationMs: TimeMs; // Total duration of the source file
    width: number;
    height: number;
    fps?: number; // Only for video
    hasAudio: boolean;
}

// ==========================================
// TIMELINE
// ==========================================

export interface Timeline {
    id: ID;
    tracks: Track[];
    durationMs: TimeMs; // Total duration of the timeline (max of all tracks)
}

// ==========================================
// TRACK
// ==========================================

export interface Track {
    id: ID;
    type: 'video' | 'audio' | 'overlay';
    name: string;

    // Constraints: Ordered by timelineIn, NO OVERLAPS allowed.
    clips: Clip[];

    // Effects apply to the whole track (e.g. Zoom)
    effects: TrackEffect[];

    // State
    muted: boolean;
    locked: boolean;
    visible: boolean;
}

// ==========================================
// CLIP
// ==========================================

export interface Clip {
    id: ID;
    sourceId: ID;

    // Time Mapping
    // "Where does this clip start in the SOURCE video?"
    sourceInMs: TimeMs;
    // "Where does this clip end in the SOURCE video?"
    sourceOutMs: TimeMs;

    // "Where does this clip start in the TIMELINE?"
    timelineInMs: TimeMs;
    // timelineOutMs is derived: timelineInMs + (sourceOutMs - sourceInMs)

    // Properties
    speed: number; // 1.0 = normal

    // Linkage
    // If multiple clips share a linkGroupId, they are split/moved together.
    linkGroupId?: string;

    audioVolume: number; // 0.0 to 1.0
    audioMuted: boolean;
}

// ==========================================
// EFFECT
// ==========================================

export type EasingType = 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';

export interface TrackEffect {
    id: ID;
    type: 'zoom_pan';
    // Potential for other types: 'color_grade', 'opacity', etc.

    keyframes: Keyframe[];
}

export interface Keyframe {
    id: ID;
    // Time is in TIMELINE TIME
    timeMs: TimeMs;
    easing: EasingType;

    // Value (Structure depends on Effect Type)
    // For ZoomPan:
    value: {
        x: number;      // Center X (0-1 relative to output?) OR absolute pixels? 
        // Let's assume absolute pixels relative to OUTPUT resolution for now, 
        // OR relative to SOURCE if we are mapping?
        // User said: "zoom effects should be in timeline time"
        // But the coordinate system? 
        // Usually Zoom/Pan is "Camera Viewport".
        y: number;
        scale: number;  // 1.0 = Full fit.
    }
}
