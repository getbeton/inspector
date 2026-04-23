import type { FormulaFn } from './types'

function toStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  return String(v)
}

function toNumStrict(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  throw new Error(`cannot coerce to number: ${JSON.stringify(v)}`)
}

// Small, safe formatter — supports the handful of tokens we advertise.
// YYYY, YY, MM, DD, HH, mm, ss
function formatDate(d: Date, fmt: string): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const YYYY = pad(d.getUTCFullYear(), 4)
  const YY = pad(d.getUTCFullYear() % 100)
  const MM = pad(d.getUTCMonth() + 1)
  const DD = pad(d.getUTCDate())
  const HH = pad(d.getUTCHours())
  const mm = pad(d.getUTCMinutes())
  const ss = pad(d.getUTCSeconds())
  return fmt
    .replace(/YYYY/g, YYYY)
    .replace(/YY/g, YY)
    .replace(/MM/g, MM)
    .replace(/DD/g, DD)
    .replace(/HH/g, HH)
    .replace(/mm/g, mm)
    .replace(/ss/g, ss)
}

export const FORMULA_FUNCTIONS: Record<string, FormulaFn> = {
  lower: {
    name: 'lower',
    sig: 'lower(text)',
    desc: 'Lowercase text',
    minArgs: 1,
    maxArgs: 1,
    run: (args) => toStr(args[0]).toLowerCase(),
  },
  upper: {
    name: 'upper',
    sig: 'upper(text)',
    desc: 'Uppercase text',
    minArgs: 1,
    maxArgs: 1,
    run: (args) => toStr(args[0]).toUpperCase(),
  },
  trim: {
    name: 'trim',
    sig: 'trim(text)',
    desc: 'Strip whitespace',
    minArgs: 1,
    maxArgs: 1,
    run: (args) => toStr(args[0]).trim(),
  },
  concat: {
    name: 'concat',
    sig: 'concat(a, b, …)',
    desc: 'Join text',
    minArgs: 1,
    maxArgs: 64,
    run: (args) => args.map(toStr).join(''),
  },
  split: {
    name: 'split',
    sig: 'split(text, sep)',
    desc: 'Split into list',
    minArgs: 2,
    maxArgs: 2,
    run: (args) => toStr(args[0]).split(toStr(args[1])),
  },
  coalesce: {
    name: 'coalesce',
    sig: 'coalesce(a, b, …)',
    desc: 'First non-empty',
    minArgs: 1,
    maxArgs: 64,
    run: (args) => {
      for (const a of args) {
        if (a !== null && a !== undefined && a !== '') return a
      }
      return null
    },
  },
  if: {
    name: 'if',
    sig: 'if(cond, then, else)',
    desc: 'Conditional',
    minArgs: 3,
    maxArgs: 3,
    run: (args) => (isTruthy(args[0]) ? args[1] : args[2]),
  },
  round: {
    name: 'round',
    sig: 'round(n, digits?)',
    desc: 'Round number',
    minArgs: 1,
    maxArgs: 2,
    run: (args) => {
      const n = toNumStrict(args[0])
      const digits = args.length > 1 ? Math.max(0, Math.floor(toNumStrict(args[1]))) : 0
      const pow = Math.pow(10, digits)
      return Math.round(n * pow) / pow
    },
  },
  format_date: {
    name: 'format_date',
    sig: 'format_date(d, fmt)',
    desc: 'Format a date',
    minArgs: 2,
    maxArgs: 2,
    run: (args) => {
      const raw = args[0]
      const fmt = toStr(args[1])
      let d: Date
      if (raw instanceof Date) d = raw
      else if (typeof raw === 'number') d = new Date(raw)
      else if (typeof raw === 'string' && raw !== '') d = new Date(raw)
      else throw new Error('format_date: invalid date input')
      if (!Number.isFinite(d.getTime())) throw new Error('format_date: invalid date')
      return formatDate(d, fmt)
    },
  },
  domain_of: {
    name: 'domain_of',
    sig: 'domain_of(email)',
    desc: 'acme.io from jane@acme.io',
    minArgs: 1,
    maxArgs: 1,
    run: (args) => {
      const s = toStr(args[0])
      const at = s.lastIndexOf('@')
      if (at < 0) return s
      return s.slice(at + 1)
    },
  },
  regex: {
    name: 'regex',
    sig: 'regex(text, pattern)',
    desc: 'Extract match',
    minArgs: 2,
    maxArgs: 2,
    run: (args) => {
      const s = toStr(args[0])
      const pat = toStr(args[1])
      try {
        const m = s.match(new RegExp(pat))
        if (!m) return null
        return m[1] ?? m[0]
      } catch {
        throw new Error('regex: invalid pattern')
      }
    },
  },
}

export const FORMULA_FN_LIST: FormulaFn[] = Object.values(FORMULA_FUNCTIONS)

export function isTruthy(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
  if (typeof v === 'string') return v !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}
