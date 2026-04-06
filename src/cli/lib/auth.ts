/**
 * Credential storage for the CLI
 * Stores API key in ~/.beton/credentials with restricted permissions
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { getConfigDir } from './config.js'

function getCredentialsPath(): string {
  return join(getConfigDir(), 'credentials')
}

/**
 * Save an API key to the credentials file
 */
export function saveApiKey(key: string): void {
  const dir = getConfigDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  const credsPath = getCredentialsPath()
  writeFileSync(credsPath, key, { mode: 0o600 })
  // Ensure permissions are correct even if the file existed
  try { chmodSync(credsPath, 0o600) } catch { /* ignore on Windows */ }
}

/**
 * Load the API key from the credentials file
 */
export function loadApiKey(): string | null {
  const credsPath = getCredentialsPath()
  if (!existsSync(credsPath)) return null
  try {
    const key = readFileSync(credsPath, 'utf-8').trim()
    return key || null
  } catch {
    return null
  }
}

/**
 * Clear stored credentials
 */
export function clearCredentials(): void {
  const credsPath = getCredentialsPath()
  if (existsSync(credsPath)) {
    unlinkSync(credsPath)
  }
}
