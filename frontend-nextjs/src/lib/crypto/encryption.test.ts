import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
  isEncrypted,
  validateEncryptionKey,
  validateEncryptionKeyFormat,
  isEncryptionKeyConfigured,
} from './encryption'

// Test encryption key (64 hex chars = 256 bits)
const TEST_KEY = 'a'.repeat(64)

describe('encryption', () => {
  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // ============================================
  // encrypt / decrypt round-trip
  // ============================================

  describe('encrypt and decrypt', () => {
    it('should round-trip a simple string', async () => {
      const plaintext = 'hello world'
      const ciphertext = await encrypt(plaintext)
      const result = await decrypt(ciphertext)
      expect(result).toBe(plaintext)
    })

    it('should round-trip an empty string', async () => {
      const plaintext = ''
      const ciphertext = await encrypt(plaintext)
      const result = await decrypt(ciphertext)
      expect(result).toBe(plaintext)
    })

    it('should round-trip a long string', async () => {
      const plaintext = 'x'.repeat(10000)
      const ciphertext = await encrypt(plaintext)
      const result = await decrypt(ciphertext)
      expect(result).toBe(plaintext)
    })

    it('should round-trip unicode content', async () => {
      const plaintext = '日本語テスト 🎉 résumé'
      const ciphertext = await encrypt(plaintext)
      const result = await decrypt(ciphertext)
      expect(result).toBe(plaintext)
    })

    it('should round-trip an API key format', async () => {
      const plaintext = 'phx_abcdef123456789'
      const ciphertext = await encrypt(plaintext)
      const result = await decrypt(ciphertext)
      expect(result).toBe(plaintext)
    })

    it('should produce different ciphertexts for same plaintext', async () => {
      const plaintext = 'same input'
      const cipher1 = await encrypt(plaintext)
      const cipher2 = await encrypt(plaintext)
      expect(cipher1).not.toBe(cipher2)

      // But both should decrypt to the same plaintext
      expect(await decrypt(cipher1)).toBe(plaintext)
      expect(await decrypt(cipher2)).toBe(plaintext)
    })

    it('should produce output in salt:iv:tag:ciphertext format', async () => {
      const ciphertext = await encrypt('test')
      const parts = ciphertext.split(':')
      expect(parts).toHaveLength(4)

      // salt = 16 bytes = 32 hex chars
      expect(parts[0]).toHaveLength(32)
      // iv = 12 bytes = 24 hex chars
      expect(parts[1]).toHaveLength(24)
      // tag = 16 bytes = 32 hex chars
      expect(parts[2]).toHaveLength(32)
      // ciphertext length > 0
      expect(parts[3].length).toBeGreaterThan(0)
    })
  })

  // ============================================
  // Tampered ciphertext detection
  // ============================================

  describe('tampered ciphertext detection', () => {
    it('should reject tampered ciphertext', async () => {
      const ciphertext = await encrypt('secret data')
      const parts = ciphertext.split(':')

      // Tamper with the ciphertext portion
      const tampered = parts[3].replace(parts[3][0], parts[3][0] === 'a' ? 'b' : 'a')
      const tamperedCiphertext = `${parts[0]}:${parts[1]}:${parts[2]}:${tampered}`

      await expect(decrypt(tamperedCiphertext)).rejects.toThrow()
    })

    it('should reject tampered auth tag', async () => {
      const ciphertext = await encrypt('secret data')
      const parts = ciphertext.split(':')

      // Tamper with auth tag
      const tampered = parts[2].replace(parts[2][0], parts[2][0] === 'a' ? 'b' : 'a')
      const tamperedCiphertext = `${parts[0]}:${parts[1]}:${tampered}:${parts[3]}`

      await expect(decrypt(tamperedCiphertext)).rejects.toThrow()
    })

    it('should reject tampered salt', async () => {
      const ciphertext = await encrypt('secret data')
      const parts = ciphertext.split(':')

      // Tamper with salt (derives different key)
      const tampered = parts[0].replace(parts[0][0], parts[0][0] === 'a' ? 'b' : 'a')
      const tamperedCiphertext = `${tampered}:${parts[1]}:${parts[2]}:${parts[3]}`

      await expect(decrypt(tamperedCiphertext)).rejects.toThrow()
    })
  })

  // ============================================
  // Invalid format handling
  // ============================================

  describe('invalid format handling', () => {
    it('should reject malformed ciphertext (wrong number of parts)', async () => {
      await expect(decrypt('abc:def')).rejects.toThrow('Invalid ciphertext format')
    })

    it('should reject empty string', async () => {
      await expect(decrypt('')).rejects.toThrow('Invalid ciphertext format')
    })

    it('should reject ciphertext with wrong salt length', async () => {
      const badSalt = 'aa'.repeat(8) // 16 hex = 8 bytes, should be 32 hex = 16 bytes
      const ciphertext = `${badSalt}:${'bb'.repeat(12)}:${'cc'.repeat(16)}:${'dd'.repeat(8)}`
      await expect(decrypt(ciphertext)).rejects.toThrow('Invalid salt length')
    })

    it('should reject ciphertext with wrong IV length', async () => {
      const goodSalt = 'aa'.repeat(16)
      const badIv = 'bb'.repeat(8) // 16 hex = 8 bytes, should be 24 hex = 12 bytes
      const ciphertext = `${goodSalt}:${badIv}:${'cc'.repeat(16)}:${'dd'.repeat(8)}`
      await expect(decrypt(ciphertext)).rejects.toThrow('Invalid IV length')
    })

    it('should reject ciphertext with wrong tag length', async () => {
      const goodSalt = 'aa'.repeat(16)
      const goodIv = 'bb'.repeat(12)
      const badTag = 'cc'.repeat(8) // 16 hex = 8 bytes, should be 32 hex = 16 bytes
      const ciphertext = `${goodSalt}:${goodIv}:${badTag}:${'dd'.repeat(8)}`
      await expect(decrypt(ciphertext)).rejects.toThrow('Invalid auth tag length')
    })
  })

  // ============================================
  // Missing ENCRYPTION_KEY
  // ============================================

  describe('missing ENCRYPTION_KEY', () => {
    it('should throw when ENCRYPTION_KEY is not set', async () => {
      vi.stubEnv('ENCRYPTION_KEY', '')
      await expect(encrypt('test')).rejects.toThrow('ENCRYPTION_KEY')
    })

    it('should throw when ENCRYPTION_KEY is undefined', async () => {
      delete process.env.ENCRYPTION_KEY
      await expect(encrypt('test')).rejects.toThrow('ENCRYPTION_KEY')
    })
  })

  // ============================================
  // validateEncryptionKey
  // ============================================

  describe('validateEncryptionKey', () => {
    it('should not throw for valid key', () => {
      expect(() => validateEncryptionKey()).not.toThrow()
    })

    it('should throw for missing key', () => {
      delete process.env.ENCRYPTION_KEY
      expect(() => validateEncryptionKey()).toThrow('ENCRYPTION_KEY')
    })

    it('should throw for short key', () => {
      vi.stubEnv('ENCRYPTION_KEY', 'abcd')
      expect(() => validateEncryptionKey()).toThrow('Invalid ENCRYPTION_KEY')
    })

    it('should throw for non-hex key', () => {
      vi.stubEnv('ENCRYPTION_KEY', 'g'.repeat(64))
      expect(() => validateEncryptionKey()).toThrow('hexadecimal')
    })
  })

  // ============================================
  // validateEncryptionKeyFormat
  // ============================================

  describe('validateEncryptionKeyFormat', () => {
    it('should accept valid 64-char hex key', () => {
      const result = validateEncryptionKeyFormat('a'.repeat(64))
      expect(result.valid).toBe(true)
      expect(result.keyLength).toBe(64)
    })

    it('should accept longer hex key', () => {
      const result = validateEncryptionKeyFormat('a'.repeat(128))
      expect(result.valid).toBe(true)
    })

    it('should reject empty key', () => {
      const result = validateEncryptionKeyFormat('')
      expect(result.valid).toBe(false)
    })

    it('should reject short key', () => {
      const result = validateEncryptionKeyFormat('abcd1234')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('at least')
    })

    it('should reject non-hex characters', () => {
      const result = validateEncryptionKeyFormat('z'.repeat(64))
      expect(result.valid).toBe(false)
      expect(result.error).toContain('hexadecimal')
    })
  })

  // ============================================
  // isEncryptionKeyConfigured
  // ============================================

  describe('isEncryptionKeyConfigured', () => {
    it('should return true when valid key is set', () => {
      expect(isEncryptionKeyConfigured()).toBe(true)
    })

    it('should return false when key is not set', () => {
      delete process.env.ENCRYPTION_KEY
      expect(isEncryptionKeyConfigured()).toBe(false)
    })

    it('should return false when key is invalid', () => {
      vi.stubEnv('ENCRYPTION_KEY', 'short')
      expect(isEncryptionKeyConfigured()).toBe(false)
    })
  })

  // ============================================
  // isEncrypted
  // ============================================

  describe('isEncrypted', () => {
    it('should detect encrypted values', async () => {
      const ciphertext = await encrypt('test')
      expect(isEncrypted(ciphertext)).toBe(true)
    })

    it('should reject plaintext API keys', () => {
      expect(isEncrypted('phx_abcdef123456789')).toBe(false)
    })

    it('should reject empty string', () => {
      expect(isEncrypted('')).toBe(false)
    })

    it('should reject random strings', () => {
      expect(isEncrypted('some random text')).toBe(false)
    })

    it('should reject strings with wrong number of parts', () => {
      expect(isEncrypted('a:b:c')).toBe(false)
      expect(isEncrypted('a:b:c:d:e')).toBe(false)
    })

    it('should reject strings with wrong component lengths', () => {
      // Valid format but wrong salt length
      expect(isEncrypted('aa:bb:cc:dd')).toBe(false)
    })
  })

  // ============================================
  // encryptCredentials / decryptCredentials
  // ============================================

  describe('encryptCredentials and decryptCredentials', () => {
    it('should round-trip API key only', async () => {
      const encrypted = await encryptCredentials({ apiKey: 'phx_test123' })
      expect(encrypted.apiKeyEncrypted).toBeTruthy()
      expect(encrypted.projectIdEncrypted).toBeNull()

      const decrypted = await decryptCredentials(encrypted)
      expect(decrypted.apiKey).toBe('phx_test123')
      expect(decrypted.projectId).toBeNull()
    })

    it('should round-trip API key and project ID', async () => {
      const encrypted = await encryptCredentials({
        apiKey: 'phx_test123',
        projectId: '12345',
      })
      expect(encrypted.apiKeyEncrypted).toBeTruthy()
      expect(encrypted.projectIdEncrypted).toBeTruthy()

      const decrypted = await decryptCredentials(encrypted)
      expect(decrypted.apiKey).toBe('phx_test123')
      expect(decrypted.projectId).toBe('12345')
    })

    it('should encrypt both values independently', async () => {
      const encrypted = await encryptCredentials({
        apiKey: 'key1',
        projectId: 'proj1',
      })

      // Each should be a valid encrypted format
      expect(isEncrypted(encrypted.apiKeyEncrypted)).toBe(true)
      expect(isEncrypted(encrypted.projectIdEncrypted!)).toBe(true)

      // They should be different ciphertexts
      expect(encrypted.apiKeyEncrypted).not.toBe(encrypted.projectIdEncrypted)
    })
  })
})
