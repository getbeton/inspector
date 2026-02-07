/**
 * QueryService - Main orchestration for PostHog query execution
 *
 * Execution flow:
 * 1. Validate query syntax and security
 * 2. Check workspace rate limit
 * 3. Calculate query hash for caching
 * 4. Check cache for existing results
 * 5. Execute against PostHog if cache miss
 * 6. Store results and update query status
 * 7. Return results to caller
 */

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PostHogClient, QueryResult } from '../integrations/posthog/client'
import { QueryValidator, type ValidationResult } from './query-validator'
import { RateLimiter, type RateLimitStatus } from './rate-limiter'
import { QueryRepository } from '../repositories/query-repository'
import { ResultRepository } from '../repositories/result-repository'
import {
  QueryError,
  RateLimitError,
  TimeoutError,
  InvalidQueryError,
  PostHogAPIError,
  isTimeoutError,
  isRateLimitError,
} from '../errors/query-errors'
import type {
  PosthogQuery,
  PosthogQueryResult,
  PosthogQueryStatus,
  QueryExecutionResult,
} from '../types/posthog-query'

/** Default cache TTL in milliseconds (1 hour) */
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000

/** Query execution options */
export interface QueryExecutionOptions {
  /** Timeout in milliseconds (default: 60000) */
  timeoutMs?: number
  /** Whether to skip cache lookup (default: false) */
  skipCache?: boolean
  /** Cache TTL in milliseconds (default: 3600000 = 1 hour) */
  cacheTtlMs?: number
}

/** Query execution response */
export interface QueryExecutionResponse {
  /** Query execution results */
  results: QueryExecutionResult
  /** Whether results came from cache */
  cached: boolean
  /** Query record ID */
  queryId: string
  /** Rate limit status after execution */
  rateLimitStatus: RateLimitStatus
}

/** Dependencies for QueryService */
export interface QueryServiceDependencies {
  supabase: SupabaseClient
  posthogClient: PostHogClient
  validator?: QueryValidator
  rateLimiter?: RateLimiter
  queryRepository?: QueryRepository
  resultRepository?: ResultRepository
}

/**
 * QueryService orchestrates the complete query execution flow
 */
export class QueryService {
  private supabase: SupabaseClient
  private posthogClient: PostHogClient
  private validator: QueryValidator
  private rateLimiter: RateLimiter
  private queryRepository: QueryRepository
  private resultRepository: ResultRepository

  constructor(deps: QueryServiceDependencies) {
    this.supabase = deps.supabase
    this.posthogClient = deps.posthogClient
    this.validator = deps.validator ?? new QueryValidator()
    this.rateLimiter = deps.rateLimiter ?? new RateLimiter(deps.supabase)
    this.queryRepository = deps.queryRepository ?? new QueryRepository(deps.supabase)
    this.resultRepository = deps.resultRepository ?? new ResultRepository(deps.supabase)
  }

  /**
   * Execute a HogQL query with full orchestration
   *
   * @param workspaceId - Workspace UUID for RLS and rate limiting
   * @param queryText - HogQL query to execute
   * @param options - Execution options
   * @returns Query execution response with results and metadata
   * @throws InvalidQueryError if query validation fails
   * @throws RateLimitError if workspace rate limit exceeded
   * @throws TimeoutError if query exceeds timeout
   * @throws PostHogAPIError if PostHog API fails
   */
  async execute(
    workspaceId: string,
    queryText: string,
    options: QueryExecutionOptions = {}
  ): Promise<QueryExecutionResponse> {
    const {
      timeoutMs = 60_000,
      skipCache = false,
      cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    } = options

    // Step 1: Validate query
    const validationResult = this.validateQuery(queryText)
    if (!validationResult.valid) {
      throw new InvalidQueryError(validationResult.errors.join('; '))
    }

    // Step 2: Check rate limit
    const rateLimitStatus = await this.checkRateLimit(workspaceId)

    // Step 3: Calculate query hash
    const queryHash = this.calculateQueryHash(queryText)

    // Step 4: Check cache (unless skipCache)
    if (!skipCache) {
      const cachedResult = await this.checkCache(workspaceId, queryHash)
      if (cachedResult) {
        console.log(`[QueryService] Cache hit for query hash: ${queryHash.substring(0, 8)}...`)
        return {
          results: this.formatCachedResult(cachedResult),
          cached: true,
          queryId: cachedResult.query_id,
          rateLimitStatus,
        }
      }
    }

    // Step 5: Create query record
    const queryRecord = await this.createQueryRecord(workspaceId, queryText, queryHash)

    try {
      // Step 6: Execute against PostHog
      console.log(`[QueryService] Executing query against PostHog (timeout: ${timeoutMs}ms)`)
      await this.updateQueryStatus(queryRecord.id, 'running')

      const startTime = Date.now()
      const posthogResult = await this.executePostHogQuery(queryText, timeoutMs)
      const executionTimeMs = Date.now() - startTime

      // Step 7: Store results
      const storedResult = await this.storeResults(
        queryRecord.id,
        workspaceId,
        queryHash,
        posthogResult,
        cacheTtlMs
      )

      // Step 8: Update query status to completed with execution time
      await this.updateQueryStatus(queryRecord.id, 'completed')
      await this.queryRepository.update(queryRecord.id, { execution_time_ms: executionTimeMs })

      // Step 9: Return results
      return {
        results: this.formatResult(storedResult, posthogResult, executionTimeMs),
        cached: false,
        queryId: queryRecord.id,
        rateLimitStatus,
      }
    } catch (error) {
      // Handle execution errors
      await this.handleExecutionError(queryRecord.id, error)
      throw error
    }
  }

  /**
   * Validate a query without executing it
   */
  validateQuery(queryText: string): ValidationResult {
    return this.validator.validateSafe(queryText)
  }

  /**
   * Get current rate limit status for a workspace
   */
  async getRateLimitStatus(workspaceId: string): Promise<RateLimitStatus> {
    return this.rateLimiter.getRateLimitStatus(workspaceId)
  }

  /**
   * Calculate SHA256 hash for query caching
   */
  calculateQueryHash(queryText: string): string {
    // Normalize query: trim whitespace and convert to lowercase for consistent hashing
    const normalized = queryText.trim().toLowerCase().replace(/\s+/g, ' ')
    return createHash('sha256').update(normalized).digest('hex')
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Check rate limit and throw if exceeded
   */
  private async checkRateLimit(workspaceId: string): Promise<RateLimitStatus> {
    try {
      return await this.rateLimiter.checkRateLimit(workspaceId)
    } catch (error) {
      if (isRateLimitError(error)) {
        throw error
      }
      // Log unexpected errors but don't block (fail-open)
      console.error('[QueryService] Unexpected rate limit check error:', error)
      return {
        used: 0,
        limit: 2400,
        remaining: 2400,
        isLimited: false,
        isWarning: false,
        resetAt: new Date(Date.now() + 3600000),
      }
    }
  }

  /**
   * Check cache for existing results
   */
  private async checkCache(
    workspaceId: string,
    queryHash: string
  ): Promise<PosthogQueryResult | null> {
    try {
      return await this.resultRepository.getCached(workspaceId, queryHash)
    } catch (error) {
      // Log cache errors but don't fail the request
      console.error('[QueryService] Cache lookup error:', error)
      return null
    }
  }

  /**
   * Create a new query record
   */
  private async createQueryRecord(
    workspaceId: string,
    queryText: string,
    queryHash: string
  ): Promise<PosthogQuery> {
    return this.queryRepository.create({
      workspace_id: workspaceId,
      query_text: queryText,
      query_hash: queryHash,
      status: 'pending',
    })
  }

  /**
   * Update query status
   */
  private async updateQueryStatus(
    queryId: string,
    status: PosthogQueryStatus,
    errorMessage?: string
  ): Promise<void> {
    const updates: Partial<PosthogQuery> = { status }

    if (status === 'running') {
      updates.started_at = new Date().toISOString()
    } else if (status === 'completed' || status === 'failed' || status === 'timeout') {
      updates.completed_at = new Date().toISOString()
    }

    if (errorMessage) {
      updates.error_message = errorMessage
    }

    await this.queryRepository.update(queryId, updates)
  }

  /**
   * Execute query against PostHog with timeout
   */
  private async executePostHogQuery(
    queryText: string,
    timeoutMs: number
  ): Promise<QueryResult> {
    return this.posthogClient.query(queryText, { timeoutMs })
  }

  /**
   * Store query results in the database
   */
  private async storeResults(
    queryId: string,
    workspaceId: string,
    queryHash: string,
    result: QueryResult,
    cacheTtlMs: number
  ): Promise<PosthogQueryResult> {
    const expiresAt = new Date(Date.now() + cacheTtlMs)

    return this.resultRepository.create({
      query_id: queryId,
      workspace_id: workspaceId,
      query_hash: queryHash,
      columns: result.columns,
      results: result.results,
      row_count: result.results.length,
      expires_at: expiresAt.toISOString(),
    })
  }

  /**
   * Format cached result for response
   * Note: execution_time_ms is 0 for cached results (instant return)
   */
  private formatCachedResult(cachedResult: PosthogQueryResult): QueryExecutionResult {
    return {
      query_id: cachedResult.query_id,
      status: 'completed',
      execution_time_ms: 0, // Cached results return instantly
      row_count: cachedResult.row_count,
      columns: cachedResult.columns,
      results: cachedResult.results as unknown[][],
      cached: true,
    }
  }

  /**
   * Format fresh result for response
   */
  private formatResult(
    storedResult: PosthogQueryResult,
    posthogResult: QueryResult,
    executionTimeMs: number
  ): QueryExecutionResult {
    return {
      query_id: storedResult.query_id,
      status: 'completed',
      execution_time_ms: executionTimeMs,
      row_count: posthogResult.results.length,
      columns: posthogResult.columns,
      results: posthogResult.results,
      cached: false,
    }
  }

  /**
   * Handle execution errors and update query status
   */
  private async handleExecutionError(queryId: string, error: unknown): Promise<void> {
    let status: PosthogQueryStatus = 'failed'
    let errorMessage = 'Unknown error'

    if (isTimeoutError(error)) {
      status = 'timeout'
      errorMessage = `Query timed out after ${error.timeoutMs}ms`
    } else if (error instanceof PostHogAPIError) {
      errorMessage = `PostHog API error: ${error.message}`
      if (error.statusCode) {
        errorMessage += ` (status: ${error.statusCode})`
      }
    } else if (error instanceof QueryError) {
      errorMessage = error.message
    } else if (error instanceof Error) {
      errorMessage = error.message
    }

    console.error(`[QueryService] Query ${queryId} failed:`, errorMessage)

    try {
      await this.updateQueryStatus(queryId, status, errorMessage)
    } catch (updateError) {
      console.error('[QueryService] Failed to update query status:', updateError)
    }
  }
}

/**
 * Factory function to create a QueryService
 */
export function createQueryService(
  supabase: SupabaseClient,
  posthogClient: PostHogClient
): QueryService {
  return new QueryService({ supabase, posthogClient })
}
