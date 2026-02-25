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
 * ClickHouse functions that enable SSRF, file access, or DoS
 */
const DANGEROUS_FUNCTIONS = [
  // SSRF / remote access
  'url', 'remote', 'remoteSecure', 'cluster', 'clusterAllReplicas',
  // File system access
  'file', 'input',
  // DoS vectors
  'sleep', 'sleepEachRow', 'numbers', 'numbers_mt',
  'generateRandom', 'zeros', 'zeros_mt',
  // Memory bombs
  'arrayJoin',
] as const

/**
 * Additional blocked SQL patterns (keyword-based, checked as whole words)
 */
const ADDITIONAL_BLOCKED_PATTERNS = [
  'ARRAY JOIN',  // ClickHouse ARRAY JOIN can be used for DoS
] as const

/**
 * Table prefixes that expose system metadata
 */
const BLOCKED_TABLE_PREFIXES = [
  'system.', 'information_schema.', 'INFORMATION_SCHEMA.',
] as const

/**
 * Unicode fullwidth characters that should be normalized to ASCII
 */
const UNICODE_NORMALIZATIONS: [RegExp, string][] = [
  [/\uFF1B/g, ';'],   // Fullwidth semicolon
  [/\uFF08/g, '('],   // Fullwidth left paren
  [/\uFF09/g, ')'],   // Fullwidth right paren
]

/**
 * Pattern to detect multiple statements (semicolon followed by non-whitespace)
 */
const MULTIPLE_STATEMENTS_PATTERN = /;\s*\S/

/**
 * Pattern to detect if query starts with SELECT, WITH (CTE), or parenthesized SELECT
 */
const SELECT_OR_WITH_PATTERN = /^\s*(?:\(?\s*SELECT\s|WITH\s)/i

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
    // 1. Check for empty query
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

    // 2. Unicode normalization (fullwidth → ASCII)
    const normalizedQuery = this.normalizeUnicode(query)

    // 3. Remove comments for analysis
    const strippedQuery = this.removeComments(normalizedQuery)

    // 4. Check for multiple statements (on normalized query)
    if (MULTIPLE_STATEMENTS_PATTERN.test(strippedQuery)) {
      throw new InvalidQueryError(
        'Multiple statements are not allowed. Query must contain only a single statement.',
        { hint: 'Remove semicolons between statements' }
      )
    }

    // 5. Check for SELECT/WITH-only queries (accept CTE + parens)
    if (!SELECT_OR_WITH_PATTERN.test(strippedQuery)) {
      throw new InvalidQueryError(
        'Only SELECT queries are allowed',
        { hint: 'Query must start with SELECT or WITH' }
      )
    }

    // 6. Check for dangerous keywords (on STRIPPED query — keywords in comments are harmless)
    const dangerousKeywordsFound = this.findDangerousKeywords(strippedQuery)
    if (dangerousKeywordsFound.length > 0) {
      throw new InvalidQueryError(
        `Query contains dangerous keywords: ${dangerousKeywordsFound.join(', ')}`,
        { keywords: dangerousKeywordsFound }
      )
    }

    // 7. Check for dangerous ClickHouse functions
    const dangerousFunctionsFound = this.findDangerousFunctions(strippedQuery)
    if (dangerousFunctionsFound.length > 0) {
      throw new InvalidQueryError(
        `Query contains blocked functions: ${dangerousFunctionsFound.join(', ')}`,
        { functions: dangerousFunctionsFound }
      )
    }

    // 8. Check for blocked table prefixes (system.*, information_schema.*)
    const blockedTablesFound = this.findBlockedTables(strippedQuery)
    if (blockedTablesFound.length > 0) {
      throw new InvalidQueryError(
        `Access to system tables is not allowed: ${blockedTablesFound.join(', ')}`,
        { tables: blockedTablesFound }
      )
    }

    // 8b. Check for additional blocked patterns (ARRAY JOIN, etc.)
    const blockedPatternsFound = this.findBlockedPatterns(strippedQuery)
    if (blockedPatternsFound.length > 0) {
      throw new InvalidQueryError(
        `Query contains blocked patterns: ${blockedPatternsFound.join(', ')}`,
        { patterns: blockedPatternsFound }
      )
    }

    // 8c. Check for backtick-escaped dangerous keywords
    this.checkBacktickEscaped(strippedQuery)

    // 9. SQL injection pattern check
    //    - Main patterns run on stripped query (comments removed)
    //    - Comment-stripping-bypass pattern ('; --) runs on normalized (pre-strip) query
    //      because stripping removes the "--" before the pattern can detect it
    const errors: string[] = []
    this.checkForSqlInjection(strippedQuery, errors)
    this.checkForCommentStrippingBypass(normalizedQuery, errors)

    if (errors.length > 0) {
      const uniqueErrors = [...new Set(errors)]
      throw new InvalidQueryError(uniqueErrors.join('; '))
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
   * Normalize fullwidth Unicode characters to their ASCII equivalents
   */
  private normalizeUnicode(query: string): string {
    let result = query
    for (const [pattern, replacement] of UNICODE_NORMALIZATIONS) {
      result = result.replace(pattern, replacement)
    }
    return result
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
   * Find dangerous ClickHouse functions in query (case-insensitive)
   */
  private findDangerousFunctions(query: string): string[] {
    const found: string[] = []

    for (const func of DANGEROUS_FUNCTIONS) {
      // Match function name followed by opening paren: funcName(
      const pattern = new RegExp(`\\b${func}\\s*\\(`, 'i')
      if (pattern.test(query)) {
        found.push(func)
      }
    }

    return found
  }

  /**
   * Find blocked table prefixes in query (e.g. system.tables)
   */
  private findBlockedTables(query: string): string[] {
    const found: string[] = []

    for (const prefix of BLOCKED_TABLE_PREFIXES) {
      // Match the prefix as a word boundary (case-insensitive for information_schema)
      const escaped = prefix.replace('.', '\\.')
      const pattern = new RegExp(`\\b${escaped}`, 'i')
      if (pattern.test(query)) {
        found.push(prefix.replace(/\.$/, ''))
      }
    }

    return found
  }

  /**
   * Find additional blocked patterns (multi-word keywords like ARRAY JOIN)
   */
  private findBlockedPatterns(query: string): string[] {
    const found: string[] = []
    for (const pattern of ADDITIONAL_BLOCKED_PATTERNS) {
      const regex = new RegExp(`\\b${pattern}\\b`, 'i')
      if (regex.test(query)) {
        found.push(pattern)
      }
    }
    return found
  }

  /**
   * Check for dangerous keywords hidden inside backtick-quoted identifiers.
   * e.g. `DROP` TABLE should still be caught.
   */
  private checkBacktickEscaped(query: string): void {
    // Extract content inside backticks
    const backtickContent = query.match(/`([^`]+)`/g)
    if (!backtickContent) return

    for (const match of backtickContent) {
      const inner = match.slice(1, -1).toUpperCase()
      for (const keyword of DANGEROUS_KEYWORDS) {
        if (inner === keyword) {
          throw new InvalidQueryError(
            `Query contains dangerous keyword in backtick-quoted identifier: ${keyword}`,
            { keywords: [keyword] }
          )
        }
      }
    }
  }

  /**
   * Check for comment-stripping bypass patterns on the PRE-STRIPPED query.
   * The '; -- pattern gets defeated by comment stripping (which removes "--"),
   * so we must check the original/normalized query before stripping.
   */
  private checkForCommentStrippingBypass(query: string, errors: string[]): void {
    if (/'\s*;\s*--/.test(query)) {
      errors.push('Suspicious pattern: string termination with comment')
    }
  }

  /**
   * Check for potential SQL injection patterns
   */
  private checkForSqlInjection(query: string, errors: string[]): void {
    const suspiciousPatterns = [
      { pattern: /'\s*;\s*--/i, message: 'Suspicious pattern: string termination with comment' },
      { pattern: /'\s*OR\s+'1'\s*=\s*'1/i, message: 'Suspicious pattern: OR 1=1 injection' },
      { pattern: /OR\s+1\s*=\s*1/i, message: 'Suspicious pattern: OR 1=1 injection' },
      { pattern: /OR\s+true\b/i, message: 'Suspicious pattern: OR true injection' },
      { pattern: /UNION\s+(ALL\s+)?SELECT/i, message: 'UNION SELECT is not allowed' },
      { pattern: /CROSS\s+JOIN/i, message: 'CROSS JOIN is not allowed' },
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
