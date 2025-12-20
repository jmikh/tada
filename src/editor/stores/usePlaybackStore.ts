import { create } from 'zustand';
import type { TimeMs } from '../../core/types';

interface PlaybackState {
    isPlaying: boolean;
    currentTimeMs: TimeMs;

    setIsPlaying: (playing: boolean) => void;
    setCurrentTime: (timeMs: TimeMs) => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
    isPlaying: false,
    currentTimeMs: 0,

    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setCurrentTime: (currentTimeMs) => set({ currentTimeMs }),
}));
