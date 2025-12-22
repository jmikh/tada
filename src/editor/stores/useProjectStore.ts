import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Project, ID, Recording, OutputWindow } from '../../core/types';
import { ProjectImpl } from '../../core/project/Project';

interface ProjectState {
    project: Project;

    // Actions
    loadProject: (project: Project) => void;

    // Timeline Actions
    updateRecording: (updates: Partial<Recording>) => void;
    updateTimeline: (updates: Partial<import('../../core/types').Timeline>) => void;
    addOutputWindow: (window: OutputWindow) => void;
    updateOutputWindow: (id: ID, updates: Partial<OutputWindow>) => void;
    removeOutputWindow: (id: ID) => void;
    updateSource: (sourceId: ID, updates: Partial<import('../../core/types').Source>) => void;
}

export const useProjectStore = create<ProjectState>()(
    persist(
        (set) => ({
            // Initialize with a default empty project
            project: ProjectImpl.create('Untitled Project'),

            loadProject: (project) => set({ project }),

            updateRecording: (updates) => set((state) => ({
                project: {
                    ...state.project,
                    timeline: {
                        ...state.project.timeline,
                        recording: {
                            ...state.project.timeline.recording,
                            ...updates
                        }
                    },
                    updatedAt: new Date()
                }
            })),

            updateTimeline: (updates: Partial<import('../../core/types').Timeline>) => set((state) => ({
                project: {
                    ...state.project,
                    timeline: {
                        ...state.project.timeline,
                        ...updates
                    },
                    updatedAt: new Date()
                }
            })),

            addOutputWindow: (window) => set((state) => ({
                project: {
                    ...state.project,
                    timeline: {
                        ...state.project.timeline,
                        outputWindows: [...state.project.timeline.outputWindows, window].sort((a, b) => a.startMs - b.startMs)
                    },
                    updatedAt: new Date()
                }
            })),

            updateOutputWindow: (id, updates) => set((state) => ({
                project: {
                    ...state.project,
                    timeline: {
                        ...state.project.timeline,
                        outputWindows: state.project.timeline.outputWindows
                            .map(w => w.id === id ? { ...w, ...updates } : w)
                            .sort((a, b) => a.startMs - b.startMs)
                    },
                    updatedAt: new Date()
                }
            })),

            removeOutputWindow: (id) => set((state) => ({
                project: {
                    ...state.project,
                    timeline: {
                        ...state.project.timeline,
                        outputWindows: state.project.timeline.outputWindows.filter(w => w.id !== id)
                    },
                    updatedAt: new Date()
                }
            })),

            updateSource: (sourceId, updates) => set((state) => ({
                project: ProjectImpl.updateSource(state.project, sourceId, updates)
            })),
        }),
        {
            name: 'recordo-project-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({ project: state.project }),
            onRehydrateStorage: () => (state) => {
                if (state && state.project) {
                    // Migration: If background is missing
                    if (!state.project.background) {
                        state.project.background = {
                            type: 'solid',
                            color: '#1e1e1e'
                        };
                    }
                    // Migration: If recording is missing (legacy state), reset project
                    if (!state.project.timeline.recording) {
                        console.warn('Refactor Update: Resetting legacy project state.');
                        state.project = ProjectImpl.create('New Project');
                    }
                }
            }
        }
    )
);

// --- Selectors ---

export const useProjectData = () => useProjectStore(s => s.project);
export const useProjectTimeline = () => useProjectStore(s => s.project.timeline);
export const useProjectSources = () => useProjectStore(s => s.project.sources);
export const useRecording = () => useProjectStore(s => s.project.timeline.recording);
