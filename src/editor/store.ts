import { create } from 'zustand';
import type { UserEvent } from '../core/types';

interface EditorState {
    videoUrl: string | null;
    metadata: UserEvent[];
    recordingStartTime: number;
    isExporting: boolean;
    zoomIntensity: number;
    paddingPercentage: number;
    setVideoUrl: (url: string | null) => void;
    setMetadata: (metadata: UserEvent[]) => void;
    addMetadataItem: (item: UserEvent) => void;
    removeMetadataItem: (index: number) => void;
    setRecordingStartTime: (time: number) => void;
    setIsExporting: (isExporting: boolean) => void;
    setZoomIntensity: (intensity: number) => void;
    setPaddingPercentage: (percentage: number) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
    videoUrl: null,
    metadata: [],
    recordingStartTime: 0,
    isExporting: false,
    zoomIntensity: 2.0,
    paddingPercentage: 0.05,
    setVideoUrl: (url) => set({ videoUrl: url }),
    setMetadata: (metadata) => set({ metadata }),
    addMetadataItem: (item) => set((state) => ({
        metadata: [...state.metadata, item].sort((a, b) => a.timestamp - b.timestamp)
    })),
    removeMetadataItem: (index) => set((state) => ({
        metadata: state.metadata.filter((_, i) => i !== index)
    })),
    setRecordingStartTime: (time) => set({ recordingStartTime: time }),
    setIsExporting: (isExporting) => set({ isExporting }),
    setZoomIntensity: (intensity) => set({ zoomIntensity: intensity }),
    setPaddingPercentage: (percentage) => set({ paddingPercentage: percentage }),
}));
