import React, { useState, useRef, useEffect } from 'react';
import { DB } from './db';
import { calculateZoomTarget, resolveZoomTransform, type ZoomEvent, type ZoomConfig } from '../lib/zoom';

export default function TestApp() {
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<ZoomEvent[]>([]);
    const [zoomIntensity, setZoomIntensity] = useState(1.0);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Load from DB on init
    useEffect(() => {
        const load = async () => {
            try {
                const blob = await DB.get('video-blob');
                if (blob) setVideoUrl(URL.createObjectURL(blob));

                const meta = await DB.get('metadata-json');
                if (meta) setMetadata(meta);

                const intensity = await DB.get('zoom-intensity');
                if (intensity) setZoomIntensity(intensity);
            } catch (e) {
                console.error("Failed to load test data", e);
            }
        };
        load();
    }, []);

    const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setVideoUrl(URL.createObjectURL(file));
            await DB.put('video-blob', file);
        }
    };

    const handleMetadataUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const json = JSON.parse(ev.target?.result as string);
                    setMetadata(json);
                    await DB.put('metadata-json', json);
                } catch (err) {
                    alert("Invalid JSON");
                }
            };
            reader.readAsText(file);
        }
    };

    // Zoom Loop
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const update = () => {
            const currentTime = video.currentTime * 1000;
            // In the test env, create a relative timeline from 0
            // Assuming exported metadata timestamp matches video accumulation?
            // Actually, exported metadata has absolute timestamps. 
            // We need to normalize them.
            // Let's assume the first event or the video start time aligns.
            // For now, let's just assume CurrentTime + FirstEventTime - Buffer?
            // Or simpler: We pass a "Recording Start Time" input manually?

            // Let's use the first event timestamp as a baseline approximate
            const startTime = metadata.length > 0 ? metadata[0].timestamp - 1000 : 0;
            const absTime = startTime + currentTime;

            const containerW = containerRef.current?.clientWidth || 800;
            const containerH = containerRef.current?.clientHeight || 450;
            const videoW = video.videoWidth;
            const videoH = video.videoHeight;

            if (videoW && videoH) {
                // Phase 1: Decision
                const config: ZoomConfig = {
                    videoSize: { width: videoW, height: videoH },
                    zoomIntensity: zoomIntensity,
                    zoomDuration: 2000,
                    zoomOffset: -2000,
                    padding: 200
                };

                const target = calculateZoomTarget(config, metadata, absTime);

                // Phase 2: Projection
                const t = resolveZoomTransform(
                    target,
                    { width: containerW, height: containerH },
                    { width: videoW, height: videoH }
                );

                setTransform(t);
            }

            requestAnimationFrame(update);
        };

        const id = requestAnimationFrame(update);
        return () => cancelAnimationFrame(id);
    }, [videoUrl, metadata, zoomIntensity]);

    const videoStyle: React.CSSProperties = {
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        transformOrigin: '0 0',
        transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
    };

    return (
        <div className="flex h-screen bg-slate-900 text-white">
            <div className="w-80 p-4 border-r border-slate-700 space-y-4">
                <h1 className="text-xl font-bold">Zoom Test Lab</h1>

                <div className="space-y-2">
                    <label className="block text-xs uppercase text-slate-400">1. Load Video</label>
                    <input type="file" accept="video/*" onChange={handleVideoUpload} className="text-sm w-full" />
                </div>

                <div className="space-y-2">
                    <label className="block text-xs uppercase text-slate-400">2. Load Metadata</label>
                    <input type="file" accept=".json" onChange={handleMetadataUpload} className="text-sm w-full" />
                </div>

                <div className="space-y-2">
                    <label className="block text-xs uppercase text-slate-400">Zoom Intensity: {zoomIntensity}</label>
                    <input
                        type="range" min="1" max="3" step="0.1"
                        value={zoomIntensity}
                        onChange={e => {
                            const v = parseFloat(e.target.value);
                            setZoomIntensity(v);
                            DB.put('zoom-intensity', v);
                        }}
                        className="w-full"
                    />
                </div>

                <div className="text-xs text-slate-500">
                    Metadata Events: {metadata.length}
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-black">
                <div
                    ref={containerRef}
                    className="relative shadow-2xl bg-black overflow-hidden"
                    style={{
                        width: '800px',
                        height: '450px',
                    }}
                >
                    {videoUrl && (
                        <div style={{ ...videoStyle, width: '100%', height: '100%', position: 'relative' }}>
                            <video
                                ref={videoRef}
                                src={videoUrl}
                                controls
                                className="w-full h-full object-contain"
                            />
                            {/* Markers */}
                            {metadata.map((m, i) => {
                                if (m.type !== 'click') return null;
                                return (
                                    <div
                                        key={i}
                                        className="absolute w-2 h-2 bg-yellow-400 rounded-full z-50 pointer-events-none"
                                        style={{
                                            left: m.x - m.scrollX,
                                            top: m.y - m.scrollY,
                                            transform: 'translate(-50%, -50%)'
                                        }}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
