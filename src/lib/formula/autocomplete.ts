import { FORMULA_FN_LIST } from './functions'
import type { FormulaFn } from './types'

export interface AutocompletePropItem {
  id: string
  label: string
  kind: string
  example?: string | number | undefined
}

export interface PropSuggestion {
  kind: 'prop'
  scope: 'person' | 'group' | 'beton'
  frag: string
  items: AutocompletePropItem[]
}

export interface FnSuggestion {
  kind: 'fn'
  frag: string
  items: FormulaFn[]
}

export type Suggestion = PropSuggestion | FnSuggestion | null

export interface AutocompleteContext {
  /** Properties available in each scope, keyed by scope. */
  properties: {
    person?: readonly AutocompletePropItem[]
    group?: readonly AutocompletePropItem[]
    beton?: readonly AutocompletePropItem[]
  }
}

/**
 * Given the current formula text and caret position, return what to suggest.
 * Mirrors the prototype's entity-picker autocomplete rules.
 */
export function autocomplete(
  expr: string,
  caret: number,
  ctx: AutocompleteContext,
): Suggestion {
  if (!expr) return null
  const left = expr.slice(0, Math.max(0, Math.min(caret, expr.length)))

  // Inside a property reference: person.foo / group.bar / beton.baz
  const mProp = left.match(/(person|group|beton)\.(\w*)$/)
  if (mProp) {
    const scope = mProp[1] as PropSuggestion['scope']
    const frag = mProp[2]
    const src = ctx.properties[scope] ?? []
    return {
      kind: 'prop',
      scope,
      frag,
      items: [...src]
        .filter((p) => p.id.toLowerCase().includes(frag.toLowerCase()))
        .slice(0, 8),
    }
  }

  // Function name suggestions at start or after whitespace / comma / open-paren
  const mFn = left.match(/(^|[\s(,])(\w+)$/)
  if (mFn) {
    const frag = mFn[2]
    return {
      kind: 'fn',
      frag,
      items: FORMULA_FN_LIST.filter((f) =>
        f.name.toLowerCase().startsWith(frag.toLowerCase()),
      ).slice(0, 6),
    }
  }

  return null
}
