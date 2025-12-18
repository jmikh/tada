import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useEditorStore } from './store';

interface PlayerCanvasProps {
    src: string;
    onLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
    className?: string; // For compatibility if passed, though we style internal elements
    muted?: boolean;
}

export const PlayerCanvas = forwardRef<HTMLVideoElement, PlayerCanvasProps>(({
    src,
    onLoadedMetadata,
    muted = true
}, ref) => {
    const { paddingPercentage } = useEditorStore();
    const internalVideoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number>(0);

    // Expose the internal video element to the parent
    useImperativeHandle(ref, () => internalVideoRef.current as HTMLVideoElement);

    // Metadata handler wrapper
    const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        if (onLoadedMetadata) {
            onLoadedMetadata(e);
        }
        // Initialize canvas size once metadata is loaded
        const video = e.currentTarget;
        if (canvasRef.current) {
            canvasRef.current.width = video.videoWidth;
            canvasRef.current.height = video.videoHeight;
        }
        startRenderLoop();
    };

    const startRenderLoop = () => {
        const render = () => {
            if (internalVideoRef.current && canvasRef.current) {
                const video = internalVideoRef.current;
                const ctx = canvasRef.current.getContext('2d');

                if (ctx && !video.paused && !video.ended) {
                    ctx.drawImage(video, 0, 0, canvasRef.current.width, canvasRef.current.height);
                }
            }
            animationFrameRef.current = requestAnimationFrame(render);
        };
        render(); // Start loop
    };

    useEffect(() => {
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    // Effect to handle seeking/updates when paused (to update canvas)
    useEffect(() => {
        const video = internalVideoRef.current;
        if (!video) return;

        const handleSeeked = () => {
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvasRef.current.width, canvasRef.current.height);
                }
            }
        };

        video.addEventListener('seeked', handleSeeked);
        // Also update on timeupdate just in case
        video.addEventListener('timeupdate', handleSeeked);

        return () => {
            video.removeEventListener('seeked', handleSeeked);
            video.removeEventListener('timeupdate', handleSeeked);
        };
    }, []);


    return (
        <>
            {/* Hidden Video Element - Source */}
            <video
                ref={internalVideoRef}
                src={src}
                onLoadedMetadata={handleLoadedMetadata}
                style={{ display: 'none' }}
                muted={muted}
                playsInline
            />

            {/* Canvas - Render Target */}
            <canvas
                ref={canvasRef}
                className="bg-transparent"
                style={{
                    objectFit: 'contain',
                    backgroundColor: 'transparent',
                    width: `${(1 - 2 * paddingPercentage) * 100}%`,
                    height: `${(1 - 2 * paddingPercentage) * 100}%`,
                    position: 'absolute',
                    left: `${paddingPercentage * 100}%`,
                    top: `${paddingPercentage * 100}%`
                }}
            />
        </>
    );
});

PlayerCanvas.displayName = 'PlayerCanvas';
