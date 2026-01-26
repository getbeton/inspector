/**
 * Production-Safe Logger Utility
 *
 * Provides environment-aware logging that:
 * - In development: Logs everything with full details
 * - In production: Only logs warnings and errors, omits debug/info logs
 * - Never logs sensitive data (credentials, tokens, etc.)
 *
 * Usage:
 *   import { logger } from '@/lib/utils/logger';
 *
 *   logger.debug('[Module] Processing item', { id: item.id });  // Only in dev
 *   logger.info('[Module] Operation completed');                // Only in dev
 *   logger.warn('[Module] Deprecated feature used');            // Always
 *   logger.error('[Module] Failed to process', error);          // Always
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Whether to include timestamps */
  includeTimestamp: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Determines if we're in a production environment.
 * Checks both NODE_ENV and VERCEL_ENV for accurate detection.
 */
function isProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  );
}

/**
 * Gets the default configuration based on environment.
 */
function getDefaultConfig(): LoggerConfig {
  if (isProduction()) {
    return {
      minLevel: 'warn', // Only warn and error in production
      includeTimestamp: false, // Vercel adds timestamps
    };
  }

  return {
    minLevel: 'debug', // All levels in development
    includeTimestamp: true,
  };
}

/**
 * Sanitizes log arguments to prevent accidental credential leaks.
 * Redacts common sensitive field names.
 */
function sanitizeArgs(args: unknown[]): unknown[] {
  const sensitiveKeys = [
    'password',
    'api_key',
    'apiKey',
    'secret',
    'token',
    'authorization',
    'auth',
    'credential',
    'private',
    'encrypted',
  ];

  return args.map((arg) => {
    if (typeof arg === 'object' && arg !== null) {
      return sanitizeObject(arg as Record<string, unknown>, sensitiveKeys);
    }
    return arg;
  });
}

/**
 * Recursively sanitizes an object, redacting sensitive fields.
 */
function sanitizeObject(
  obj: Record<string, unknown>,
  sensitiveKeys: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((sk) => lowerKey.includes(sk));

    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>, sensitiveKeys);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Creates a logger instance with the given configuration.
 */
function createLogger(config: LoggerConfig = getDefaultConfig()) {
  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= LOG_LEVELS[config.minLevel];
  };

  const formatMessage = (level: LogLevel, message: string): string => {
    if (config.includeTimestamp) {
      const timestamp = new Date().toISOString();
      return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }
    return message;
  };

  return {
    /**
     * Debug-level logging. Only outputs in development.
     * Use for verbose debugging information.
     */
    debug: (message: string, ...args: unknown[]): void => {
      if (shouldLog('debug')) {
        console.log(formatMessage('debug', message), ...sanitizeArgs(args));
      }
    },

    /**
     * Info-level logging. Only outputs in development.
     * Use for general operational information.
     */
    info: (message: string, ...args: unknown[]): void => {
      if (shouldLog('info')) {
        console.log(formatMessage('info', message), ...sanitizeArgs(args));
      }
    },

    /**
     * Warning-level logging. Always outputs.
     * Use for non-critical issues that should be investigated.
     */
    warn: (message: string, ...args: unknown[]): void => {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', message), ...sanitizeArgs(args));
      }
    },

    /**
     * Error-level logging. Always outputs.
     * Use for errors that need attention.
     */
    error: (message: string, ...args: unknown[]): void => {
      if (shouldLog('error')) {
        console.error(formatMessage('error', message), ...sanitizeArgs(args));
      }
    },

    /**
     * Creates a child logger with a fixed prefix.
     * Useful for module-specific logging.
     */
    child: (prefix: string) => {
      const childConfig = { ...config };
      return {
        debug: (message: string, ...args: unknown[]) =>
          createLogger(childConfig).debug(`${prefix} ${message}`, ...args),
        info: (message: string, ...args: unknown[]) =>
          createLogger(childConfig).info(`${prefix} ${message}`, ...args),
        warn: (message: string, ...args: unknown[]) =>
          createLogger(childConfig).warn(`${prefix} ${message}`, ...args),
        error: (message: string, ...args: unknown[]) =>
          createLogger(childConfig).error(`${prefix} ${message}`, ...args),
      };
    },
  };
}

/**
 * Default logger instance configured for the current environment.
 */
export const logger = createLogger();

/**
 * Creates a module-specific logger with a prefix.
 *
 * @example
 * const log = createModuleLogger('[Billing]');
 * log.info('Processing payment'); // Outputs: [Billing] Processing payment
 */
export function createModuleLogger(prefix: string) {
  return logger.child(prefix);
}

export type { LogLevel, LoggerConfig };
