import { useRef, useEffect } from 'react';
import { ViewTransform } from '../../core/effects/viewTransform';
import { getViewportStateAtTime } from '../../core/effects/viewportMotion';
import { drawMouseEffects } from './mousePainter';
import { drawBackground } from './backgroundPainter';
import { drawWebcam } from './webcamPainter';
import { useProjectStore, useProjectData } from '../stores/useProjectStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { ProjectImpl } from '../../core/project/Project';


export const PlayerCanvas = () => {
    const project = useProjectData();
    const updateSource = useProjectStore(s => s.updateSource);

    // Derived State
    const outputVideoSize = project?.outputSettings?.size || { width: 1920, height: 1080 };
    const sources = project?.sources || {};

    const internalVideoRefs = useRef<{ [sourceId: string]: HTMLVideoElement }>({});
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);

    // Background Image Ref
    const bgRef = useRef<HTMLImageElement>(null);

    // Single Effect to manage the Loop for the lifetime of the component
    useEffect(() => {
        const tick = (time: number) => {
            const pbState = usePlaybackStore.getState();

            if (pbState.isPlaying) {
                if (lastTimeRef.current === 0) lastTimeRef.current = time;
                const delta = time - lastTimeRef.current;

                // Cap delta to prevent huge jumps (e.g. 100ms)
                const safeDelta = Math.min(delta, 100);

                if (safeDelta > 0) {
                    let nextTime = pbState.currentTimeMs + safeDelta;

                    // GAP SKIPPING LOGIC
                    const project = useProjectStore.getState().project;
                    const windows = project.timeline.outputWindows; // Assumed sorted

                    // Check if inside any window
                    // TODO [Optimization]: could keep track of current window index, but linear scan is fine for small N
                    const activeWindow = windows.find(w => nextTime >= w.startMs && nextTime < w.endMs);

                    if (!activeWindow) {
                        // We are in a gap or at the end
                        const nextWin = windows.find(w => w.startMs > nextTime);
                        if (nextWin) {
                            // Jump to next window
                            nextTime = nextWin.startMs;
                        } else {
                            // End of timeline
                            pbState.setIsPlaying(false);
                            // Clamp to end
                            const lastWin = windows[windows.length - 1];
                            nextTime = lastWin ? lastWin.endMs : 0;
                        }
                    }

                    pbState.setCurrentTime(nextTime);
                }
                lastTimeRef.current = time;
            } else {
                lastTimeRef.current = 0;
            }

            renderPipeline();
            animationFrameRef.current = requestAnimationFrame(tick);
        };

        animationFrameRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, []);

    // Render Pipeline
    const renderPipeline = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const state = useProjectStore.getState();
        const playback = usePlaybackStore.getState();

        const project = state.project;
        const currentTimeMs = playback.currentTimeMs;
        const outputSize = project.outputSettings.size;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw Background
        drawBackground(ctx, project.background, canvas, bgRef.current);

        // Resolve Render State
        let renderState;
        try {
            renderState = ProjectImpl.getRenderState(project, currentTimeMs);
        } catch { return; }

        if (!renderState.isActive || !renderState.screenSource) {
            // Not in an output window or no source, showing background only
            return;
        }

        const source = renderState.screenSource;
        const sourceId = source.id;
        const video = internalVideoRefs.current[sourceId];
        const recording = renderState.recording;

        const paddingPercentage = 0;

        if (video) {
            // A. Sync Video Time
            const desiredTimeS = renderState.sourceTimeMs / 1000;

            // Allow playing past duration? Source logic usually clamps, but let's trust sourceTimeMs for now or clamp.
            // HTMLVideoElement loops if loop is true, but here we control it.

            if (playback.isPlaying) {
                if (video.paused) video.play().catch(() => { });
                // We assume 1x speed for now as 'speed' was on Clip.
                // If we want variable speed, we need it in Recording or OutputWindow?
                // For now 1x.
                if (Math.abs(video.currentTime - desiredTimeS) > 0.2) video.currentTime = desiredTimeS;
            } else {
                if (!video.paused) video.pause();
                if (Math.abs(video.currentTime - desiredTimeS) > 0.001) video.currentTime = desiredTimeS;
            }

            // B. Draw
            const inputSize = video.videoWidth && video.videoHeight
                ? { width: video.videoWidth, height: video.videoHeight }
                : source.size;

            if (inputSize) {
                // Viewport Motion (Source Space calculation)
                const config = new ViewTransform(inputSize, outputSize, paddingPercentage);
                const viewportMotions = recording.viewportMotions || [];

                // getViewportStateAtTime expects sourceTimeMs now
                const effectiveViewport = getViewportStateAtTime(viewportMotions, renderState.sourceTimeMs, outputSize);

                const renderRects = config.resolveRenderRects(effectiveViewport);

                if (renderRects) {
                    ctx.drawImage(
                        video,
                        renderRects.sourceRect.x, renderRects.sourceRect.y, renderRects.sourceRect.width, renderRects.sourceRect.height,
                        renderRects.destRect.x, renderRects.destRect.y, renderRects.destRect.width, renderRects.destRect.height
                    );
                }

                // Mouse Effects
                if (recording.clickEvents || recording.dragEvents) {
                    drawMouseEffects(ctx, recording, renderState.sourceTimeMs, effectiveViewport, config);
                }
            }
        }

        // Draw Webcam (PIP)
        if (renderState.cameraSource && internalVideoRefs.current[renderState.cameraSource.id]) {
            const camVideo = internalVideoRefs.current[renderState.cameraSource.id];
            const camSource = renderState.cameraSource;
            // Sync Camera video
            // Assumption: Camera is always in sync with Screen Source (recorded together)
            // So we use the same sourceTimeMs.
            const desiredTimeS = renderState.sourceTimeMs / 1000;
            if (playback.isPlaying) {
                if (camVideo.paused) camVideo.play().catch(() => { });
                if (Math.abs(camVideo.currentTime - desiredTimeS) > 0.2) camVideo.currentTime = desiredTimeS;
            } else {
                if (!camVideo.paused) camVideo.pause();
                if (Math.abs(camVideo.currentTime - desiredTimeS) > 0.001) camVideo.currentTime = desiredTimeS;
            }

            const inputSize = camVideo.videoWidth && camVideo.videoHeight
                ? { width: camVideo.videoWidth, height: camVideo.videoHeight }
                : camSource.size;

            if (inputSize) {
                drawWebcam(ctx, camVideo, outputSize, inputSize);
            }
        }
    };

    // Canvas Sizing
    useEffect(() => {
        if (canvasRef.current && outputVideoSize) {
            canvasRef.current.width = outputVideoSize.width;
            canvasRef.current.height = outputVideoSize.height;
            renderPipeline();
        }
    }, [outputVideoSize.width, outputVideoSize.height]);


    // Handle Metadata Load
    const handleMetadata = (sourceId: string, e: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = e.currentTarget;
        console.log(`[PlayerCanvas] Source Loaded: ${sourceId} (${video.videoWidth}x${video.videoHeight})`);

        updateSource(sourceId, {
            size: { width: video.videoWidth, height: video.videoHeight },
            durationMs: video.duration * 1000,
        });

        renderPipeline();
    };

    return (
        <>
            <div style={{ display: 'none' }}>
                {project.background?.type === 'image' && project.background.imageUrl && (
                    <img
                        ref={bgRef}
                        src={project.background.imageUrl}
                        alt="Background Asset"
                        onLoad={() => renderPipeline()}
                    />
                )}

                {Object.values(sources).map((source) => (
                    source.url ? (
                        <video
                            key={source.id}
                            ref={el => {
                                if (el) internalVideoRefs.current[source.id] = el;
                                else delete internalVideoRefs.current[source.id];
                            }}
                            src={source.url}
                            onLoadedMetadata={(e) => handleMetadata(source.id, e)}
                            muted={false}
                            playsInline
                            crossOrigin="anonymous"
                        />
                    ) : null
                ))}
            </div>

            <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{
                    backgroundColor: '#000',
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                }}
            />
        </>
    );
};

PlayerCanvas.displayName = 'PlayerCanvas';
