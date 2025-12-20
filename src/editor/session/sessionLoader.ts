import type { UserEvent } from '../../core/types';

export interface SessionData {
    videoUrl: string | null;
    metadata: UserEvent[];
    recordingStartTime?: number;
}

export async function loadSessionData(): Promise<SessionData> {
    const result: SessionData = {
        videoUrl: null,
        metadata: []
    };

    // 1. Load Metadata from Chrome Storage
    try {
        const storage = await chrome.storage.local.get(['recordingMetadata']);
        if (storage.recordingMetadata) {
            result.metadata = storage.recordingMetadata as UserEvent[];
        }
    } catch (e) {
        console.warn('Failed to load metadata from chrome storage:', e);
    }

    // 2. Load Blob from IndexedDB
    try {
        const blobData = await new Promise<any>((resolve, reject) => {
            const request = indexedDB.open('RecordoDB', 1);
            request.onerror = () => reject('IDB Open Failed');
            request.onsuccess = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('recordings')) {
                    resolve(null);
                    return;
                }
                const transaction = db.transaction(['recordings'], 'readonly');
                const store = transaction.objectStore('recordings');
                const getRequest = store.get('latest');
                getRequest.onsuccess = () => resolve(getRequest.result);
                getRequest.onerror = () => reject('IDB Get Failed');
            };
        });

        if (blobData) {
            const blob = blobData.blob;
            result.videoUrl = URL.createObjectURL(blob);
            if (blobData.startTime) result.recordingStartTime = blobData.startTime;
            else if (blobData.timestamp) result.recordingStartTime = blobData.timestamp;
        }
    } catch (e) {
        console.warn('Failed to load video from IndexedDB:', e);
    }

    return result;
}
