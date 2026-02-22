/**
 * Firecrawl Web Scraping Client
 *
 * Provides scrape, crawl, and extract operations via the Firecrawl API.
 * Supports both Firecrawl Cloud and self-hosted instances.
 * Uses raw fetch() for consistency with other integration clients.
 */

const FIRECRAWL_CLOUD_BASE_URL = 'https://api.firecrawl.dev'

/** Maximum content size per page (500KB) */
const MAX_CONTENT_BYTES = 500 * 1024

/** Maximum pages per crawl operation */
const MAX_CRAWL_PAGES = 20

/** Maximum polling duration for async crawl (45s — leave headroom for setup/response under Vercel's 60s limit) */
const MAX_POLL_DURATION_MS = 45_000

/** Polling interval for crawl status checks */
const POLL_INTERVAL_MS = 2_000

// ============================================
// Error classes (follows Attio pattern)
// ============================================

export class FirecrawlError extends Error {
  statusCode?: number
  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'FirecrawlError'
    this.statusCode = statusCode
  }
}

export class FirecrawlAuthError extends FirecrawlError {
  constructor(message: string) {
    super(message, 401)
    this.name = 'FirecrawlAuthError'
  }
}

export class FirecrawlRateLimitError extends FirecrawlError {
  retryAfter: number
  constructor(message: string, retryAfter: number = 60) {
    super(message, 429)
    this.name = 'FirecrawlRateLimitError'
    this.retryAfter = retryAfter
  }
}

export class FirecrawlPaymentError extends FirecrawlError {
  constructor(message: string) {
    super(message, 402)
    this.name = 'FirecrawlPaymentError'
  }
}

// ============================================
// Types
// ============================================

export interface FirecrawlClientConfig {
  apiKey: string
  mode: 'cloud' | 'self_hosted'
  baseUrl?: string
  proxy?: 'basic' | 'stealth' | null
  defaultTimeout?: number
}

export interface ScrapeOptions {
  formats?: string[]
  onlyMainContent?: boolean
  includeTags?: string[]
  excludeTags?: string[]
  timeout?: number
  waitFor?: number
  mobile?: boolean
  headers?: Record<string, string>
}

export interface ScrapeMetadata {
  title?: string
  description?: string
  sourceURL?: string
  statusCode?: number
}

export interface ScrapeResult {
  markdown?: string
  html?: string
  links?: string[]
  metadata?: ScrapeMetadata
  truncated?: boolean
}

export interface ScrapeResponse {
  success: boolean
  data: ScrapeResult
}

export interface CrawlOptions {
  maxPages?: number
  maxDepth?: number
  formats?: string[]
  onlyMainContent?: boolean
  excludePatterns?: string[]
  includePatterns?: string[]
}

export interface CrawlResponse {
  success: boolean
  status: string
  completed: number
  total: number
  data: ScrapeResult[]
}

export interface ExtractOptions {
  schema?: Record<string, unknown>
  prompt?: string
  timeout?: number
}

export interface ExtractResponse {
  success: boolean
  data: Record<string, unknown>
}

// ============================================
// Client
// ============================================

export class FirecrawlClient {
  private apiKey: string
  private baseUrl: string
  private proxy: 'basic' | 'stealth' | null
  private defaultTimeout: number

  constructor(config: FirecrawlClientConfig) {
    if (!config.apiKey) {
      throw new FirecrawlError('Firecrawl API key is required')
    }

    this.apiKey = config.apiKey
    this.proxy = config.proxy ?? null
    this.defaultTimeout = config.defaultTimeout ?? 30_000

    if (config.mode === 'self_hosted') {
      if (!config.baseUrl) {
        throw new FirecrawlError('Base URL is required for self-hosted mode')
      }
      this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    } else {
      this.baseUrl = FIRECRAWL_CLOUD_BASE_URL
    }
  }

  /**
   * Single-page scrape — returns markdown, html, links, and metadata.
   */
  async scrape(url: string, opts: ScrapeOptions = {}): Promise<ScrapeResponse> {
    const body: Record<string, unknown> = {
      url,
      formats: opts.formats ?? ['markdown'],
      onlyMainContent: opts.onlyMainContent ?? true,
    }

    if (this.proxy) body.proxy = this.proxy
    if (opts.includeTags) body.includeTags = opts.includeTags
    if (opts.excludeTags) body.excludeTags = opts.excludeTags
    if (opts.timeout) body.timeout = opts.timeout
    if (opts.waitFor) body.waitFor = opts.waitFor
    if (opts.mobile !== undefined) body.mobile = opts.mobile
    if (opts.headers) body.headers = opts.headers

    const response = await this.request<{
      success: boolean
      data: ScrapeResult
    }>('/v1/scrape', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (response.data) {
      response.data = this.truncateContent(response.data)
    }

    return response
  }

  /**
   * Multi-page crawl — starts an async crawl job and polls until completion or timeout.
   * Returns partial results if the crawl doesn't finish within the polling window.
   */
  async crawl(url: string, opts: CrawlOptions = {}): Promise<CrawlResponse> {
    const maxPages = Math.min(opts.maxPages ?? 10, MAX_CRAWL_PAGES)

    const body: Record<string, unknown> = {
      url,
      limit: maxPages,
      scrapeOptions: {
        formats: opts.formats ?? ['markdown'],
        onlyMainContent: opts.onlyMainContent ?? true,
      },
    }

    if (this.proxy) body.proxy = this.proxy
    if (opts.maxDepth) body.maxDepth = opts.maxDepth
    if (opts.excludePatterns) body.excludePaths = opts.excludePatterns
    if (opts.includePatterns) body.includePaths = opts.includePatterns

    // Start the crawl — returns a job ID
    const startResponse = await this.request<{
      success: boolean
      id: string
    }>('/v1/crawl', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!startResponse.success || !startResponse.id) {
      return { success: false, status: 'failed', completed: 0, total: 0, data: [] }
    }

    // Poll for completion
    const pollStart = Date.now()

    while (Date.now() - pollStart < MAX_POLL_DURATION_MS) {
      await sleep(POLL_INTERVAL_MS)

      const status = await this.request<{
        success: boolean
        status: string
        completed: number
        total: number
        data: ScrapeResult[]
      }>(`/v1/crawl/${startResponse.id}`, { method: 'GET' })

      if (status.status === 'completed') {
        return {
          ...status,
          data: (status.data || []).map(d => this.truncateContent(d)),
        }
      }

      if (status.status === 'failed') {
        return { success: false, status: 'failed', completed: 0, total: status.total || 0, data: [] }
      }
    }

    // Timeout — try to get partial results
    const partial = await this.request<{
      success: boolean
      status: string
      completed: number
      total: number
      data: ScrapeResult[]
    }>(`/v1/crawl/${startResponse.id}`, { method: 'GET' })

    return {
      ...partial,
      data: (partial.data || []).map(d => this.truncateContent(d)),
    }
  }

  /**
   * AI-powered structured data extraction from URLs.
   */
  async extract(urls: string[], opts: ExtractOptions = {}): Promise<ExtractResponse> {
    const body: Record<string, unknown> = { urls }

    if (opts.schema) body.schema = opts.schema
    if (opts.prompt) body.prompt = opts.prompt
    if (opts.timeout) body.timeout = opts.timeout

    return this.request<ExtractResponse>('/v1/extract', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  /**
   * Test the connection by hitting a read-only endpoint.
   *
   * Uses GET /v1/crawl (list crawl jobs) which requires valid auth but
   * does NOT consume any scrape credits — unlike the old approach of
   * scraping example.com.
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request<{ success: boolean }>('/v1/crawl', { method: 'GET' })
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  }

  // ============================================
  // Private helpers
  // ============================================

  private async request<T>(endpoint: string, options: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const response = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(this.defaultTimeout),
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      await this.handleErrorResponse(response)
    }

    return response.json()
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorBody: { error?: string; message?: string } = {}
    try {
      errorBody = await response.json()
    } catch {
      // Ignore JSON parse errors
    }

    const errorMessage = errorBody.error || errorBody.message || response.statusText

    switch (response.status) {
      case 401:
      case 403:
        throw new FirecrawlAuthError(`Authentication failed: ${errorMessage}`)
      case 402:
        throw new FirecrawlPaymentError(`Payment required: ${errorMessage}`)
      case 429: {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10)
        throw new FirecrawlRateLimitError(`Rate limit exceeded: ${errorMessage}`, retryAfter)
      }
      default:
        throw new FirecrawlError(`Firecrawl API error (${response.status}): ${errorMessage}`, response.status)
    }
  }

  /**
   * Truncate markdown/html content to MAX_CONTENT_BYTES (500KB) per page.
   */
  private truncateContent(data: ScrapeResult): ScrapeResult {
    let truncated = false
    let markdown = data.markdown
    let html = data.html

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    if (markdown) {
      const encoded = encoder.encode(markdown)
      if (encoded.byteLength > MAX_CONTENT_BYTES) {
        markdown = decoder.decode(encoded.slice(0, MAX_CONTENT_BYTES))
        truncated = true
      }
    }

    if (html) {
      const encoded = encoder.encode(html)
      if (encoded.byteLength > MAX_CONTENT_BYTES) {
        html = decoder.decode(encoded.slice(0, MAX_CONTENT_BYTES))
        truncated = true
      }
    }

    if (!truncated) return data

    return { ...data, markdown, html, truncated: true }
  }
}

// ============================================
// Factory function
// ============================================

export function createFirecrawlClient(config: FirecrawlClientConfig): FirecrawlClient {
  return new FirecrawlClient(config)
}

// ============================================
// Helpers
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
