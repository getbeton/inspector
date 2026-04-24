import { evaluateFormula, isBareStringLiteral, type EvalResult, type Subject } from '@/lib/formula'
import type { FieldSchema, MappingRow, SampleSubject, Source } from './types'

/**
 * Marker value that survives buildPayload → sendTest → resolveLinks. The
 * `resolveLinks` pass in each adapter unwraps these markers into
 * destination-specific wire shapes (record-reference arrays, actor-ref emails).
 *
 * Not persisted anywhere; a purely in-memory tagged union.
 */
export interface LinkMarker {
  __linkKind:
    | 'subject_person'
    | 'subject_company_by_domain'
    | 'subject_company_via_person'
    | 'specific_record'
    | 'actor_subject_email'
    | 'actor_account_owner'
  /** Attached for all link_subject_* and actor_subject_email. */
  subjectEmail?: string
  /** Attached for subject_company_by_domain. */
  subjectDomain?: string
  /** Attached for specific_record. */
  targetObject?: string
  recordId?: string
  /** Attached for actor_account_owner. */
  accountOwnerEmail?: string
}

export function isLinkMarker(v: unknown): v is LinkMarker {
  return (
    typeof v === 'object' &&
    v !== null &&
    '__linkKind' in v &&
    typeof (v as { __linkKind: unknown }).__linkKind === 'string'
  )
}

function extractDomain(email: string | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const d = email.slice(at + 1).trim().toLowerCase()
  return d || null
}

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

  // ── Entity-linking variants ─────────────────────────────────────
  if (source.type === 'link_subject_person') {
    const email = subject?.email
    if (!email) return { ok: false, reason: 'Subject has no email — cannot link Person' }
    const marker: LinkMarker = { __linkKind: 'subject_person', subjectEmail: email }
    return { ok: true, value: marker, text: `→ Person by email (${email})` }
  }

  if (source.type === 'link_subject_company_by_domain') {
    const email = subject?.email
    const domain = extractDomain(email) ?? subject?.domain ?? null
    if (!domain) return { ok: false, reason: 'Subject has no domain — cannot link Company' }
    const marker: LinkMarker = { __linkKind: 'subject_company_by_domain', subjectDomain: domain }
    return { ok: true, value: marker, text: `→ Company by domain (${domain})` }
  }

  if (source.type === 'link_subject_company_via_person') {
    const email = subject?.email
    if (!email) return { ok: false, reason: 'Subject has no email — cannot resolve Person.company' }
    const marker: LinkMarker = { __linkKind: 'subject_company_via_person', subjectEmail: email }
    return { ok: true, value: marker, text: `→ Company via Person.company (${email})` }
  }

  if (source.type === 'link_specific_record') {
    if (!source.recordId) return { ok: false, reason: 'No record pinned' }
    const marker: LinkMarker = {
      __linkKind: 'specific_record',
      targetObject: source.targetObject,
      recordId: source.recordId,
    }
    return { ok: true, value: marker, text: `→ Record ${source.recordId.slice(0, 8)}…` }
  }

  if (source.type === 'actor_subject_email') {
    const email = subject?.email
    if (!email) return { ok: false, reason: 'Subject has no email' }
    const marker: LinkMarker = { __linkKind: 'actor_subject_email', subjectEmail: email }
    return { ok: true, value: marker, text: `→ Owner = ${email} (if workspace member)` }
  }

  if (source.type === 'actor_account_owner') {
    const ownerEmail = subject?.props?.owner_email as string | undefined
    if (!ownerEmail || typeof ownerEmail !== 'string') {
      return {
        ok: false,
        reason: "accounts.owner_email isn't set for this subject",
      }
    }
    const marker: LinkMarker = { __linkKind: 'actor_account_owner', accountOwnerEmail: ownerEmail }
    return { ok: true, value: marker, text: `→ Owner = ${ownerEmail}` }
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
