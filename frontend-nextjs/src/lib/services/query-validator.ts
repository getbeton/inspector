/**
 * Query Validator Service
 * Security layer for validating HogQL queries before execution
 */

import { InvalidQueryError } from '../errors/query-errors'

/**
 * Maximum allowed query length (10,000 characters)
 */
const MAX_QUERY_LENGTH = 10_000

/**
 * Dangerous SQL keywords that could modify data or schema
 */
const DANGEROUS_KEYWORDS = [
  'DROP',
  'DELETE',
  'TRUNCATE',
  'ALTER',
  'CREATE',
  'INSERT',
  'UPDATE',
  'GRANT',
  'REVOKE',
  'EXEC',
  'EXECUTE',
  'MERGE',
  'REPLACE',
] as const

/**
 * Pattern to detect multiple statements (semicolon followed by non-whitespace)
 */
const MULTIPLE_STATEMENTS_PATTERN = /;\s*\S/

/**
 * Pattern to detect if query starts with SELECT (case insensitive, allows leading whitespace)
 */
const SELECT_PATTERN = /^\s*SELECT\s/i

/**
 * Pattern for SQL comments that might hide malicious code
 */
const COMMENT_PATTERNS = [
  /--.*$/gm,           // Single line comments
  /\/\*[\s\S]*?\*\//g, // Multi-line comments
]

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export class QueryValidator {
  /**
   * Validate a HogQL query
   * @throws InvalidQueryError if validation fails
   */
  validate(query: string): void {
    const errors: string[] = []

    // Check for empty query
    if (!query || query.trim().length === 0) {
      throw new InvalidQueryError('Query cannot be empty')
    }

    // Check query length
    if (query.length > MAX_QUERY_LENGTH) {
      throw new InvalidQueryError(
        `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
        { length: query.length, max_length: MAX_QUERY_LENGTH }
      )
    }

    // Remove comments for analysis (but preserve original for dangerous keyword check)
    const queryWithoutComments = this.removeComments(query)

    // Check for multiple statements
    if (MULTIPLE_STATEMENTS_PATTERN.test(queryWithoutComments)) {
      throw new InvalidQueryError(
        'Multiple statements are not allowed. Query must contain only a single statement.',
        { hint: 'Remove semicolons between statements' }
      )
    }

    // Check for SELECT-only queries
    if (!SELECT_PATTERN.test(queryWithoutComments)) {
      throw new InvalidQueryError(
        'Only SELECT queries are allowed',
        { hint: 'Query must start with SELECT' }
      )
    }

    // Check for dangerous keywords (check original query to catch keywords in comments too)
    const dangerousKeywordsFound = this.findDangerousKeywords(query)
    if (dangerousKeywordsFound.length > 0) {
      throw new InvalidQueryError(
        `Query contains dangerous keywords: ${dangerousKeywordsFound.join(', ')}`,
        { keywords: dangerousKeywordsFound }
      )
    }

    // Additional security checks
    this.checkForSqlInjection(queryWithoutComments, errors)

    if (errors.length > 0) {
      throw new InvalidQueryError(errors.join('; '))
    }
  }

  /**
   * Safe validation that returns result instead of throwing
   */
  validateSafe(query: string): ValidationResult {
    try {
      this.validate(query)
      return { valid: true, errors: [] }
    } catch (error) {
      if (error instanceof InvalidQueryError) {
        return { valid: false, errors: [error.reason] }
      }
      return { valid: false, errors: ['Unknown validation error'] }
    }
  }

  /**
   * Remove SQL comments from query
   */
  private removeComments(query: string): string {
    let result = query
    for (const pattern of COMMENT_PATTERNS) {
      result = result.replace(pattern, ' ')
    }
    return result.trim()
  }

  /**
   * Find dangerous keywords in query
   */
  private findDangerousKeywords(query: string): string[] {
    const upperQuery = query.toUpperCase()
    const found: string[] = []

    for (const keyword of DANGEROUS_KEYWORDS) {
      // Match keyword as whole word (not part of another word)
      const pattern = new RegExp(`\\b${keyword}\\b`, 'i')
      if (pattern.test(upperQuery)) {
        found.push(keyword)
      }
    }

    return found
  }

  /**
   * Check for potential SQL injection patterns
   */
  private checkForSqlInjection(query: string, errors: string[]): void {
    // Check for string termination attempts
    const suspiciousPatterns = [
      { pattern: /'\s*;\s*--/i, message: 'Suspicious pattern: string termination with comment' },
      { pattern: /'\s*OR\s+'1'\s*=\s*'1/i, message: 'Suspicious pattern: OR 1=1 injection' },
      { pattern: /UNION\s+SELECT/i, message: 'UNION SELECT is not allowed' },
      { pattern: /INTO\s+OUTFILE/i, message: 'INTO OUTFILE is not allowed' },
      { pattern: /LOAD_FILE/i, message: 'LOAD_FILE is not allowed' },
    ]

    for (const { pattern, message } of suspiciousPatterns) {
      if (pattern.test(query)) {
        errors.push(message)
      }
    }
  }
}

/**
 * Create a singleton query validator instance
 */
export const queryValidator = new QueryValidator()
