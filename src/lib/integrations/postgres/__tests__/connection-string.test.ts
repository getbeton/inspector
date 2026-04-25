import { describe, it, expect } from 'vitest'
import { parseConnectionString, buildConnectionConfig } from '../connection-string'
import type { DataSourceRecord } from '../types'

describe('parseConnectionString', () => {
  it('parses a standard connection string', () => {
    const result = parseConnectionString(
      'postgresql://myuser:mypass@db.example.com:5432/mydb'
    )
    expect(result).toEqual({
      host: 'db.example.com',
      port: 5432,
      database: 'mydb',
      user: 'myuser',
      password: 'mypass',
      sslMode: undefined,
    })
  })

  it('parses postgres:// scheme (alias for postgresql://)', () => {
    const result = parseConnectionString(
      'postgres://user:pass@host.com:5433/testdb'
    )
    expect(result).toEqual({
      host: 'host.com',
      port: 5433,
      database: 'testdb',
      user: 'user',
      password: 'pass',
      sslMode: undefined,
    })
  })

  it('handles percent-encoded password with special characters', () => {
    // Password is "p@ss:w0rd/foo" → encoded as "p%40ss%3Aw0rd%2Ffoo"
    const result = parseConnectionString(
      'postgresql://user:p%40ss%3Aw0rd%2Ffoo@host.com:5432/db'
    )
    expect(result.password).toBe('p@ss:w0rd/foo')
  })

  it('handles password with # character (encoded)', () => {
    const result = parseConnectionString(
      'postgresql://user:pass%23word@host.com:5432/db'
    )
    expect(result.password).toBe('pass#word')
  })

  it('defaults port to undefined when not specified', () => {
    const result = parseConnectionString(
      'postgresql://user:pass@host.com/db'
    )
    expect(result.port).toBeUndefined()
  })

  it('extracts sslmode from query parameters', () => {
    const result = parseConnectionString(
      'postgresql://user:pass@host.com:5432/db?sslmode=require'
    )
    expect(result.sslMode).toBe('require')
  })

  it('extracts sslmode=disable', () => {
    const result = parseConnectionString(
      'postgresql://user:pass@host.com:5432/db?sslmode=disable'
    )
    expect(result.sslMode).toBe('disable')
  })

  it('handles connection string without password', () => {
    const result = parseConnectionString(
      'postgresql://user@host.com:5432/db'
    )
    expect(result.user).toBe('user')
    expect(result.password).toBeUndefined()
  })

  it('handles connection string without user', () => {
    const result = parseConnectionString(
      'postgresql://host.com:5432/db'
    )
    expect(result.host).toBe('host.com')
    expect(result.user).toBeUndefined()
    expect(result.password).toBeUndefined()
  })

  it('handles empty database name (path is "/")', () => {
    const result = parseConnectionString(
      'postgresql://user:pass@host.com:5432/'
    )
    expect(result.database).toBeUndefined()
  })

  it('handles IPv6 host', () => {
    const result = parseConnectionString(
      'postgresql://user:pass@[::1]:5432/db'
    )
    expect(result.host).toBe('::1')
  })

  it('handles Supabase-style connection strings', () => {
    const result = parseConnectionString(
      'postgresql://postgres.abcdefghij:MyPassword123@aws-0-us-east-1.pooler.supabase.com:6543/postgres'
    )
    expect(result.host).toBe('aws-0-us-east-1.pooler.supabase.com')
    expect(result.port).toBe(6543)
    expect(result.user).toBe('postgres.abcdefghij')
    expect(result.password).toBe('MyPassword123')
    expect(result.database).toBe('postgres')
  })

  it('handles Render-style connection strings', () => {
    const result = parseConnectionString(
      'postgresql://myuser:AbCdEf123456@dpg-abc123-a.oregon-postgres.render.com:5432/mydb_1234'
    )
    expect(result.host).toBe('dpg-abc123-a.oregon-postgres.render.com')
    expect(result.database).toBe('mydb_1234')
  })

  it('throws on invalid connection string', () => {
    expect(() => parseConnectionString('not-a-url')).toThrow()
    expect(() => parseConnectionString('')).toThrow()
  })

  it('throws on non-postgres scheme', () => {
    expect(() =>
      parseConnectionString('mysql://user:pass@host:3306/db')
    ).toThrow()
  })

  it('handles multiple query parameters', () => {
    const result = parseConnectionString(
      'postgresql://user:pass@host.com:5432/db?sslmode=verify-full&connect_timeout=10'
    )
    expect(result.sslMode).toBe('verify-full')
    // Other query params are ignored (we only extract sslmode)
  })
})

describe('buildConnectionConfig', () => {
  const baseRecord: DataSourceRecord = {
    id: '00000000-0000-0000-0000-000000000001',
    workspace_id: '00000000-0000-0000-0000-000000000002',
    source_type: 'postgres',
    name: 'Test DB',
    host: 'db.example.com',
    port: 5432,
    database_name: 'mydb',
    username: 'myuser',
    password_encrypted: 'encrypted-value',
    ssl_mode: 'require',
    config_json: {},
    status: 'connected',
    last_validated_at: null,
    last_error: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  it('builds config from a data source record with decrypted password', () => {
    const config = buildConnectionConfig(baseRecord, 'decrypted-password')
    expect(config).toEqual({
      host: 'db.example.com',
      port: 5432,
      database: 'mydb',
      user: 'myuser',
      password: 'decrypted-password',
      ssl: 'require',
    })
  })

  it('maps ssl_mode=disable to ssl=false', () => {
    const config = buildConnectionConfig(
      { ...baseRecord, ssl_mode: 'disable' },
      'pass'
    )
    expect(config.ssl).toBe(false)
  })

  it('maps ssl_mode=prefer to ssl=prefer', () => {
    const config = buildConnectionConfig(
      { ...baseRecord, ssl_mode: 'prefer' },
      'pass'
    )
    expect(config.ssl).toBe('prefer')
  })

  it('maps ssl_mode=verify-full to ssl=verify-full', () => {
    const config = buildConnectionConfig(
      { ...baseRecord, ssl_mode: 'verify-full' },
      'pass'
    )
    expect(config.ssl).toBe('verify-full')
  })
})
