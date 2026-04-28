import type { Token, PunctValue } from './types'

const SINGLE_PUNCT: readonly PunctValue[] = ['(', ')', ',', '.', '+', '-', '*', '/']
const DOUBLE_PUNCT: readonly PunctValue[] = ['>=', '<=', '==', '!=']
const SINGLE_COMPARE: readonly PunctValue[] = ['>', '<']

export function tokenize(input: string): Token[] {
  const out: Token[] = []
  let i = 0
  const n = input.length

  while (i < n) {
    const c = input[i]

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }

    // String literal — double quotes only (matches prototype)
    if (c === '"') {
      const start = i
      i++
      let value = ''
      while (i < n && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < n) {
          const next = input[i + 1]
          if (next === '"' || next === '\\') {
            value += next
            i += 2
            continue
          }
        }
        value += input[i]
        i++
      }
      if (i >= n) {
        throw new FormulaError(`Unterminated string starting at ${start}`, start)
      }
      i++ // consume closing quote
      out.push({ kind: 'str', value, start, end: i })
      continue
    }

    // Number
    if (isDigit(c) || (c === '.' && i + 1 < n && isDigit(input[i + 1]))) {
      const start = i
      while (i < n && (isDigit(input[i]) || input[i] === '.')) i++
      const raw = input.slice(start, i)
      const value = Number(raw)
      if (!Number.isFinite(value)) {
        throw new FormulaError(`Invalid number literal "${raw}"`, start)
      }
      out.push({ kind: 'num', value, start, end: i })
      continue
    }

    // Identifier
    if (isIdentStart(c)) {
      const start = i
      while (i < n && isIdentPart(input[i])) i++
      const value = input.slice(start, i)
      out.push({ kind: 'ident', value, start, end: i })
      continue
    }

    // Two-char punctuation
    if (i + 1 < n) {
      const two = (input[i] + input[i + 1]) as PunctValue
      if (DOUBLE_PUNCT.includes(two)) {
        out.push({ kind: 'punct', value: two, start: i, end: i + 2 })
        i += 2
        continue
      }
    }

    // Single-char punctuation
    if (
      (SINGLE_PUNCT as readonly string[]).includes(c) ||
      (SINGLE_COMPARE as readonly string[]).includes(c)
    ) {
      out.push({ kind: 'punct', value: c as PunctValue, start: i, end: i + 1 })
      i++
      continue
    }

    throw new FormulaError(`Unexpected character "${c}" at ${i}`, i)
  }

  out.push({ kind: 'eof', start: n, end: n })
  return out
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9'
}

function isIdentStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$'
}

function isIdentPart(c: string): boolean {
  return isIdentStart(c) || isDigit(c)
}

export class FormulaError extends Error {
  readonly offset: number
  constructor(message: string, offset: number) {
    super(message)
    this.name = 'FormulaError'
    this.offset = offset
  }
}
