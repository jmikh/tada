import { type ZoomKeyframe } from '../lib/zoom';

interface ZoomInspectorProps {
    schedule: ZoomKeyframe[];
    currentTime: number; // Absolute timestamp of playback
}

export function ZoomInspector({ schedule, currentTime }: ZoomInspectorProps) {
    // Find active keyframe index for highlighting
    // Last keyframe where timestamp <= currentTime
    let activeIndex = -1;
    // Iterate backwards
    for (let i = schedule.length - 1; i >= 0; i--) {
        if (currentTime >= schedule[i].timestamp) {
            activeIndex = i;
            break;
        }
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden border-b border-[#333]">
            <div className="p-2 bg-[#333] text-white flex justify-between items-center">
                <span className="font-bold">Zoom Schedule ({schedule.length})</span>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-2">
                {schedule.length === 0 && <div className="text-gray-500 italic p-2">No zoom keyframes.</div>}

                {schedule.map((k, i) => {
                    const isActive = i === activeIndex;
                    return (
                        <div
                            key={i}
                            className={`p-2 rounded border transition-colors ${isActive
                                    ? 'bg-green-900/30 border-green-500'
                                    : 'bg-[#1e1e1e] border-[#333] hover:border-gray-500'
                                }`}
                        >
                            <div className="flex justify-between text-white font-mono mb-1 items-center">
                                <span className={`text-[10px] px-1 rounded font-bold ${isActive ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-300'}`}>
                                    #{i}
                                </span>
                                <span className="text-gray-500 text-[10px]">
                                    ts: {k.timestamp}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-gray-400">
                                <div>X: <span className="text-gray-300">{Math.round(k.zoomBox.x)}</span></div>
                                <div>Y: <span className="text-gray-300">{Math.round(k.zoomBox.y)}</span></div>
                                <div>W: <span className="text-gray-300">{Math.round(k.zoomBox.width)}</span></div>
                                <div>H: <span className="text-gray-300">{Math.round(k.zoomBox.height)}</span></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
