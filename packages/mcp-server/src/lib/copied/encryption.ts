/**
 * AES-256-GCM encryption utilities — copied from src/lib/crypto/encryption.ts
 * Removed encryption-validation import (inlined the format check).
 */

import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const SALT_LENGTH = 16
const IV_LENGTH = 12
const TAG_LENGTH = 16
const ENCRYPTION_KEY_HEX_LENGTH = 64

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Generate a secure key with: openssl rand -hex 32'
    )
  }

  const hexRegex = /^[0-9a-f]+$/i
  if (!hexRegex.test(key) || key.length < ENCRYPTION_KEY_HEX_LENGTH) {
    throw new Error('Invalid ENCRYPTION_KEY format')
  }

  return key
}

async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(passphrase, salt, KEY_LENGTH) as Promise<Buffer>
}

export async function encrypt(plaintext: string): Promise<string> {
  const passphrase = getEncryptionKey()
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)
  const key = await deriveKey(passphrase, salt)

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [salt.toString('hex'), iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
}

export async function decrypt(ciphertext: string): Promise<string> {
  const passphrase = getEncryptionKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 4) {
    throw new Error('Invalid ciphertext format: expected salt:iv:tag:ciphertext')
  }

  const [saltHex, ivHex, tagHex, encryptedHex] = parts
  const salt = Buffer.from(saltHex, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  if (salt.length !== SALT_LENGTH) throw new Error('Invalid salt length')
  if (iv.length !== IV_LENGTH) throw new Error('Invalid IV length')
  if (authTag.length !== TAG_LENGTH) throw new Error('Invalid auth tag length')

  const key = await deriveKey(passphrase, salt)
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

export async function decryptCredentials(encrypted: {
  apiKeyEncrypted: string
  projectIdEncrypted: string | null
}): Promise<{ apiKey: string; projectId: string | null }> {
  const [apiKey, projectId] = await Promise.all([
    decrypt(encrypted.apiKeyEncrypted),
    encrypted.projectIdEncrypted ? decrypt(encrypted.projectIdEncrypted) : Promise.resolve(null),
  ])
  return { apiKey, projectId }
}

export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  if (parts.length !== 4) return false
  const [saltHex, ivHex, tagHex, encryptedHex] = parts
  const hexRegex = /^[0-9a-f]+$/i
  return (
    hexRegex.test(saltHex) && saltHex.length === SALT_LENGTH * 2 &&
    hexRegex.test(ivHex) && ivHex.length === IV_LENGTH * 2 &&
    hexRegex.test(tagHex) && tagHex.length === TAG_LENGTH * 2 &&
    hexRegex.test(encryptedHex) && encryptedHex.length > 0
  )
}
