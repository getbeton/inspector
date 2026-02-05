'use client'

/**
 * Client-Side Production-Safe Logger
 *
 * Same concept as server-side logger but for client components.
 * In production, only logs warnings and errors.
 * In development, logs everything for debugging.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Determines if we're in a production environment.
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Gets the minimum log level for the current environment.
 */
function getMinLevel(): LogLevel {
  return isProduction() ? 'warn' : 'debug';
}

/**
 * Checks if a log level should be output.
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getMinLevel()];
}

/**
 * Creates a client-side logger with a prefix.
 */
export function createClientLogger(prefix: string) {
  return {
    debug: (message: string, ...args: unknown[]): void => {
      if (shouldLog('debug')) {
        console.log(`${prefix} ${message}`, ...args);
      }
    },
    info: (message: string, ...args: unknown[]): void => {
      if (shouldLog('info')) {
        console.log(`${prefix} ${message}`, ...args);
      }
    },
    warn: (message: string, ...args: unknown[]): void => {
      if (shouldLog('warn')) {
        console.warn(`${prefix} ${message}`, ...args);
      }
    },
    error: (message: string, ...args: unknown[]): void => {
      if (shouldLog('error')) {
        console.error(`${prefix} ${message}`, ...args);
      }
    },
  };
}

/**
 * Default client logger instance.
 */
export const clientLogger = createClientLogger('[Client]');
