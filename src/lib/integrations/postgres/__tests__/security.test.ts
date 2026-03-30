import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist dns mock to module scope so it's applied before security.ts imports dns
const mockResolve4 = vi.fn()
const mockResolve6 = vi.fn()

vi.mock('dns', () => ({
  default: {
    promises: {
      resolve4: (...args: unknown[]) => mockResolve4(...args),
      resolve6: (...args: unknown[]) => mockResolve6(...args),
    },
  },
  promises: {
    resolve4: (...args: unknown[]) => mockResolve4(...args),
    resolve6: (...args: unknown[]) => mockResolve6(...args),
  },
}))

import { validatePostgresHost, PostgresQueryValidator } from '../security'

// ── SSRF Host Validation ──────────────────────────────────

describe('validatePostgresHost', () => {
  beforeEach(() => {
    mockResolve4.mockReset()
    mockResolve6.mockReset()
  })

  it('blocks localhost hostname', async () => {
    const result = await validatePostgresHost('localhost')
    expect(result).toContain('blocked')
  })

  it('blocks 127.0.0.1', async () => {
    const result = await validatePostgresHost('127.0.0.1')
    expect(result).toContain('blocked')
  })

  it('blocks 10.x.x.x', async () => {
    const result = await validatePostgresHost('10.0.0.1')
    expect(result).toContain('blocked')
  })

  it('blocks 172.16.x.x', async () => {
    const result = await validatePostgresHost('172.16.0.1')
    expect(result).toContain('blocked')
  })

  it('blocks 192.168.x.x', async () => {
    const result = await validatePostgresHost('192.168.1.1')
    expect(result).toContain('blocked')
  })

  it('blocks 169.254.169.254 (metadata endpoint)', async () => {
    const result = await validatePostgresHost('169.254.169.254')
    expect(result).toContain('blocked')
  })

  it('blocks metadata.google.internal', async () => {
    const result = await validatePostgresHost('metadata.google.internal')
    expect(result).toContain('blocked')
  })

  it('blocks .local hostnames', async () => {
    const result = await validatePostgresHost('mydb.local')
    expect(result).toContain('blocked')
  })

  it('blocks .internal hostnames', async () => {
    const result = await validatePostgresHost('db.internal')
    expect(result).toContain('blocked')
  })

  it('blocks 0.0.0.0', async () => {
    const result = await validatePostgresHost('0.0.0.0')
    expect(result).toContain('blocked')
  })

  it('blocks IPv6 loopback ::1', async () => {
    const result = await validatePostgresHost('::1')
    expect(result).toContain('blocked')
  })

  it('blocks empty hostname', async () => {
    const result = await validatePostgresHost('')
    expect(result).toContain('empty')
  })

  it('allows public hostname that resolves to public IP', async () => {
    mockResolve4.mockResolvedValue(['54.23.100.5'])
    mockResolve6.mockRejectedValue(new Error('no AAAA'))
    const result = await validatePostgresHost('db.example.com')
    expect(result).toBeNull()
  })

  it('blocks hostname that resolves to private IP (DNS rebinding)', async () => {
    mockResolve4.mockResolvedValue(['10.0.0.5'])
    mockResolve6.mockRejectedValue(new Error('no AAAA'))
    const result = await validatePostgresHost('evil.example.com')
    expect(result).toContain('blocked')
  })

  it('blocks hostname that resolves to 127.x.x.x', async () => {
    mockResolve4.mockResolvedValue(['127.0.0.1'])
    mockResolve6.mockRejectedValue(new Error('no AAAA'))
    const result = await validatePostgresHost('sneaky.example.com')
    expect(result).toContain('blocked')
  })

  it('blocks if any resolved IP is private (mixed resolution)', async () => {
    mockResolve4.mockResolvedValue(['54.23.100.5', '10.0.0.1'])
    mockResolve6.mockRejectedValue(new Error('no AAAA'))
    const result = await validatePostgresHost('mixed.example.com')
    expect(result).toContain('blocked')
  })

  it('allows if DNS resolution fails (strict mode: block)', async () => {
    mockResolve4.mockRejectedValue(new Error('ENOTFOUND'))
    mockResolve6.mockRejectedValue(new Error('ENOTFOUND'))
    const result = await validatePostgresHost('nonexistent.example.com')
    // Cannot resolve = cannot validate = block for safety
    expect(result).toContain('resolve')
  })

  it('skips DNS resolution for direct IP addresses', async () => {
    // A public IP should pass without DNS resolution
    const result = await validatePostgresHost('54.23.100.5')
    expect(result).toBeNull()
    expect(mockResolve4).not.toHaveBeenCalled()
  })
})

// ── SQL Query Validator ───────────────────────────────────

describe('PostgresQueryValidator', () => {
  const validator = new PostgresQueryValidator()

  // ── Allowed queries ──

  describe('allows valid queries', () => {
    it('allows simple SELECT', () => {
      expect(() => validator.validate('SELECT * FROM users')).not.toThrow()
    })

    it('allows SELECT with WHERE', () => {
      expect(() =>
        validator.validate('SELECT id, name FROM users WHERE id = 1')
      ).not.toThrow()
    })

    it('allows CTE (WITH clause)', () => {
      expect(() =>
        validator.validate(
          'WITH active AS (SELECT * FROM users WHERE active = true) SELECT * FROM active'
        )
      ).not.toThrow()
    })

    it('allows EXPLAIN', () => {
      expect(() =>
        validator.validate('EXPLAIN SELECT * FROM users')
      ).not.toThrow()
    })

    it('allows EXPLAIN (FORMAT JSON)', () => {
      expect(() =>
        validator.validate('EXPLAIN (FORMAT JSON) SELECT * FROM users')
      ).not.toThrow()
    })

    it('allows EXPLAIN ANALYZE', () => {
      expect(() =>
        validator.validate('EXPLAIN ANALYZE SELECT * FROM users')
      ).not.toThrow()
    })

    it('allows subqueries', () => {
      expect(() =>
        validator.validate(
          'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)'
        )
      ).not.toThrow()
    })

    it('allows aggregate functions', () => {
      expect(() =>
        validator.validate(
          'SELECT count(*), avg(price) FROM orders GROUP BY status'
        )
      ).not.toThrow()
    })

    it('allows information_schema queries', () => {
      expect(() =>
        validator.validate(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        )
      ).not.toThrow()
    })

    it('allows window functions', () => {
      expect(() =>
        validator.validate(
          'SELECT id, row_number() OVER (PARTITION BY status ORDER BY created_at) FROM orders'
        )
      ).not.toThrow()
    })

    it('allows CASE expressions', () => {
      expect(() =>
        validator.validate(
          "SELECT CASE WHEN status = 'active' THEN 1 ELSE 0 END FROM users"
        )
      ).not.toThrow()
    })

    it('allows trailing semicolon', () => {
      expect(() =>
        validator.validate('SELECT * FROM users;')
      ).not.toThrow()
    })
  })

  // ── Blocked: DML writes ──

  describe('blocks DML write operations', () => {
    it('blocks INSERT', () => {
      expect(() =>
        validator.validate("INSERT INTO users (name) VALUES ('test')")
      ).toThrow()
    })

    it('blocks UPDATE', () => {
      expect(() =>
        validator.validate("UPDATE users SET name = 'test' WHERE id = 1")
      ).toThrow()
    })

    it('blocks DELETE', () => {
      expect(() =>
        validator.validate('DELETE FROM users WHERE id = 1')
      ).toThrow()
    })

    it('blocks TRUNCATE', () => {
      expect(() => validator.validate('TRUNCATE users')).toThrow()
    })
  })

  // ── Blocked: DDL operations ──

  describe('blocks DDL operations', () => {
    it('blocks CREATE TABLE', () => {
      expect(() =>
        validator.validate('CREATE TABLE evil (id int)')
      ).toThrow()
    })

    it('blocks ALTER TABLE', () => {
      expect(() =>
        validator.validate('ALTER TABLE users ADD COLUMN evil text')
      ).toThrow()
    })

    it('blocks DROP TABLE', () => {
      expect(() => validator.validate('DROP TABLE users')).toThrow()
    })

    it('blocks DROP DATABASE', () => {
      expect(() => validator.validate('DROP DATABASE mydb')).toThrow()
    })
  })

  // ── Blocked: Postgres-specific dangerous commands ──

  describe('blocks Postgres-specific dangerous commands', () => {
    it('blocks COPY', () => {
      expect(() =>
        validator.validate("COPY users TO '/tmp/evil.csv'")
      ).toThrow()
    })

    it('blocks DO (anonymous code block)', () => {
      expect(() =>
        validator.validate("DO $$ BEGIN RAISE NOTICE 'hello'; END $$")
      ).toThrow()
    })

    it('blocks LISTEN', () => {
      expect(() => validator.validate('LISTEN my_channel')).toThrow()
    })

    it('blocks NOTIFY', () => {
      expect(() =>
        validator.validate("NOTIFY my_channel, 'payload'")
      ).toThrow()
    })

    it('blocks GRANT', () => {
      expect(() =>
        validator.validate('GRANT ALL ON users TO evil_role')
      ).toThrow()
    })

    it('blocks REVOKE', () => {
      expect(() =>
        validator.validate('REVOKE ALL ON users FROM evil_role')
      ).toThrow()
    })

    it('blocks SET', () => {
      expect(() =>
        validator.validate('SET default_transaction_read_only = off')
      ).toThrow()
    })

    it('blocks VACUUM', () => {
      expect(() => validator.validate('VACUUM users')).toThrow()
    })

    it('blocks REINDEX', () => {
      expect(() => validator.validate('REINDEX TABLE users')).toThrow()
    })

    it('blocks CLUSTER', () => {
      expect(() => validator.validate('CLUSTER users')).toThrow()
    })
  })

  // ── Verify dangerous keywords ARE caught when embedded in SELECT ──

  describe('blocks dangerous keywords embedded in valid-looking queries', () => {
    it('blocks SELECT into subquery with INSERT', () => {
      expect(() =>
        validator.validate(
          "SELECT * FROM users; INSERT INTO evil VALUES (1)"
        )
      ).toThrow()
    })

    it('blocks dangerous keywords in CTE', () => {
      expect(() =>
        validator.validate(
          "WITH del AS (DELETE FROM users RETURNING *) SELECT * FROM del"
        )
      ).toThrow(/dangerous/)
    })

    it('blocks UPDATE in CTE', () => {
      expect(() =>
        validator.validate(
          "WITH upd AS (UPDATE users SET name='x' RETURNING *) SELECT * FROM upd"
        )
      ).toThrow(/dangerous/)
    })
  })

  // ── Blocked: Multi-statement injection ──

  describe('blocks multi-statement injection', () => {
    it('blocks semicolon followed by another statement', () => {
      expect(() =>
        validator.validate('SELECT 1; DROP TABLE users')
      ).toThrow(/multiple/i)
    })

    it('blocks semicolon with whitespace between statements', () => {
      expect(() =>
        validator.validate('SELECT 1;   DELETE FROM users')
      ).toThrow(/multiple/i)
    })
  })

  // ── Blocked: Query too long ──

  describe('blocks oversized queries', () => {
    it('blocks queries exceeding 10,000 characters', () => {
      const longQuery = 'SELECT ' + 'a'.repeat(10_001)
      expect(() => validator.validate(longQuery)).toThrow(/length/)
    })
  })

  // ── Blocked: pg_ catalog access ──

  describe('blocks pg_ catalog access', () => {
    it('blocks pg_catalog queries', () => {
      expect(() =>
        validator.validate('SELECT * FROM pg_catalog.pg_tables')
      ).toThrow(/pg_catalog/)
    })

    it('blocks pg_shadow (password hashes)', () => {
      expect(() =>
        validator.validate('SELECT * FROM pg_shadow')
      ).toThrow(/pg_/)
    })

    it('blocks pg_authid', () => {
      expect(() =>
        validator.validate('SELECT * FROM pg_authid')
      ).toThrow(/pg_/)
    })

    it('allows pg_ as a column or table name in quotes (false positive protection)', () => {
      // "pg_count" as a column alias is fine — it's the TABLE reference we block
      expect(() =>
        validator.validate('SELECT count(*) as pg_count FROM users')
      ).not.toThrow()
    })
  })

  // ── Blocked: Comment-based bypass ──

  describe('blocks comment-based bypass attempts', () => {
    it('blocks dangerous keywords hidden in comments then re-appearing', () => {
      // After comment stripping, this becomes: SELECT 1;  DROP TABLE users
      expect(() =>
        validator.validate('SELECT 1; /* safe */ DROP TABLE users')
      ).toThrow()
    })

    it('blocks single-line comment bypass', () => {
      expect(() =>
        validator.validate('SELECT 1; -- safe\nDROP TABLE users')
      ).toThrow()
    })
  })

  // ── Blocked: Unicode bypass ──

  describe('blocks unicode bypass attempts', () => {
    it('normalizes fullwidth semicolon', () => {
      expect(() =>
        validator.validate('SELECT 1\uFF1B DROP TABLE users')
      ).toThrow()
    })
  })

  // ── Edge cases ──

  describe('edge cases', () => {
    it('rejects empty query', () => {
      expect(() => validator.validate('')).toThrow(/empty/)
    })

    it('rejects whitespace-only query', () => {
      expect(() => validator.validate('   ')).toThrow(/empty/)
    })

    it('handles case-insensitive keywords', () => {
      expect(() => validator.validate('select * from users')).not.toThrow()
      expect(() => validator.validate('INSERT into users values (1)')).toThrow()
      expect(() => validator.validate('DrOp TABLE users')).toThrow()
    })

    it('does not false-positive on column names containing keywords', () => {
      // "updated_at" contains "update", "created" contains "create"
      expect(() =>
        validator.validate(
          'SELECT updated_at, created_at, deleted FROM orders'
        )
      ).not.toThrow()
    })

    it('does not false-positive on table names with "set" substring', () => {
      expect(() =>
        validator.validate('SELECT * FROM settings WHERE key = 1')
      ).not.toThrow()
    })
  })
})
