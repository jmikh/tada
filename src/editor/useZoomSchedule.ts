import { useMemo } from 'react';
import { useEditorStore } from './store';
import { VideoMappingConfig } from '../lib/zoom/videoMappingConfig';
import { calculateZoomSchedule, type ZoomEvent } from '../lib/zoom';

export function useZoomSchedule() {
    const {
        metadata,
        zoomIntensity,
        inputVideoSize,
        outputVideoSize,
        paddingPercentage
    } = useEditorStore();

    const schedule = useMemo(() => {
        if (!metadata || metadata.length === 0) return [];
        if (!inputVideoSize) return [];

        const events = metadata as unknown as ZoomEvent[];
        const mappingConfig = new VideoMappingConfig(
            inputVideoSize,
            outputVideoSize,
            paddingPercentage
        );

        const config = {
            zoomIntensity: zoomIntensity,
            zoomDuration: 0,
            zoomOffset: 2000
        };

        return calculateZoomSchedule(config, mappingConfig, events);
    }, [metadata, zoomIntensity, inputVideoSize, outputVideoSize, paddingPercentage]);

    return schedule;
}
