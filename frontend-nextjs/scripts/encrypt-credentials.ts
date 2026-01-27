#!/usr/bin/env npx tsx
/**
 * Encrypt Existing Plaintext Credentials Migration Script
 *
 * Migrates integration_configs rows that have plaintext API keys
 * to use the AES-256-GCM encrypted format.
 *
 * Usage:
 *   # Dry run (no changes)
 *   npx tsx scripts/encrypt-credentials.ts --dry-run
 *
 *   # Execute migration
 *   npx tsx scripts/encrypt-credentials.ts
 *
 * Prerequisites:
 *   - ENCRYPTION_KEY environment variable must be set
 *   - NEXT_PUBLIC_SUPABASE_URL environment variable must be set
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable must be set
 *
 * This script is idempotent - running it multiple times is safe.
 * Already-encrypted credentials are detected and skipped.
 */

import { createClient } from '@supabase/supabase-js'

// Import encryption functions using relative paths since this runs outside Next.js
// We need to replicate the logic here since we can't use @/ aliases
import { createCipheriv, randomBytes, scrypt } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)

// ============================================
// Configuration
// ============================================

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const SALT_LENGTH = 16
const IV_LENGTH = 12
const TAG_LENGTH = 16

// ============================================
// Encryption (standalone, no Next.js deps)
// ============================================

async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(passphrase, salt, KEY_LENGTH) as Promise<Buffer>
}

async function encrypt(plaintext: string, encryptionKey: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)
  const key = await deriveKey(encryptionKey, salt)

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':')
}

function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  if (parts.length !== 4) return false

  const [saltHex, ivHex, tagHex, encryptedHex] = parts
  const hexRegex = /^[0-9a-f]+$/i
  return (
    hexRegex.test(saltHex) &&
    saltHex.length === SALT_LENGTH * 2 &&
    hexRegex.test(ivHex) &&
    ivHex.length === IV_LENGTH * 2 &&
    hexRegex.test(tagHex) &&
    tagHex.length === TAG_LENGTH * 2 &&
    hexRegex.test(encryptedHex) &&
    encryptedHex.length > 0
  )
}

// ============================================
// Main Script
// ============================================

interface IntegrationRow {
  id: string
  workspace_id: string
  integration_name: string
  api_key_encrypted: string
  project_id_encrypted: string | null
  config_json: Record<string, unknown>
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run')

  console.log('========================================')
  console.log('Credential Encryption Migration Script')
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE'}`)
  console.log('========================================\n')

  // Validate environment
  const encryptionKey = process.env.ENCRYPTION_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!encryptionKey) {
    console.error('ERROR: ENCRYPTION_KEY environment variable is not set')
    console.error('Generate one with: openssl rand -hex 32')
    process.exit(1)
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
    process.exit(1)
  }

  // Validate key format
  const hexRegex = /^[0-9a-f]+$/i
  if (!hexRegex.test(encryptionKey) || encryptionKey.length < 64) {
    console.error('ERROR: ENCRYPTION_KEY must be at least 64 hex characters')
    process.exit(1)
  }

  // Create Supabase client with service role key (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Fetch all integration configs
  const { data: configs, error } = await supabase
    .from('integration_configs')
    .select('id, workspace_id, integration_name, api_key_encrypted, project_id_encrypted, config_json')

  if (error) {
    console.error('ERROR: Failed to fetch integration configs:', error.message)
    process.exit(1)
  }

  if (!configs || configs.length === 0) {
    console.log('No integration configs found. Nothing to migrate.')
    process.exit(0)
  }

  const rows = configs as IntegrationRow[]
  console.log(`Found ${rows.length} integration config(s)\n`)

  let migrated = 0
  let skipped = 0
  let errors = 0

  for (const row of rows) {
    const label = `[${row.integration_name}] workspace=${row.workspace_id.substring(0, 8)}...`

    // Check if already encrypted
    if (isEncrypted(row.api_key_encrypted)) {
      console.log(`  SKIP ${label} - already encrypted`)
      skipped++
      continue
    }

    console.log(`  MIGRATE ${label} - plaintext detected`)

    if (isDryRun) {
      migrated++
      continue
    }

    try {
      // Encrypt the API key
      const apiKeyEncrypted = await encrypt(row.api_key_encrypted, encryptionKey)

      // Encrypt project_id if present (check config_json for legacy storage)
      let projectIdEncrypted: string | null = null
      const legacyProjectId = row.config_json?.project_id as string | undefined

      if (row.project_id_encrypted && !isEncrypted(row.project_id_encrypted)) {
        // project_id_encrypted has plaintext
        projectIdEncrypted = await encrypt(row.project_id_encrypted, encryptionKey)
      } else if (legacyProjectId) {
        // project_id stored in config_json (legacy format)
        projectIdEncrypted = await encrypt(legacyProjectId, encryptionKey)
      } else {
        projectIdEncrypted = row.project_id_encrypted
      }

      // Update the row
      const { error: updateError } = await supabase
        .from('integration_configs')
        .update({
          api_key_encrypted: apiKeyEncrypted,
          project_id_encrypted: projectIdEncrypted,
        })
        .eq('id', row.id)

      if (updateError) {
        console.error(`  ERROR ${label}: ${updateError.message}`)
        errors++
      } else {
        console.log(`  OK ${label} - encrypted successfully`)
        migrated++
      }
    } catch (err) {
      console.error(`  ERROR ${label}: ${err instanceof Error ? err.message : err}`)
      errors++
    }
  }

  // Summary
  console.log('\n========================================')
  console.log('Migration Summary')
  console.log('========================================')
  console.log(`  Total configs: ${rows.length}`)
  console.log(`  Migrated:      ${migrated}`)
  console.log(`  Skipped:       ${skipped} (already encrypted)`)
  console.log(`  Errors:        ${errors}`)
  console.log(`  Mode:          ${isDryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log('========================================')

  if (errors > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
