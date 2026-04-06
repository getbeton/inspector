/**
 * Standalone HTTP client for the CLI
 * Uses native fetch (Node 18+) with auth header injection
 */

import { getEffectiveConfig } from './config.js'

export class CLIApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: unknown
  ) {
    super(message)
    this.name = 'CLIApiError'
  }
}

export class CLIApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private workspace?: string
  ) {}

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(path, this.baseUrl)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value)
        }
      }
    }
    if (this.workspace) {
      url.searchParams.set('workspace', this.workspace)
    }
    return url.toString()
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }
    return headers
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string>,
    body?: unknown
  ): Promise<T> {
    const url = this.buildUrl(path, params)
    const options: RequestInit = {
      method,
      headers: this.getHeaders(),
    }
    if (body !== undefined) {
      options.body = JSON.stringify(body)
    }

    let response: Response
    try {
      response = await fetch(url, options)
    } catch (err) {
      throw new CLIApiError(
        `Connection failed: ${(err as Error).message}. Is the API running at ${this.baseUrl}?`,
        0
      )
    }

    if (!response.ok) {
      let errorBody: unknown
      try {
        errorBody = await response.json()
      } catch {
        errorBody = await response.text().catch(() => null)
      }
      throw new CLIApiError(
        `API error ${response.status}: ${response.statusText}`,
        response.status,
        errorBody
      )
    }

    const text = await response.text()
    if (!text) return {} as T
    return JSON.parse(text) as T
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, params)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, undefined, body)
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, undefined, body)
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }
}

// Singleton cache
let cachedClient: CLIApiClient | null = null

/**
 * Get a configured API client instance.
 * Reads config from ~/.beton/config.toml and credentials file.
 */
export function getApiClient(cliOptions?: {
  workspace?: string
  apiUrl?: string
  json?: boolean
}): CLIApiClient {
  if (cachedClient) return cachedClient
  const config = getEffectiveConfig(cliOptions || {})
  cachedClient = new CLIApiClient(config.baseUrl, config.apiKey, config.workspace)
  return cachedClient
}

/**
 * Reset the cached client (useful for testing or after config changes)
 */
export function resetApiClient(): void {
  cachedClient = null
}

/**
 * Handle API errors with appropriate exit codes and messages
 */
export function handleApiError(err: unknown, json: boolean): never {
  if (err instanceof CLIApiError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      if (json) {
        process.stderr.write(JSON.stringify({ error: { code: 2, message: 'Not authenticated. Run `beton login --api-key <key>`' } }) + '\n')
      } else {
        console.error('Not authenticated. Run `beton login --api-key <key>`')
      }
      process.exit(2)
    }
    if (err.statusCode === 404) {
      if (json) {
        process.stderr.write(JSON.stringify({ error: { code: 4, message: 'Resource not found' } }) + '\n')
      } else {
        console.error('Resource not found')
      }
      process.exit(4)
    }
    if (err.statusCode === 0) {
      // Connection error
      if (json) {
        process.stderr.write(JSON.stringify({ error: { code: 3, message: err.message } }) + '\n')
      } else {
        console.error(err.message)
      }
      process.exit(3)
    }
    if (json) {
      process.stderr.write(JSON.stringify({ error: { code: 1, message: err.message } }) + '\n')
    } else {
      console.error(`Error: ${err.message}`)
    }
    process.exit(1)
  }

  // Unknown error
  const msg = err instanceof Error ? err.message : String(err)
  if (json) {
    process.stderr.write(JSON.stringify({ error: { code: 1, message: msg } }) + '\n')
  } else {
    console.error(`Error: ${msg}`)
  }
  process.exit(1)
}
