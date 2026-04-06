/**
 * Configuration file management for ~/.beton/config.toml
 * Implements a minimal TOML parser for the simple config format.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface BetonConfig {
  auth?: {
    api_key?: string
  }
  workspace?: {
    default?: string
  }
  display?: {
    theme?: 'dark' | 'light' | 'auto'
    date_format?: 'relative' | 'iso' | 'local'
    auto_refresh?: number
    page_size?: number
  }
  api?: {
    base_url?: string
  }
}

const DEFAULT_BASE_URL = 'https://app.getbeton.com'
const DEFAULT_PAGE_SIZE = 30

/**
 * Get the path to the beton config directory
 */
export function getConfigDir(): string {
  return join(homedir(), '.beton')
}

/**
 * Get the path to the config file
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.toml')
}

/**
 * Minimal TOML parser for simple section + key=value config
 */
function parseTOML(content: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  let currentSection = ''

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    // Section header
    const sectionMatch = line.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1]
      if (!result[currentSection]) result[currentSection] = {}
      continue
    }

    // Key = value
    const kvMatch = line.match(/^(\w+)\s*=\s*(.+)$/)
    if (kvMatch && currentSection) {
      let value = kvMatch[2].trim()
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      result[currentSection][kvMatch[1]] = value
    }
  }

  return result
}

/**
 * Serialize a config object to TOML format
 */
function serializeTOML(config: BetonConfig): string {
  const lines: string[] = []

  const sections: Array<[string, Record<string, unknown> | undefined]> = [
    ['auth', config.auth],
    ['workspace', config.workspace],
    ['display', config.display],
    ['api', config.api],
  ]

  for (const [section, values] of sections) {
    if (!values) continue
    const entries = Object.entries(values).filter(([, v]) => v !== undefined)
    if (entries.length === 0) continue

    lines.push(`[${section}]`)
    for (const [key, value] of entries) {
      if (typeof value === 'string') {
        lines.push(`${key} = "${value}"`)
      } else if (typeof value === 'number') {
        lines.push(`${key} = ${value}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Load configuration from ~/.beton/config.toml
 */
export function loadConfig(): BetonConfig {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) return {}

  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed = parseTOML(content)

    const config: BetonConfig = {}

    if (parsed.auth) {
      config.auth = { api_key: parsed.auth.api_key }
    }
    if (parsed.workspace) {
      config.workspace = { default: parsed.workspace.default }
    }
    if (parsed.display) {
      config.display = {
        theme: parsed.display.theme as 'dark' | 'light' | 'auto',
        date_format: parsed.display.date_format as 'relative' | 'iso' | 'local',
        auto_refresh: parsed.display.auto_refresh ? Number(parsed.display.auto_refresh) : undefined,
        page_size: parsed.display.page_size ? Number(parsed.display.page_size) : undefined,
      }
    }
    if (parsed.api) {
      config.api = { base_url: parsed.api.base_url }
    }

    return config
  } catch {
    return {}
  }
}

/**
 * Save configuration to ~/.beton/config.toml
 */
export function saveConfig(config: BetonConfig): void {
  const configDir = getConfigDir()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true, mode: 0o700 })
  }
  writeFileSync(getConfigPath(), serializeTOML(config), { mode: 0o600 })
}

/**
 * Get effective configuration, merging CLI options with file config
 */
export function getEffectiveConfig(cliOptions: {
  workspace?: string
  apiUrl?: string
  json?: boolean
}): {
  baseUrl: string
  workspace: string
  apiKey: string
  pageSize: number
  dateFormat: 'relative' | 'iso' | 'local'
  json: boolean
} {
  const config = loadConfig()

  // API key: config file auth section, or credentials file
  let apiKey = config.auth?.api_key || ''
  if (!apiKey) {
    // Try credentials file
    const credsPath = join(getConfigDir(), 'credentials')
    if (existsSync(credsPath)) {
      try {
        apiKey = readFileSync(credsPath, 'utf-8').trim()
      } catch {
        // ignore
      }
    }
  }

  return {
    baseUrl: cliOptions.apiUrl || config.api?.base_url || DEFAULT_BASE_URL,
    workspace: cliOptions.workspace || config.workspace?.default || '',
    apiKey,
    pageSize: config.display?.page_size || DEFAULT_PAGE_SIZE,
    dateFormat: config.display?.date_format || 'relative',
    json: cliOptions.json || false,
  }
}
