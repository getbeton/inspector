/**
 * Edge-safe encryption key validation utilities
 *
 * These functions validate the ENCRYPTION_KEY environment variable format
 * without importing any Node.js built-ins (crypto, util). This allows them
 * to be safely imported in Edge runtime contexts like instrumentation.ts.
 */

// Expected hex string length for a 256-bit key
export const ENCRYPTION_KEY_HEX_LENGTH = 64 // 32 bytes * 2 hex chars per byte

/**
 * Validation result for the encryption key
 */
export interface EncryptionKeyValidation {
  valid: boolean;
  error?: string;
  keyLength?: number;
}

/**
 * Validates the ENCRYPTION_KEY format without accessing environment variables directly.
 * @param key - The key to validate
 * @returns Validation result with details
 */
export function validateEncryptionKeyFormat(key: string): EncryptionKeyValidation {
  if (!key || key.trim() === '') {
    return {
      valid: false,
      error: 'ENCRYPTION_KEY is empty or not set',
    };
  }

  // Check if key is a valid hex string
  const hexRegex = /^[0-9a-f]+$/i;
  if (!hexRegex.test(key)) {
    return {
      valid: false,
      error: 'ENCRYPTION_KEY must be a hexadecimal string (0-9, a-f characters only)',
      keyLength: key.length,
    };
  }

  // Check minimum length (64 hex chars = 32 bytes = 256 bits)
  if (key.length < ENCRYPTION_KEY_HEX_LENGTH) {
    return {
      valid: false,
      error: `ENCRYPTION_KEY must be at least ${ENCRYPTION_KEY_HEX_LENGTH} hex characters (256 bits). Got ${key.length} characters.`,
      keyLength: key.length,
    };
  }

  return {
    valid: true,
    keyLength: key.length,
  };
}

/**
 * Validates the ENCRYPTION_KEY environment variable.
 * Call this at startup to fail fast if the key is invalid.
 * @throws Error if ENCRYPTION_KEY is missing or invalid
 */
export function validateEncryptionKey(): void {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Generate a secure key with: openssl rand -hex 32'
    );
  }

  const validation = validateEncryptionKeyFormat(key);
  if (!validation.valid) {
    throw new Error(
      `Invalid ENCRYPTION_KEY: ${validation.error}. ` +
      'Generate a secure key with: openssl rand -hex 32'
    );
  }
}

/**
 * Checks if the ENCRYPTION_KEY is configured and valid (non-throwing version)
 * @returns true if ENCRYPTION_KEY is set and valid
 */
export function isEncryptionKeyConfigured(): boolean {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return false;
  return validateEncryptionKeyFormat(key).valid;
}
