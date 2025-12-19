import { useState } from 'react';
import { type UserEvent } from '../core/types';

interface EventInspectorProps {
    metadata: UserEvent[];
}

export function EventInspector({ metadata }: EventInspectorProps) {
    const [hideIdleMouse, setHideIdleMouse] = useState(false);

    const filteredEvents = metadata.filter(m => {
        if (hideIdleMouse && m.type === 'mouse') {
            return false; // Or keep generic logic if needed, but 'isDragging' is gone
        }
        return true;
    });

    return (
        <div className="flex-1 flex flex-col overflow-hidden border-b border-[#333]">
            <div className="p-2 bg-[#333] text-white flex justify-between items-center">
                <span className="font-bold">Event Inspector ({metadata.length})</span>
                <label className="flex items-center gap-1 text-[10px] font-normal cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={hideIdleMouse}
                        onChange={e => setHideIdleMouse(e.target.checked)}
                        className="rounded bg-gray-700 border-gray-600"
                    />
                    Hide Idle Mouse
                </label>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-2">
                {filteredEvents.length === 0 && <div className="text-gray-500 italic p-2">No events to display.</div>}

                {filteredEvents.map((m: any, i) => (
                    <div key={i} className="bg-[#1e1e1e] p-2 rounded border border-[#333] hover:border-blue-500 cursor-pointer transition-colors" id={`event-card-${i}`}>
                        <div className="flex justify-between text-white font-mono mb-1 items-center">
                            <div className="flex gap-2 items-center">
                                <span className={`text-[10px] px-1 rounded ${m.type === 'click' ? 'bg-blue-900 text-blue-200' :
                                    m.type === 'mousedown' ? 'bg-yellow-900 text-yellow-200' :
                                        m.type === 'mouseup' ? 'bg-yellow-900 text-yellow-200' :
                                            m.type === 'mouse' ? 'bg-green-900 text-green-200' :
                                                m.type === 'keydown' ? 'bg-purple-900 text-purple-200' :
                                                    'bg-gray-700 text-gray-200'
                                    }`}>{m.type || 'click'}</span>
                                <span className="font-bold text-blue-400">
                                    {m.type === 'click' ? m.tagName :
                                        m.type === 'keydown' ? (m.key === ' ' ? 'Space' : m.key) :
                                            m.type === 'mousedown' ? 'Down' :
                                                m.type === 'mouseup' ? 'Up' :
                                                    m.type === 'url' ? 'Nav' :
                                                        `#${i}`}
                                </span>
                            </div>
                            <span className="text-gray-500">{new Date(m.timestamp).toLocaleTimeString().split(' ')[0]}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-gray-400">
                            {(!m.type || m.type === 'click' || m.type === 'mousedown' || m.type === 'mouseup') && (
                                <>
                                    <div>X: <span className="text-gray-300">{Math.round(m.x)}</span></div>
                                    <div>Y: <span className="text-gray-300">{Math.round(m.y)}</span></div>
                                    {m.width && <div>W: <span className="text-gray-300">{Math.round(m.width)}</span></div>}
                                    {m.height && <div>H: <span className="text-gray-300">{Math.round(m.height)}</span></div>}
                                </>
                            )}
                            {m.type === 'mouse' && (
                                <>
                                    <div>X: <span className="text-gray-300">{Math.round(m.x)}</span></div>
                                    <div>Y: <span className="text-gray-300">{Math.round(m.y)}</span></div>
                                </>
                            )}
                            {m.type === 'keydown' && (
                                <>
                                    <div>Key: <span className="text-white">{m.key}</span></div>
                                    <div>Code: <span className="text-gray-300">{m.code}</span></div>
                                    <div className="col-span-2">
                                        {m.ctrlKey && <span className="mr-1 bg-gray-700 px-1 rounded">Ctrl</span>}
                                        {m.metaKey && <span className="mr-1 bg-gray-700 px-1 rounded">Cmd</span>}
                                        {m.shiftKey && <span className="mr-1 bg-gray-700 px-1 rounded">Shift</span>}
                                        {m.altKey && <span className="mr-1 bg-gray-700 px-1 rounded">Alt</span>}
                                    </div>
                                </>
                            )}
                            {m.type === 'url' && (
                                <div className="col-span-2 truncate" title={m.url}>
                                    URL: <span className="text-gray-300">{m.url}</span>
                                </div>
                            )}

                            <div className="col-span-2 mt-1 pt-1 border-t border-[#333]">Time: <span className="text-gray-300">{m.timestamp}</span></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
