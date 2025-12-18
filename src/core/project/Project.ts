
import { Project, ID, OutputSettings } from '../types';
import { TimelineImpl } from '../timeline/Timeline';

export class ProjectImpl {
    static create(name: string = "New Project"): Project {
        return {
            id: crypto.randomUUID(),
            name,
            createdAt: new Date(),
            updatedAt: new Date(),
            sources: {},
            timeline: TimelineImpl.create(),
            outputSettings: {
                width: 1920,
                height: 1080,
                frameRate: 30
            }
        };
    }
}
