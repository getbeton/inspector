/**
 * AES-256-GCM encryption utilities for securing integration credentials
 *
 * Uses scrypt for key derivation from ENCRYPTION_KEY environment variable,
 * generating unique salt and IV for each encryption operation.
 * Output format: salt:iv:tag:ciphertext (hex-encoded)
 */

import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto'
import { promisify } from 'util'

// Promisify scrypt for non-blocking key derivation
const scryptAsync = promisify(scrypt)

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits for AES-256
const SALT_LENGTH = 16 // 128 bits
const IV_LENGTH = 12 // 96 bits (recommended for GCM)
const TAG_LENGTH = 16 // 128 bits (full auth tag)

// Expected hex string length for a 256-bit key
const ENCRYPTION_KEY_HEX_LENGTH = 64 // 32 bytes * 2 hex chars per byte

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

/**
 * Get the encryption key from environment variable
 * @throws Error if ENCRYPTION_KEY is not set or invalid
 */
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Generate a secure key with: openssl rand -hex 32'
    );
  }

  // Validate format at runtime as a safety check
  const validation = validateEncryptionKeyFormat(key);
  if (!validation.valid) {
    throw new Error(`Invalid ENCRYPTION_KEY: ${validation.error}`);
  }

  return key
}

/**
 * Derive a 256-bit key from the passphrase using scrypt (async)
 *
 * Uses async scrypt to avoid blocking the event loop during key derivation.
 * This is important for server performance under concurrent load.
 *
 * @param passphrase - The passphrase to derive the key from
 * @param salt - The salt for key derivation (should be unique per encryption)
 */
async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(passphrase, salt, KEY_LENGTH) as Promise<Buffer>
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 *
 * Uses async key derivation to avoid blocking the event loop.
 *
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in format: salt:iv:tag:ciphertext (hex-encoded)
 */
export async function encrypt(plaintext: string): Promise<string> {
  const passphrase = getEncryptionKey()

  // Generate unique salt and IV for this encryption
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)

  // Derive key using scrypt (async to avoid blocking event loop)
  const key = await deriveKey(passphrase, salt)

  // Create cipher and encrypt
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()

  // Return format: salt:iv:tag:ciphertext
  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex')
  ].join(':')
}

/**
 * Decrypt a ciphertext string using AES-256-GCM
 *
 * Uses async key derivation to avoid blocking the event loop.
 *
 * @param ciphertext - The encrypted string in format: salt:iv:tag:ciphertext
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (wrong key or tampered data)
 */
export async function decrypt(ciphertext: string): Promise<string> {
  const passphrase = getEncryptionKey()

  // Parse the ciphertext components
  const parts = ciphertext.split(':')
  if (parts.length !== 4) {
    throw new Error('Invalid ciphertext format: expected salt:iv:tag:ciphertext')
  }

  const [saltHex, ivHex, tagHex, encryptedHex] = parts
  const salt = Buffer.from(saltHex, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  // Validate component lengths
  if (salt.length !== SALT_LENGTH) {
    throw new Error('Invalid salt length')
  }
  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length')
  }
  if (authTag.length !== TAG_LENGTH) {
    throw new Error('Invalid auth tag length')
  }

  // Derive key using same salt (async to avoid blocking event loop)
  const key = await deriveKey(passphrase, salt)

  // Create decipher and decrypt
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])

  return decrypted.toString('utf8')
}

/**
 * Encrypt integration credentials (API key and optional project ID)
 *
 * Encrypts credentials in parallel for better performance.
 *
 * @param credentials - Object containing apiKey and optional projectId
 * @returns Object with encrypted values
 */
export async function encryptCredentials(credentials: {
  apiKey: string
  projectId?: string
}): Promise<{
  apiKeyEncrypted: string
  projectIdEncrypted: string | null
}> {
  // Encrypt in parallel for better performance
  const [apiKeyEncrypted, projectIdEncrypted] = await Promise.all([
    encrypt(credentials.apiKey),
    credentials.projectId ? encrypt(credentials.projectId) : Promise.resolve(null),
  ])

  return {
    apiKeyEncrypted,
    projectIdEncrypted,
  }
}

/**
 * Decrypt integration credentials
 *
 * Decrypts credentials in parallel for better performance.
 *
 * @param encrypted - Object containing encrypted apiKey and optional projectId
 * @returns Object with decrypted values
 */
export async function decryptCredentials(encrypted: {
  apiKeyEncrypted: string
  projectIdEncrypted: string | null
}): Promise<{
  apiKey: string
  projectId: string | null
}> {
  // Decrypt in parallel for better performance
  const [apiKey, projectId] = await Promise.all([
    decrypt(encrypted.apiKeyEncrypted),
    encrypted.projectIdEncrypted ? decrypt(encrypted.projectIdEncrypted) : Promise.resolve(null),
  ])

  return {
    apiKey,
    projectId,
  }
}

/**
 * Check if a string looks like encrypted data (has the expected format)
 * @param value - The string to check
 * @returns true if the string matches the encrypted format
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  if (parts.length !== 4) return false

  const [saltHex, ivHex, tagHex, encryptedHex] = parts

  // Check if all parts are valid hex strings of expected lengths
  const hexRegex = /^[0-9a-f]+$/i
  return (
    hexRegex.test(saltHex) && saltHex.length === SALT_LENGTH * 2 &&
    hexRegex.test(ivHex) && ivHex.length === IV_LENGTH * 2 &&
    hexRegex.test(tagHex) && tagHex.length === TAG_LENGTH * 2 &&
    hexRegex.test(encryptedHex) && encryptedHex.length > 0
  )
}
