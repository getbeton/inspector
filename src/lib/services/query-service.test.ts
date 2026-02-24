import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryService, createQueryServiceForAgent, type QueryServiceDependencies } from './query-service'
import { QueryValidator } from './query-validator'
import { RateLimiter, type RateLimitStatus } from './rate-limiter'
import { QueryRepository } from '../repositories/query-repository'
import { ResultRepository } from '../repositories/result-repository'
import {
  RateLimitError,
  TimeoutError,
  InvalidQueryError,
  PostHogAPIError,
} from '../errors/query-errors'
import type { PosthogQuery, PosthogQueryResult } from '../types/posthog-query'

// Mock PostHog client
const createMockPostHogClient = () => ({
  query: vi.fn(),
})

// Mock Supabase client
const createMockSupabase = () => ({})

// Mock repositories
const createMockQueryRepository = () => ({
  create: vi.fn(),
  update: vi.fn(),
  findById: vi.fn(),
  findByWorkspaceId: vi.fn(),
  delete: vi.fn(),
  countQueriesInLastHour: vi.fn(),
})

const createMockResultRepository = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findByQueryId: vi.fn(),
  getCached: vi.fn(),
  delete: vi.fn(),
  deleteExpired: vi.fn(),
})

// Default rate limit status for tests
const defaultRateLimitStatus: RateLimitStatus = {
  used: 100,
  limit: 2400,
  remaining: 2300,
  isLimited: false,
  isWarning: false,
  resetAt: new Date(Date.now() + 3600000),
}

describe('QueryService', () => {
  let queryService: QueryService
  let mockPostHogClient: ReturnType<typeof createMockPostHogClient>
  let mockQueryRepository: ReturnType<typeof createMockQueryRepository>
  let mockResultRepository: ReturnType<typeof createMockResultRepository>
  let mockValidator: QueryValidator
  let mockRateLimiter: { checkRateLimit: ReturnType<typeof vi.fn>; getRateLimitStatus: ReturnType<typeof vi.fn> }

  const workspaceId = 'workspace-123'
  const validQuery = 'SELECT event, count() FROM events GROUP BY event'

  beforeEach(() => {
    mockPostHogClient = createMockPostHogClient()
    mockQueryRepository = createMockQueryRepository()
    mockResultRepository = createMockResultRepository()

    mockValidator = new QueryValidator()

    mockRateLimiter = {
      checkRateLimit: vi.fn().mockResolvedValue(defaultRateLimitStatus),
      getRateLimitStatus: vi.fn().mockResolvedValue(defaultRateLimitStatus),
    }

    const deps: QueryServiceDependencies = {
      supabase: createMockSupabase() as any,
      posthogClient: mockPostHogClient as any,
      validator: mockValidator,
      rateLimiter: mockRateLimiter as unknown as RateLimiter,
      queryRepository: mockQueryRepository as unknown as QueryRepository,
      resultRepository: mockResultRepository as unknown as ResultRepository,
    }

    queryService = new QueryService(deps)
  })

  describe('execute', () => {
    describe('cache hit', () => {
      it('returns cached results when available', async () => {
        const cachedResult: PosthogQueryResult = {
          id: 'result-123',
          query_id: 'query-123',
          workspace_id: workspaceId,
          query_hash: 'hash-123',
          columns: ['event', 'count'],
          results: [['pageview', 100], ['click', 50]],
          row_count: 2,
          cached_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        }

        mockResultRepository.getCached.mockResolvedValue(cachedResult)

        const response = await queryService.execute(workspaceId, validQuery)

        expect(response.cached).toBe(true)
        expect(response.results.columns).toEqual(['event', 'count'])
        expect(response.results.results).toEqual([['pageview', 100], ['click', 50]])
        expect(response.queryId).toBe('query-123')
        expect(mockPostHogClient.query).not.toHaveBeenCalled()
        expect(mockQueryRepository.create).not.toHaveBeenCalled()
      })

      it('skips cache when skipCache option is true', async () => {
        const queryRecord: PosthogQuery = {
          id: 'query-456',
          workspace_id: workspaceId,
          query_text: validQuery,
          query_hash: 'hash-456',
          status: 'pending',
          execution_time_ms: null,
          error_message: null,
          created_at: new Date().toISOString(),
          started_at: null,
          completed_at: null,
        }

        mockResultRepository.getCached.mockResolvedValue({
          id: 'cached-result',
          query_id: 'old-query',
          // ... cached result
        })
        mockQueryRepository.create.mockResolvedValue(queryRecord)
        mockPostHogClient.query.mockResolvedValue({
          columns: ['event'],
          results: [['fresh-data']],
        })
        mockResultRepository.create.mockResolvedValue({
          id: 'new-result',
          query_id: 'query-456',
          workspace_id: workspaceId,
          query_hash: 'hash-456',
          columns: ['event'],
          results: [['fresh-data']],
          row_count: 1,
          cached_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          expires_at: new Date().toISOString(),
        })

        const response = await queryService.execute(workspaceId, validQuery, {
          skipCache: true,
        })

        expect(response.cached).toBe(false)
        expect(mockResultRepository.getCached).not.toHaveBeenCalled()
        expect(mockPostHogClient.query).toHaveBeenCalled()
      })
    })

    describe('cache miss', () => {
      it('executes query against PostHog and stores results', async () => {
        const queryRecord: PosthogQuery = {
          id: 'query-789',
          workspace_id: workspaceId,
          query_text: validQuery,
          query_hash: 'hash-789',
          status: 'pending',
          execution_time_ms: null,
          error_message: null,
          created_at: new Date().toISOString(),
          started_at: null,
          completed_at: null,
        }

        const posthogResult = {
          columns: ['event', 'count'],
          results: [['signup', 25], ['login', 150]],
        }

        mockResultRepository.getCached.mockResolvedValue(null)
        mockQueryRepository.create.mockResolvedValue(queryRecord)
        mockPostHogClient.query.mockResolvedValue(posthogResult)
        mockResultRepository.create.mockResolvedValue({
          id: 'result-789',
          query_id: 'query-789',
          workspace_id: workspaceId,
          query_hash: 'hash-789',
          columns: posthogResult.columns,
          results: posthogResult.results,
          row_count: 2,
          cached_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          expires_at: new Date().toISOString(),
        })

        const response = await queryService.execute(workspaceId, validQuery)

        expect(response.cached).toBe(false)
        expect(response.results.columns).toEqual(['event', 'count'])
        expect(response.results.results).toEqual([['signup', 25], ['login', 150]])
        expect(mockQueryRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            workspace_id: workspaceId,
            query_text: validQuery,
            status: 'pending',
          })
        )
        expect(mockPostHogClient.query).toHaveBeenCalledWith(validQuery, { timeoutMs: 60000 })
        expect(mockResultRepository.create).toHaveBeenCalled()
        expect(mockQueryRepository.update).toHaveBeenCalledWith('query-789', { status: 'running', started_at: expect.any(String) })
        expect(mockQueryRepository.update).toHaveBeenCalledWith('query-789', { status: 'completed', completed_at: expect.any(String) })
      })
    })

    describe('validation error', () => {
      it('throws InvalidQueryError for empty query', async () => {
        await expect(queryService.execute(workspaceId, '')).rejects.toThrow(
          InvalidQueryError
        )
        expect(mockRateLimiter.checkRateLimit).not.toHaveBeenCalled()
        expect(mockPostHogClient.query).not.toHaveBeenCalled()
      })

      it('throws InvalidQueryError for non-SELECT query', async () => {
        await expect(
          queryService.execute(workspaceId, 'INSERT INTO events VALUES (1)')
        ).rejects.toThrow(InvalidQueryError)
      })

      it('throws InvalidQueryError for dangerous keywords', async () => {
        await expect(
          queryService.execute(workspaceId, 'SELECT * FROM events; DROP TABLE events')
        ).rejects.toThrow(InvalidQueryError)
      })
    })

    describe('rate limit error', () => {
      it('throws RateLimitError when limit exceeded', async () => {
        const rateLimitError = new RateLimitError({
          resetAt: new Date(Date.now() + 3600000),
          limit: 2400,
          remaining: 0,
        })

        mockRateLimiter.checkRateLimit.mockRejectedValue(rateLimitError)

        await expect(queryService.execute(workspaceId, validQuery)).rejects.toThrow(
          RateLimitError
        )
        expect(mockPostHogClient.query).not.toHaveBeenCalled()
        expect(mockQueryRepository.create).not.toHaveBeenCalled()
      })

      it('fails open on unexpected rate limit errors', async () => {
        mockRateLimiter.checkRateLimit.mockRejectedValue(new Error('Database error'))

        const queryRecord: PosthogQuery = {
          id: 'query-fail-open',
          workspace_id: workspaceId,
          query_text: validQuery,
          query_hash: 'hash',
          status: 'pending',
          execution_time_ms: null,
          error_message: null,
          created_at: new Date().toISOString(),
          started_at: null,
          completed_at: null,
        }

        mockResultRepository.getCached.mockResolvedValue(null)
        mockQueryRepository.create.mockResolvedValue(queryRecord)
        mockPostHogClient.query.mockResolvedValue({
          columns: ['event'],
          results: [['test']],
        })
        mockResultRepository.create.mockResolvedValue({
          id: 'result',
          query_id: 'query-fail-open',
          workspace_id: workspaceId,
          query_hash: 'hash',
          columns: ['event'],
          results: [['test']],
          row_count: 1,
          cached_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          expires_at: new Date().toISOString(),
        })

        // Should not throw, should fail-open
        const response = await queryService.execute(workspaceId, validQuery)
        expect(response).toBeDefined()
        expect(mockPostHogClient.query).toHaveBeenCalled()
      })
    })

    describe('timeout error', () => {
      it('handles timeout and updates query status', async () => {
        const queryRecord: PosthogQuery = {
          id: 'query-timeout',
          workspace_id: workspaceId,
          query_text: validQuery,
          query_hash: 'hash-timeout',
          status: 'pending',
          execution_time_ms: null,
          error_message: null,
          created_at: new Date().toISOString(),
          started_at: null,
          completed_at: null,
        }

        mockResultRepository.getCached.mockResolvedValue(null)
        mockQueryRepository.create.mockResolvedValue(queryRecord)
        mockPostHogClient.query.mockRejectedValue(new TimeoutError(60000))

        await expect(queryService.execute(workspaceId, validQuery)).rejects.toThrow(
          TimeoutError
        )

        expect(mockQueryRepository.update).toHaveBeenCalledWith(
          'query-timeout',
          expect.objectContaining({
            status: 'timeout',
            error_message: expect.stringContaining('timed out'),
          })
        )
      })
    })

    describe('PostHog API error', () => {
      it('handles API error and updates query status', async () => {
        const queryRecord: PosthogQuery = {
          id: 'query-api-error',
          workspace_id: workspaceId,
          query_text: validQuery,
          query_hash: 'hash-api-error',
          status: 'pending',
          execution_time_ms: null,
          error_message: null,
          created_at: new Date().toISOString(),
          started_at: null,
          completed_at: null,
        }

        mockResultRepository.getCached.mockResolvedValue(null)
        mockQueryRepository.create.mockResolvedValue(queryRecord)
        mockPostHogClient.query.mockRejectedValue(
          new PostHogAPIError({
            message: 'Invalid query syntax',
            statusCode: 400,
          })
        )

        await expect(queryService.execute(workspaceId, validQuery)).rejects.toThrow(
          PostHogAPIError
        )

        expect(mockQueryRepository.update).toHaveBeenCalledWith(
          'query-api-error',
          expect.objectContaining({
            status: 'failed',
            error_message: expect.stringContaining('PostHog API error'),
          })
        )
      })
    })
  })

  describe('calculateQueryHash', () => {
    it('returns consistent hash for same query', () => {
      const hash1 = queryService.calculateQueryHash('SELECT * FROM events')
      const hash2 = queryService.calculateQueryHash('SELECT * FROM events')

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA256 hex length
    })

    it('normalizes whitespace for consistent hashing', () => {
      const hash1 = queryService.calculateQueryHash('SELECT * FROM events')
      const hash2 = queryService.calculateQueryHash('  SELECT   *   FROM   events  ')

      expect(hash1).toBe(hash2)
    })

    it('normalizes case for consistent hashing', () => {
      const hash1 = queryService.calculateQueryHash('SELECT * FROM events')
      const hash2 = queryService.calculateQueryHash('select * from EVENTS')

      expect(hash1).toBe(hash2)
    })

    it('returns different hash for different queries', () => {
      const hash1 = queryService.calculateQueryHash('SELECT * FROM events')
      const hash2 = queryService.calculateQueryHash('SELECT * FROM persons')

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('validateQuery', () => {
    it('returns valid:true for valid SELECT query', () => {
      const result = queryService.validateQuery('SELECT event FROM events')

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('returns valid:false for invalid query', () => {
      const result = queryService.validateQuery('')

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('getRateLimitStatus', () => {
    it('returns rate limit status for workspace', async () => {
      const status = await queryService.getRateLimitStatus(workspaceId)

      expect(mockRateLimiter.getRateLimitStatus).toHaveBeenCalledWith(workspaceId)
      expect(status).toEqual(defaultRateLimitStatus)
    })
  })

  describe('session_id linkage', () => {
    const sessionUUID = 'session-uuid-123'

    it('passes session_id to query record when sessionId option is provided', async () => {
      const queryRecord: PosthogQuery = {
        id: 'query-session',
        workspace_id: workspaceId,
        session_id: sessionUUID,
        query_text: validQuery,
        query_hash: 'hash-session',
        status: 'pending',
        execution_time_ms: null,
        error_message: null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
      }

      mockResultRepository.getCached.mockResolvedValue(null)
      mockQueryRepository.create.mockResolvedValue(queryRecord)
      mockPostHogClient.query.mockResolvedValue({
        columns: ['event'],
        results: [['test']],
      })
      mockResultRepository.create.mockResolvedValue({
        id: 'result-session',
        query_id: 'query-session',
        workspace_id: workspaceId,
        session_id: sessionUUID,
        query_hash: 'hash-session',
        columns: ['event'],
        results: [['test']],
        row_count: 1,
        cached_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        expires_at: new Date().toISOString(),
      })

      await queryService.execute(workspaceId, validQuery, { sessionId: sessionUUID })

      expect(mockQueryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: sessionUUID,
        })
      )
      expect(mockResultRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: sessionUUID,
        })
      )
    })

    it('omits session_id when sessionId option is not provided (user query path)', async () => {
      const queryRecord: PosthogQuery = {
        id: 'query-user',
        workspace_id: workspaceId,
        query_text: validQuery,
        query_hash: 'hash-user',
        status: 'pending',
        execution_time_ms: null,
        error_message: null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
      }

      mockResultRepository.getCached.mockResolvedValue(null)
      mockQueryRepository.create.mockResolvedValue(queryRecord)
      mockPostHogClient.query.mockResolvedValue({
        columns: ['event'],
        results: [['test']],
      })
      mockResultRepository.create.mockResolvedValue({
        id: 'result-user',
        query_id: 'query-user',
        workspace_id: workspaceId,
        query_hash: 'hash-user',
        columns: ['event'],
        results: [['test']],
        row_count: 1,
        cached_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        expires_at: new Date().toISOString(),
      })

      await queryService.execute(workspaceId, validQuery)

      // Should NOT include session_id in the create payload
      const createCall = mockQueryRepository.create.mock.calls[0][0]
      expect(createCall).not.toHaveProperty('session_id')

      const resultCreateCall = mockResultRepository.create.mock.calls[0][0]
      expect(resultCreateCall).not.toHaveProperty('session_id')
    })

    it('session_id linkage survives even when session terminates during execution (benign race)', async () => {
      // Documents expected behavior: in-flight queries complete and are recorded
      // with session_id even if the session transitions to terminal state mid-flight.
      const queryRecord: PosthogQuery = {
        id: 'query-race',
        workspace_id: workspaceId,
        session_id: sessionUUID,
        query_text: validQuery,
        query_hash: 'hash-race',
        status: 'pending',
        execution_time_ms: null,
        error_message: null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
      }

      mockResultRepository.getCached.mockResolvedValue(null)
      mockQueryRepository.create.mockResolvedValue(queryRecord)
      mockPostHogClient.query.mockResolvedValue({
        columns: ['event'],
        results: [['data']],
      })
      mockResultRepository.create.mockResolvedValue({
        id: 'result-race',
        query_id: 'query-race',
        workspace_id: workspaceId,
        session_id: sessionUUID,
        query_hash: 'hash-race',
        columns: ['event'],
        results: [['data']],
        row_count: 1,
        cached_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        expires_at: new Date().toISOString(),
      })

      // Execute with session — the session may have completed mid-flight
      // but the query should still record session_id successfully
      const response = await queryService.execute(workspaceId, validQuery, {
        sessionId: sessionUUID,
      })

      expect(response).toBeDefined()
      expect(response.cached).toBe(false)
      expect(mockQueryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ session_id: sessionUUID })
      )
    })
  })

  describe('createQueryServiceForAgent', () => {
    it('creates a QueryService instance with the provided admin client', () => {
      const adminClient = createMockSupabase()
      const posthogClient = createMockPostHogClient()

      const service = createQueryServiceForAgent(adminClient as any, posthogClient as any)

      expect(service).toBeInstanceOf(QueryService)
    })
  })
})
