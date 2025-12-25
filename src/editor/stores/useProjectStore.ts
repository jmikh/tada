import { create, useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { temporal, type TemporalState } from 'zundo';
import type { Project, ID, Recording, OutputWindow, UserEvents, ViewportMotion } from '../../core/types';
import { ProjectImpl } from '../../core/project/Project';
import { ProjectLibrary } from '../../core/project/ProjectLibrary';
import { calculateZoomSchedule, ViewMapper } from '../../core/effects/viewportMotion';

interface ProjectState {
    project: Project;
    userEvents: UserEvents | null; // Single set of loaded events
    isSaving: boolean;

    // Actions
    loadProject: (project: Project) => Promise<void>;
    saveProject: () => Promise<void>;

    // Timeline Actions
    updateRecording: (updates: Partial<Recording>) => void;
    updateTimeline: (updates: Partial<import('../../core/types').Timeline>) => void;
    addOutputWindow: (window: OutputWindow) => void;
    updateOutputWindow: (id: ID, updates: Partial<OutputWindow>) => void;
    removeOutputWindow: (id: ID) => void;
    splitWindow: (windowId: ID, splitTimeMs: number) => void;

    // Zoom Actions
    updateZoomSettings: (updates: Partial<Project['zoom']>) => void;
}

// Helper to recalculate zooms synchronously
const recalculateAutoZooms = (project: Project, events: UserEvents | null): ViewportMotion[] => {
    if (!project.zoom.auto) {
        return project.timeline.recording.viewportMotions; // Return existing if auto is off (or empty?)
    }

    const screenSourceId = project.timeline.recording.screenSourceId;
    const sourceMetadata = project.sources[screenSourceId];

    if (!sourceMetadata || !events) {
        console.warn("Skipping zoom recalc: Missing source or events", screenSourceId);
        return project.timeline.recording.viewportMotions;
    }

    const viewMapper = new ViewMapper(
        sourceMetadata.size,
        project.outputSettings.size,
        project.background.padding
    );

    return calculateZoomSchedule(
        project.zoom.maxZoom,
        viewMapper,
        events,
        project.timeline.outputWindows,
        project.timeline.recording.timelineOffsetMs
    );
};

export const useProjectStore = create<ProjectState>()(
    subscribeWithSelector(
        temporal(
            (set, get) => ({
                // Initialize with a default empty project
                project: ProjectImpl.create('Untitled Project'),
                userEvents: null,
                isSaving: false,

                loadProject: async (project) => {
                    // 1. Set Project immediately
                    set({ project });

                    // 2. Fetch Events for the screen source
                    let events: UserEvents | null = null;
                    const screenSourceId = project.timeline.recording.screenSourceId;
                    const screenSource = project.sources[screenSourceId];

                    if (screenSource && screenSource.eventsUrl) {
                        try {
                            events = await ProjectLibrary.loadEvents(screenSource.eventsUrl);
                        } catch (e) {
                            console.error(`Failed to load events for source ${screenSourceId}`, e);
                            // Initialize empty if failed to avoid crashes
                            events = { mouseClicks: [], keyboardEvents: [], mousePositions: [], drags: [] };
                        }
                    }

                    // 3. Update Store
                    set({ userEvents: events });

                    // 4. Clear History so we can't undo into valid empty state or previous project
                    useProjectStore.temporal.getState().clear();
                },

                saveProject: async () => {
                    set({ isSaving: true });
                    try {
                        await ProjectLibrary.saveProject(get().project);
                    } catch (e) {
                        console.error("Failed to save project:", e);
                    } finally {
                        set({ isSaving: false });
                    }
                },

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

                updateTimeline: (updates) => set((state) => ({
                    project: {
                        ...state.project,
                        timeline: {
                            ...state.project.timeline,
                            ...updates
                        },
                        updatedAt: new Date()
                    }
                })),

                updateZoomSettings: (updates) => set((state) => {
                    const nextProject = {
                        ...state.project,
                        zoom: { ...state.project.zoom, ...updates },
                        updatedAt: new Date()
                    };

                    // Recalculate Zooms if settings changed
                    const nextMotions = recalculateAutoZooms(nextProject, state.userEvents);

                    return {
                        project: {
                            ...nextProject,
                            timeline: {
                                ...nextProject.timeline,
                                recording: {
                                    ...nextProject.timeline.recording,
                                    viewportMotions: nextMotions
                                }
                            }
                        }
                    };
                }),

                addOutputWindow: (window) => set((state) => {
                    const nextOutputWindows = [...state.project.timeline.outputWindows, window].sort((a, b) => a.startMs - b.startMs);

                    // Temporary project state to calculate zooms
                    const tempProject = {
                        ...state.project,
                        timeline: {
                            ...state.project.timeline,
                            outputWindows: nextOutputWindows
                        }
                    };
                    const nextMotions = recalculateAutoZooms(tempProject, state.userEvents);

                    return {
                        project: {
                            ...tempProject,
                            timeline: {
                                ...tempProject.timeline,
                                recording: {
                                    ...tempProject.timeline.recording,
                                    viewportMotions: nextMotions
                                }
                            },
                            updatedAt: new Date()
                        }
                    };
                }),

                updateOutputWindow: (id, updates) => set((state) => {
                    const nextOutputWindows = state.project.timeline.outputWindows
                        .map(w => w.id === id ? { ...w, ...updates } : w)
                        .sort((a, b) => a.startMs - b.startMs);

                    const tempProject = {
                        ...state.project,
                        timeline: {
                            ...state.project.timeline,
                            outputWindows: nextOutputWindows
                        }
                    };
                    const nextMotions = recalculateAutoZooms(tempProject, state.userEvents);

                    return {
                        project: {
                            ...tempProject,
                            timeline: {
                                ...tempProject.timeline,
                                recording: {
                                    ...tempProject.timeline.recording,
                                    viewportMotions: nextMotions
                                }
                            },
                            updatedAt: new Date()
                        }
                    };
                }),

                removeOutputWindow: (id) => set((state) => {
                    const nextOutputWindows = state.project.timeline.outputWindows.filter(w => w.id !== id);

                    const tempProject = {
                        ...state.project,
                        timeline: {
                            ...state.project.timeline,
                            outputWindows: nextOutputWindows
                        }
                    };
                    const nextMotions = recalculateAutoZooms(tempProject, state.userEvents);

                    return {
                        project: {
                            ...tempProject,
                            timeline: {
                                ...tempProject.timeline,
                                recording: {
                                    ...tempProject.timeline.recording,
                                    viewportMotions: nextMotions
                                }
                            },
                            updatedAt: new Date()
                        }
                    };
                }),

                splitWindow: (windowId, splitTimeMs) => set((state) => {
                    // 1. Find the window to split
                    const windowIndex = state.project.timeline.outputWindows.findIndex(w => w.id === windowId);
                    if (windowIndex === -1) return state; // No-op if not found

                    const originalWin = state.project.timeline.outputWindows[windowIndex];

                    // 2. Shrink original window
                    const shrunkWin = { ...originalWin, endMs: splitTimeMs };

                    // 3. Create new window
                    // We need a way to generate IDs safely. Using randomUUID for now.
                    const newWin: OutputWindow = {
                        id: crypto.randomUUID(),
                        startMs: splitTimeMs,
                        endMs: originalWin.endMs
                    };

                    // 4. Construct new window list
                    // We replace the original with shrunk, and append the new one.
                    // Then sort.
                    let nextOutputWindows = [...state.project.timeline.outputWindows];
                    nextOutputWindows[windowIndex] = shrunkWin;
                    nextOutputWindows.push(newWin);
                    nextOutputWindows.sort((a, b) => a.startMs - b.startMs);

                    // 5. Recalculate Zooms (Atomic!)
                    const tempProject = {
                        ...state.project,
                        timeline: {
                            ...state.project.timeline,
                            outputWindows: nextOutputWindows
                        }
                    };
                    const nextMotions = recalculateAutoZooms(tempProject, state.userEvents);

                    // 6. Return new state
                    return {
                        project: {
                            ...tempProject,
                            timeline: {
                                ...tempProject.timeline,
                                recording: {
                                    ...tempProject.timeline.recording,
                                    viewportMotions: nextMotions
                                }
                            },
                            updatedAt: new Date()
                        }
                    };
                }),
            }),
            {
                // Zundo Configuration
                partialize: (state) => ({
                    project: state.project
                }),
                equality: (a, b) => JSON.stringify(a) === JSON.stringify(b), // Deep compare to avoid unnecessary history
                limit: 50 // meaningful limit
            }
        )
    )
);

// --- Auto-Save Subscription ---
let saveTimeout: any = null;
useProjectStore.subscribe(
    (state) => state.project,
    (project) => {
        // Debounce save (e.g., 2 seconds)
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            console.log('[AutoSave] Saving project...');
            ProjectLibrary.saveProject(project).catch(console.error);
        }, 2000);
    }
);

// --- Selectors ---

export const useProjectData = () => useProjectStore(s => s.project);
export const useProjectTimeline = () => useProjectStore(s => s.project.timeline);
export const useProjectSources = () => useProjectStore(s => s.project.sources);
export const useRecording = () => useProjectStore(s => s.project.timeline.recording);
export const useProjectHistory = <T,>(
    selector: (state: TemporalState<{ project: Project }>) => T
) => useStore(useProjectStore.temporal, selector);
