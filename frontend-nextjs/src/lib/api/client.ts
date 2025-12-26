/**
 * FastAPI HTTP Client
 * Wrapper around fetch for making API calls to the backend
 * Handles authentication via session cookies
 */

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  useMockData?: boolean
  headers?: Record<string, string>
  cache?: RequestCache
}

class APIClient {
  private baseURL: string

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  }

  /**
   * Make an API request
   * @param endpoint - API endpoint path (e.g., '/api/signals/list')
   * @param options - Request options
   * @returns Parsed JSON response
   */
  async request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { method = 'GET', body, useMockData = false, headers = {}, cache = 'no-store' } = options

    const url = new URL(endpoint, this.baseURL)

    // Add mock_mode parameter if needed
    if (useMockData) {
      url.searchParams.set('mock_mode', 'true')
    }

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include', // Include cookies (beton_session)
        cache
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new APIError(
          errorData.detail || `API Error: ${response.status}`,
          response.status,
          errorData
        )
      }

      return await response.json()
    } catch (error) {
      if (error instanceof APIError) {
        throw error
      }

      if (error instanceof TypeError) {
        throw new APIError('Network error. Check your connection.', 0, error)
      }

      throw new APIError(
        error instanceof Error ? error.message : 'Unknown error',
        0,
        error
      )
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, options?: Omit<FetchOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' })
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, body?: any, options?: Omit<FetchOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body })
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, body?: any, options?: Omit<FetchOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body })
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, options?: Omit<FetchOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' })
  }
}

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message)
    this.name = 'APIError'
  }
}

export const apiClient = new APIClient()
