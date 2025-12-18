export const logger = {
    log: (...args: any[]) => {
        if (import.meta.env.DEV) {
            console.log(...args);
        }
    },
    warn: (...args: any[]) => {
        if (import.meta.env.DEV) {
            console.warn(...args);
        }
    },
    error: (...args: any[]) => {
        // Errors should probably always be logged, or maybe just in dev? 
        // usually errors are important enough to keep, but user asked for "some logger that only fires when built in dev mode"
        // I'll keep errors ensuring they are visible but maybe user wants strict silence.
        // For now, I'll respect the dev-only request strictly for 'log' and 'warn', but errors are usually critical.
        // However, the request specifically mentioned "console.log". 
        // I will make error dev-only too to be safe, or just leave console.error alone if not requested.
        // User asked: "change all console.log to some logger..."
        // I will focus on console.log.
        if (import.meta.env.DEV) {
            console.error(...args);
        }
    }
};
