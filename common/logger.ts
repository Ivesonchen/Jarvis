/**
 * Tiny tagged logger used in both processes.
 *
 * In dev or when running in the renderer, writes go to `console.*`.
 * In packaged main-process builds we'll later route through a file sink
 * (see `electron/diagnostic-logger.ts` when added). For now this is just
 * a thin wrapper around `console` that prefixes every line with `[tag]`.
 */
export interface Logger {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
}

export function createLogger(tag: string): Logger {
    const prefix = `[${tag}]`;
    return {
        // eslint-disable-next-line no-console
        info: (...args) => console.info(prefix, ...args),
        // eslint-disable-next-line no-console
        warn: (...args) => console.warn(prefix, ...args),
        // eslint-disable-next-line no-console
        error: (...args) => console.error(prefix, ...args),
        // eslint-disable-next-line no-console
        debug: (...args) => console.debug(prefix, ...args),
    };
}
