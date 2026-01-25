/**
 * AES-256-GCM encryption utilities for securing integration credentials
 *
 * Uses scrypt for key derivation from ENCRYPTION_KEY environment variable,
 * generating unique salt and IV for each encryption operation.
 * Output format: salt:iv:tag:ciphertext (hex-encoded)
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits for AES-256
const SALT_LENGTH = 16 // 128 bits
const IV_LENGTH = 12 // 96 bits (recommended for GCM)
const TAG_LENGTH = 16 // 128 bits (full auth tag)

/**
 * Get the encryption key from environment variable
 * @throws Error if ENCRYPTION_KEY is not set
 */
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set')
  }
  return key
}

/**
 * Derive a 256-bit key from the passphrase using scrypt
 * @param passphrase - The passphrase to derive the key from
 * @param salt - The salt for key derivation (should be unique per encryption)
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH)
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in format: salt:iv:tag:ciphertext (hex-encoded)
 */
export function encrypt(plaintext: string): string {
  const passphrase = getEncryptionKey()

  // Generate unique salt and IV for this encryption
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)

  // Derive key using scrypt
  const key = deriveKey(passphrase, salt)

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
 * @param ciphertext - The encrypted string in format: salt:iv:tag:ciphertext
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (wrong key or tampered data)
 */
export function decrypt(ciphertext: string): string {
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

  // Derive key using same salt
  const key = deriveKey(passphrase, salt)

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
 * @param credentials - Object containing apiKey and optional projectId
 * @returns Object with encrypted values
 */
export function encryptCredentials(credentials: {
  apiKey: string
  projectId?: string
}): {
  apiKeyEncrypted: string
  projectIdEncrypted: string | null
} {
  return {
    apiKeyEncrypted: encrypt(credentials.apiKey),
    projectIdEncrypted: credentials.projectId ? encrypt(credentials.projectId) : null
  }
}

/**
 * Decrypt integration credentials
 * @param encrypted - Object containing encrypted apiKey and optional projectId
 * @returns Object with decrypted values
 */
export function decryptCredentials(encrypted: {
  apiKeyEncrypted: string
  projectIdEncrypted: string | null
}): {
  apiKey: string
  projectId: string | null
} {
  return {
    apiKey: decrypt(encrypted.apiKeyEncrypted),
    projectId: encrypted.projectIdEncrypted ? decrypt(encrypted.projectIdEncrypted) : null
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
