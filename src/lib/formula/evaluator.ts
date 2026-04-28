import type { Ast, EvalResult, PropKind, Subject } from './types'
import { FORMULA_FUNCTIONS, isTruthy } from './functions'
import { parse } from './parser'
import { FormulaError } from './tokenizer'

export interface EvaluateOptions {
  /**
   * The set of property scopes the subject provides. Determines how
   * `person.foo`, `group.foo`, `beton.foo` are resolved.
   * Default: all scopes map to `subject.props` — simplest case.
   */
  scopes?: Partial<Record<PropKind, Record<string, unknown>>>

  /**
   * Workspace members keyed by email (lowercased). Enables the `member.*`
   * scope in formulas — e.g. `member.jane@acme.io` resolves to that member's
   * email (shorthand wire form for Attio actor-reference).
   *
   * Typically populated in the browser by a React Query hook that calls
   * /api/integrations/[name]/workspace-members and cached in-memory; on the
   * server, populated by the send-test / preview-impact routes before calling
   * buildPayload's evalSource.
   */
  members?: Record<string, { id: string; email: string; firstName?: string; lastName?: string }>
}

const SCOPE_ALIASES: Record<string, PropKind> = {
  person: 'person',
  group: 'group_org',
  beton: 'beton_computed',
}

/** Parse and evaluate a formula expression against a subject. */
export function evaluateFormula(
  expr: string,
  subject: Subject | null,
  options: EvaluateOptions = {},
): EvalResult {
  let ast: Ast
  try {
    ast = parse(expr)
  } catch (e) {
    const msg = e instanceof FormulaError ? e.message : 'Formula could not be parsed'
    return { ok: false, reason: msg }
  }

  const scopes: Record<PropKind, Record<string, unknown>> = {
    person: options.scopes?.person ?? subject?.props ?? {},
    group_org: options.scopes?.group_org ?? subject?.props ?? {},
    beton_computed: options.scopes?.beton_computed ?? subject?.props ?? {},
  }

  const members = options.members ?? {}

  try {
    const value = evalAst(ast, scopes, members)
    if (value === undefined || value === null || value === '') {
      return { ok: false, reason: 'Formula referenced an empty property' }
    }
    return { ok: true, value, text: valueToText(value) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Formula could not be evaluated'
    return { ok: false, reason: msg }
  }
}

function evalAst(
  ast: Ast,
  scopes: Record<PropKind, Record<string, unknown>>,
  members: Record<string, { id: string; email: string; firstName?: string; lastName?: string }>,
): unknown {
  switch (ast.type) {
    case 'num':
      return ast.value
    case 'str':
      return ast.value
    case 'bool':
      return ast.value
    case 'null':
      return null
    case 'ref': {
      const [head, ...rest] = ast.path
      const kind = SCOPE_ALIASES[head]
      if (!kind) {
        // Treat as a bare reference into subject.props (flat lookup).
        // e.g., `sessions_30d` standalone.
        return scopes.person[head]
      }
      if (rest.length === 0) {
        throw new Error(`Reference "${head}" needs a property (e.g. ${head}.name)`)
      }
      let cur: unknown = scopes[kind][rest[0]]
      for (let i = 1; i < rest.length; i++) {
        if (cur && typeof cur === 'object') {
          cur = (cur as Record<string, unknown>)[rest[i]]
        } else {
          return undefined
        }
      }
      return cur
    }
    case 'call': {
      // Special-cased built-in: member("jane@acme.io") → member email if known,
      // null otherwise. Uses the injected member map rather than FORMULA_FUNCTIONS
      // because it needs closure over scopes.
      if (ast.name === 'member') {
        if (ast.args.length !== 1) {
          throw new Error('member() expects exactly 1 argument — an email string')
        }
        const v = evalAst(ast.args[0], scopes, members)
        const email = typeof v === 'string' ? v.toLowerCase() : ''
        const m = members[email]
        return m ? m.email : null
      }

      const fn = FORMULA_FUNCTIONS[ast.name]
      if (!fn) throw new Error(`Unknown function "${ast.name}"`)
      if (ast.args.length < fn.minArgs) {
        throw new Error(`${fn.name} expects at least ${fn.minArgs} argument${fn.minArgs === 1 ? '' : 's'}`)
      }
      if (ast.args.length > fn.maxArgs) {
        throw new Error(`${fn.name} expects at most ${fn.maxArgs} argument${fn.maxArgs === 1 ? '' : 's'}`)
      }
      const args = ast.args.map((a) => evalAst(a, scopes, members))
      return fn.run(args)
    }
    case 'unary': {
      const v = evalAst(ast.arg, scopes, members)
      if (ast.op === '-') {
        const n = toNumber(v)
        return -n
      }
      return v
    }
    case 'binop': {
      const l = evalAst(ast.left, scopes, members)
      const r = evalAst(ast.right, scopes, members)
      switch (ast.op) {
        case '+':
          // Overload: if either is string, concat; else numeric add.
          if (typeof l === 'string' || typeof r === 'string') {
            const ls = l == null ? '' : String(l)
            const rs = r == null ? '' : String(r)
            return ls + rs
          }
          return toNumber(l) + toNumber(r)
        case '-':
          return toNumber(l) - toNumber(r)
        case '*':
          return toNumber(l) * toNumber(r)
        case '/': {
          const rn = toNumber(r)
          if (rn === 0) throw new Error('Division by zero')
          return toNumber(l) / rn
        }
        case '>':
          return toNumber(l) > toNumber(r)
        case '<':
          return toNumber(l) < toNumber(r)
        case '>=':
          return toNumber(l) >= toNumber(r)
        case '<=':
          return toNumber(l) <= toNumber(r)
        case '==':
          return looseEq(l, r)
        case '!=':
          return !looseEq(l, r)
        default: {
          // Exhaustiveness guard
          const _never: never = ast.op as never
          throw new Error(`Unsupported operator: ${String(_never)}`)
        }
      }
    }
  }
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === null || v === undefined || v === '') return 0
  throw new Error(`Cannot use ${JSON.stringify(v)} as a number`)
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (typeof a === 'number' || typeof b === 'number') {
    try {
      return toNumber(a) === toNumber(b)
    } catch {
      return false
    }
  }
  if (typeof a === 'string' || typeof b === 'string') {
    return String(a) === String(b)
  }
  return false
}

function valueToText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) return v.map((x) => valueToText(x)).join(', ')
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** Detect if an expression is just a quoted string literal ("Qualified"). */
export function isBareStringLiteral(expr: string): boolean {
  return /^\s*"([^"\\]|\\.)*"\s*$/.test(expr)
}

/** Quickly validate a formula without evaluating it. Used by the PUT endpoint. */
export function validateFormula(expr: string): { ok: true } | { ok: false; reason: string } {
  try {
    parse(expr)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof FormulaError ? e.message : 'Formula could not be parsed'
    return { ok: false, reason: msg }
  }
}

export { isTruthy }
