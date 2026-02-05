import { describe, it, expect } from 'vitest'
import { QueryValidator, queryValidator } from './query-validator'
import { InvalidQueryError } from '../errors/query-errors'

describe('QueryValidator', () => {
  const validator = new QueryValidator()

  describe('validate', () => {
    it('accepts valid SELECT query', () => {
      expect(() => validator.validate('SELECT * FROM events')).not.toThrow()
    })

    it('accepts SELECT query with whitespace', () => {
      expect(() => validator.validate('  SELECT event FROM events  ')).not.toThrow()
    })

    it('accepts complex SELECT query', () => {
      const query = `
        SELECT
          event,
          count() as count,
          avg(duration) as avg_duration
        FROM events
        WHERE timestamp > now() - interval 7 day
        GROUP BY event
        ORDER BY count DESC
        LIMIT 100
      `
      expect(() => validator.validate(query)).not.toThrow()
    })

    it('rejects empty query', () => {
      expect(() => validator.validate('')).toThrow(InvalidQueryError)
      expect(() => validator.validate('   ')).toThrow(InvalidQueryError)
    })

    it('rejects query exceeding max length', () => {
      const longQuery = 'SELECT * FROM events WHERE ' + 'a'.repeat(10_001)
      expect(() => validator.validate(longQuery)).toThrow(InvalidQueryError)
      expect(() => validator.validate(longQuery)).toThrow(/exceeds maximum length/)
    })

    it('rejects non-SELECT queries', () => {
      expect(() => validator.validate('INSERT INTO events VALUES (1)')).toThrow(InvalidQueryError)
      expect(() => validator.validate('UPDATE events SET foo = 1')).toThrow(InvalidQueryError)
    })

    it('rejects multiple statements', () => {
      expect(() => validator.validate('SELECT 1; SELECT 2')).toThrow(InvalidQueryError)
      expect(() => validator.validate('SELECT * FROM events; DROP TABLE events')).toThrow(InvalidQueryError)
    })
  })

  describe('dangerous keywords', () => {
    const dangerousKeywords = [
      'DROP',
      'DELETE',
      'TRUNCATE',
      'ALTER',
      'CREATE',
      'INSERT',
      'UPDATE',
      'GRANT',
      'REVOKE',
    ]

    dangerousKeywords.forEach((keyword) => {
      it(`rejects query with ${keyword} keyword`, () => {
        const query = `SELECT * FROM events WHERE ${keyword.toLowerCase()} = 1`
        expect(() => validator.validate(query)).toThrow(InvalidQueryError)
        expect(() => validator.validate(query)).toThrow(/dangerous keywords/)
      })
    })

    it('allows keywords as part of column/table names', () => {
      // Should NOT throw because 'dropdown' contains 'drop' but is not 'DROP' keyword
      // However, our regex uses word boundaries, so this should be fine
      expect(() => validator.validate('SELECT dropdown_value FROM events')).not.toThrow()
      expect(() => validator.validate('SELECT updated_at FROM events')).not.toThrow()
    })
  })

  describe('CTE and parenthesized SELECT', () => {
    it('accepts CTE (WITH ... AS) queries', () => {
      expect(() =>
        validator.validate('WITH cte AS (SELECT 1) SELECT * FROM cte')
      ).not.toThrow()
    })

    it('accepts parenthesized SELECT queries', () => {
      expect(() =>
        validator.validate('(SELECT * FROM events)')
      ).not.toThrow()
    })

    it('accepts nested CTE with multiple common table expressions', () => {
      const query = `
        WITH
          first AS (SELECT event FROM events WHERE timestamp > now() - interval 1 day),
          second AS (SELECT event, count() as cnt FROM first GROUP BY event)
        SELECT * FROM second ORDER BY cnt DESC
      `
      expect(() => validator.validate(query)).not.toThrow()
    })
  })

  describe('dangerous functions', () => {
    it('rejects ClickHouse table functions (url, remote, file)', () => {
      expect(() => validator.validate("SELECT * FROM url('http://evil.com', 'CSV')")).toThrow(InvalidQueryError)
      expect(() => validator.validate("SELECT * FROM remote('host', 'db', 'table')")).toThrow(InvalidQueryError)
      expect(() => validator.validate("SELECT * FROM file('/etc/hosts', 'CSV')")).toThrow(InvalidQueryError)
    })

    it('rejects DoS functions (sleep, numbers, generateRandom)', () => {
      expect(() => validator.validate('SELECT sleep(60)')).toThrow(InvalidQueryError)
      expect(() => validator.validate('SELECT * FROM numbers(1000000)')).toThrow(InvalidQueryError)
      expect(() => validator.validate("SELECT * FROM generateRandom('x UInt64')")).toThrow(InvalidQueryError)
    })

    it('rejects system table access', () => {
      expect(() => validator.validate('SELECT * FROM system.tables')).toThrow(InvalidQueryError)
      expect(() => validator.validate('SELECT * FROM system.columns')).toThrow(InvalidQueryError)
    })
  })

  describe('SQL injection patterns', () => {
    it('rejects UNION SELECT', () => {
      expect(() => validator.validate("SELECT * FROM events UNION SELECT * FROM users")).toThrow(InvalidQueryError)
    })

    it('rejects UNION ALL SELECT', () => {
      expect(() => validator.validate("SELECT * FROM events UNION ALL SELECT * FROM users")).toThrow(InvalidQueryError)
    })

    it('rejects INTO OUTFILE', () => {
      expect(() => validator.validate("SELECT * FROM events INTO OUTFILE '/tmp/data'")).toThrow(InvalidQueryError)
    })

    it('rejects LOAD_FILE', () => {
      expect(() => validator.validate("SELECT LOAD_FILE('/etc/passwd')")).toThrow(InvalidQueryError)
    })

    it('rejects CROSS JOIN', () => {
      expect(() => validator.validate("SELECT * FROM events CROSS JOIN events AS e2")).toThrow(InvalidQueryError)
    })
  })

  describe('validateSafe', () => {
    it('returns valid: true for valid query', () => {
      const result = validator.validateSafe('SELECT * FROM events')
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('returns valid: false with errors for invalid query', () => {
      const result = validator.validateSafe('')
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('singleton instance', () => {
    it('exports a singleton instance', () => {
      expect(queryValidator).toBeInstanceOf(QueryValidator)
    })
  })
})
