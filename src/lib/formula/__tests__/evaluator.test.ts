import { describe, it, expect } from 'vitest'
import { evaluateFormula, validateFormula, isBareStringLiteral } from '../evaluator'
import { parse } from '../parser'
import { autocomplete } from '../autocomplete'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const JANE = {
  id: 'jane',
  props: {
    email: 'jane@acme.io',
    name: 'Jane Cooper',
    first_name: 'Jane',
    last_name: 'Cooper',
    city: 'San Francisco',
    country: 'United States',
    sessions_7d: 12,
    sessions_30d: 47,
    mrr: 1490,
  },
}

const PRIYA = {
  id: 'priya',
  props: {
    name: 'Priya Shah',
    email: 'priya@lumen.studio',
    sessions_7d: 1,
    sessions_30d: 3,
  },
}

const ACME = {
  id: 'acme',
  props: {
    name: 'Acme Robotics',
    domain: 'acme.io',
    plan: 'growth',
    mrr: 1490,
    seat_count: 42,
  },
}

describe('bare string literal', () => {
  it('passes through quoted string', () => {
    const r = evaluateFormula('"Qualified"', JANE)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('Qualified')
  })

  it('detects bare literal', () => {
    expect(isBareStringLiteral('"Qualified"')).toBe(true)
    expect(isBareStringLiteral('  "Qualified"  ')).toBe(true)
    expect(isBareStringLiteral('concat("a", "b")')).toBe(false)
    expect(isBareStringLiteral('"hi" + "lo"')).toBe(false)
  })
})

describe('concat', () => {
  it('joins person + group via scopes', () => {
    const r = evaluateFormula(
      'concat(person.name, " @ ", group.name)',
      null,
      { scopes: { person: JANE.props, group_org: ACME.props } },
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('Jane Cooper @ Acme Robotics')
  })
})

describe('if', () => {
  it('SQL when sessions > 5', () => {
    const r = evaluateFormula('if(person.sessions_30d > 5, "SQL", "Lead")', JANE)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('SQL')
  })
  it('Lead when sessions <= 5', () => {
    const r = evaluateFormula('if(person.sessions_30d > 5, "SQL", "Lead")', PRIYA)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('Lead')
  })
})

describe('arithmetic', () => {
  it('group.mrr * 12', () => {
    const r = evaluateFormula('group.mrr * 12', null, { scopes: { group_org: ACME.props } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(17880)
  })
  it('handles division', () => {
    const r = evaluateFormula('group.mrr / 10', null, { scopes: { group_org: ACME.props } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(149)
  })
  it('rejects division by zero', () => {
    const r = evaluateFormula('1 / 0', JANE)
    expect(r.ok).toBe(false)
  })
})

describe('missing props', () => {
  it('returns empty reason when formula resolves to empty', () => {
    const r = evaluateFormula('person.nonexistent', JANE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/empty/)
  })
})

describe('malformed expression', () => {
  it('returns error', () => {
    const r = evaluateFormula('concat(person.name,,)', JANE)
    expect(r.ok).toBe(false)
  })
})

describe('functions', () => {
  it('lower/upper/trim', () => {
    expect(evaluateFormula('lower("HELLO")', JANE)).toMatchObject({ ok: true, value: 'hello' })
    expect(evaluateFormula('upper("hello")', JANE)).toMatchObject({ ok: true, value: 'HELLO' })
    expect(evaluateFormula('trim("  hi  ")', JANE)).toMatchObject({ ok: true, value: 'hi' })
  })
  it('coalesce picks first non-empty', () => {
    const r = evaluateFormula('coalesce("", person.email)', JANE)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('jane@acme.io')
  })
  it('domain_of', () => {
    const r = evaluateFormula('domain_of("jane@acme.io")', JANE)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('acme.io')
  })
  it('round', () => {
    expect(evaluateFormula('round(3.14159, 2)', JANE)).toMatchObject({ ok: true, value: 3.14 })
    expect(evaluateFormula('round(3.6)', JANE)).toMatchObject({ ok: true, value: 4 })
  })
  it('regex extracts first capture', () => {
    const r = evaluateFormula('regex("jane@acme.io", "([^@]+)@")', JANE)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('jane')
  })
  it('split returns array', () => {
    const r = evaluateFormula('split("a,b,c", ",")', JANE)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(['a', 'b', 'c'])
  })
  it('format_date formats ISO dates', () => {
    const r = evaluateFormula('format_date("2025-11-14T09:41:03Z", "YYYY-MM-DD")', JANE)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('2025-11-14')
  })
})

describe('unknown function', () => {
  it('errors out', () => {
    const r = evaluateFormula('danger("x")', JANE)
    expect(r.ok).toBe(false)
  })
})

describe('validation', () => {
  it('accepts valid', () => {
    expect(validateFormula('concat(person.name, " @ ", group.name)')).toEqual({ ok: true })
  })
  it('rejects invalid', () => {
    const r = validateFormula('concat(person.name,,)')
    expect(r.ok).toBe(false)
  })
})

describe('security — no eval', () => {
  it('source files contain no eval or Function constructor', () => {
    const files = [
      'tokenizer.ts',
      'parser.ts',
      'evaluator.ts',
      'functions.ts',
      'autocomplete.ts',
    ]
    for (const f of files) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      // Strip comments and strings (rough) — we just want to guard against real eval usage
      expect(src).not.toMatch(/\beval\s*\(/)
      expect(src).not.toMatch(/new\s+Function\s*\(/)
      expect(src).not.toMatch(/\bvm\./)
    }
  })
})

describe('parser edge cases', () => {
  it('supports parentheses', () => {
    const ast = parse('(1 + 2) * 3')
    expect(ast.type).toBe('binop')
  })
  it('parses comparisons', () => {
    const ast = parse('person.sessions_30d >= 10')
    expect(ast.type).toBe('binop')
  })
  it('rejects unterminated strings', () => {
    expect(() => parse('concat("abc')).toThrow()
  })
})

describe('autocomplete', () => {
  const ctx = {
    properties: {
      person: [
        { id: 'email', label: 'email', kind: 'email' },
        { id: 'first_name', label: 'first_name', kind: 'text' },
        { id: 'sessions_30d', label: 'sessions_30d', kind: 'number' },
      ],
      group: [
        { id: 'domain', label: 'domain', kind: 'domain' },
        { id: 'mrr', label: 'mrr', kind: 'number' },
      ],
    },
  }

  it('suggests person properties after person.', () => {
    const s = autocomplete('person.e', 8, ctx)
    expect(s?.kind).toBe('prop')
    if (s?.kind === 'prop') {
      expect(s.scope).toBe('person')
      expect(s.items.map((x) => x.id)).toContain('email')
    }
  })

  it('suggests functions at start of expression', () => {
    const s = autocomplete('co', 2, ctx)
    expect(s?.kind).toBe('fn')
    if (s?.kind === 'fn') {
      expect(s.items.map((x) => x.name)).toContain('concat')
      expect(s.items.map((x) => x.name)).toContain('coalesce')
    }
  })

  it('suggests functions after open-paren', () => {
    const s = autocomplete('if(lo', 5, ctx)
    expect(s?.kind).toBe('fn')
    if (s?.kind === 'fn') {
      expect(s.items.map((x) => x.name)).toContain('lower')
    }
  })

  it('returns null for empty expression', () => {
    expect(autocomplete('', 0, ctx)).toBeNull()
  })
})

describe('member() scope', () => {
  const members = {
    'jane@acme.io': { id: 'wm-1', email: 'jane@acme.io', firstName: 'Jane', lastName: 'Cooper' },
    'bob@acme.io': { id: 'wm-2', email: 'bob@acme.io', firstName: 'Bob', lastName: 'Smith' },
  }

  it('resolves known member email', () => {
    const r = evaluateFormula('member("jane@acme.io")', JANE, { members })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('jane@acme.io')
  })

  it('is case-insensitive on the email key', () => {
    const r = evaluateFormula('member("Jane@Acme.IO")', JANE, { members })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('jane@acme.io')
  })

  it('returns null for unknown email', () => {
    const r = evaluateFormula('member("nobody@example.com")', JANE, { members })
    // null result short-circuits evaluateFormula to ok:false (empty value) —
    // treat that as the "no match" signal.
    expect(r.ok).toBe(false)
  })

  it('rejects wrong arity', () => {
    const r = evaluateFormula('member()', JANE, { members })
    expect(r.ok).toBe(false)
  })

  it('nests inside if()', () => {
    const r = evaluateFormula(
      'if(person.sessions_30d > 5, member("jane@acme.io"), member("bob@acme.io"))',
      JANE,
      { members },
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('jane@acme.io')
  })
})
