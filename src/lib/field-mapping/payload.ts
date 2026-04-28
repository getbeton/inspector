import { evaluateFormula, isBareStringLiteral, type EvalResult, type Subject } from '@/lib/formula'
import type { FieldSchema, MappingRow, SampleSubject, Source } from './types'

/**
 * Evaluate a single source against a subject.
 * Mirrors the prototype's evalSource() — shared between UI live preview and server payload build.
 */
export function evalSource(source: Source, subject: SampleSubject | null): EvalResult {
  if (!source || source.type === 'none') {
    return { ok: false, reason: 'No source configured' }
  }

  if (source.type === 'option') {
    return { ok: true, value: source.value, text: source.value }
  }

  if (source.type === 'property') {
    const v = subject?.props?.[source.prop]
    if (v === null || v === undefined || v === '') {
      return {
        ok: false,
        reason: `${source.prop} is empty on this subject`,
      }
    }
    let out: unknown = v
    if (source.transform === '* 12' && typeof v === 'number') out = v * 12
    return {
      ok: true,
      value: out,
      text: typeof out === 'string' ? out : JSON.stringify(out),
    }
  }

  if (source.type === 'formula') {
    // Bare string literal short-circuit: "Qualified" → "Qualified"
    if (isBareStringLiteral(source.expr)) {
      const value = source.expr.trim().slice(1, -1)
      return { ok: true, value, text: value }
    }
    return evaluateFormula(source.expr, (subject ?? null) as Subject | null)
  }

  return { ok: false, reason: 'Unknown source type' }
}

/**
 * Build a payload (destination field id → value) from mapping rows + subject.
 * Rows that fail to evaluate are included with `null` — the adapter can drop or flag them.
 */
export function buildPayload(
  rows: MappingRow[],
  fields: FieldSchema[],
  subject: SampleSubject | null,
): { payload: Record<string, unknown>; nullFields: string[] } {
  const payload: Record<string, unknown> = {}
  const nullFields: string[] = []

  for (const field of fields) {
    const row = rows.find((r) => r.fieldId === field.id)
    if (!row || !row.source || row.source.type === 'none') continue

    const r = evalSource(row.source, subject)
    if (r.ok) {
      payload[field.id] = r.value
    } else {
      payload[field.id] = null
      nullFields.push(field.id)
    }
  }

  return { payload, nullFields }
}
