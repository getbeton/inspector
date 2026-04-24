import {
  assertCompanyByDomain,
  assertPersonByEmail,
  getRecord,
  linkPersonToCompany,
} from '@/lib/integrations/attio/client'
import { isLinkMarker, type LinkMarker } from './payload'
import type { FieldSchema, LinkOutcome, ObjectId } from './types'

/**
 * Resolve link-marker values in the payload into Attio-shaped wire values.
 *
 * Walks each payload entry, detects LinkMarkers (emitted by evalSource for
 * link_* / actor_* source types), and substitutes the marker with either:
 *   - a record-reference array `[{target_object, target_record_id}]` for `link_*`
 *   - an email string for `actor_*` (Attio accepts email shorthand on
 *     actor-reference attributes)
 *
 * Returns the mutated payload + per-field outcomes so the TestModal and
 * ImpactPanel can surface match/create counts.
 *
 * This function is Attio-specific and intentionally lives in the adapter
 * layer; HubSpot will have its own equivalent when that adapter lands.
 */
export interface ResolveLinksOptions {
  autoLinkPersonToCompany?: boolean
}

export async function resolveAttioLinks(
  payload: Record<string, unknown>,
  fields: FieldSchema[],
  apiKey: string,
  options: ResolveLinksOptions = {},
): Promise<{ payload: Record<string, unknown>; outcomes: LinkOutcome[] }> {
  const autoLink = options.autoLinkPersonToCompany !== false
  const outcomes: LinkOutcome[] = []
  const out: Record<string, unknown> = {}

  // Cache: one assert per (email/domain) per request. A Deal might link
  // associated_people AND owner to the same subject's email — we only want
  // to assert the Person once.
  const personCache = new Map<
    string,
    { recordId: string; wasCreated: boolean; companyRecordId: string | null }
  >()
  const companyCache = new Map<string, { recordId: string; wasCreated: boolean }>()

  const resolvePerson = async (email: string) => {
    const cached = personCache.get(email)
    if (cached) return cached
    const r = await assertPersonByEmail(apiKey, email)
    personCache.set(email, r)
    return r
  }

  const resolveCompany = async (domain: string) => {
    const cached = companyCache.get(domain)
    if (cached) return cached
    const r = await assertCompanyByDomain(apiKey, domain)
    companyCache.set(domain, r)
    return r
  }

  for (const [fieldId, value] of Object.entries(payload)) {
    if (!isLinkMarker(value)) {
      out[fieldId] = value
      continue
    }
    const field = fields.find((f) => f.id === fieldId)
    try {
      const result = await resolveMarker(value, {
        resolvePerson,
        resolveCompany,
        apiKey,
        autoLink,
        targetObjectId: field?.targetObjectId,
      })
      if (result === null) {
        outcomes.push({ fieldId, status: 'null', reason: 'Resolved to nothing' })
        // Drop the field — Attio will treat absent key as null-no-op.
        continue
      }
      out[fieldId] = result.value
      outcomes.push({
        fieldId,
        status: result.wasCreated ? 'created' : 'matched',
        recordId: result.recordId,
        targetObject: result.targetObject,
        webUrl: result.webUrl,
      })
    } catch (err) {
      outcomes.push({
        fieldId,
        status: 'error',
        reason: err instanceof Error ? err.message : 'Unknown error',
      })
      // Leave the field unset on error — the main create will continue
      // with the other links intact.
    }
  }

  return { payload: out, outcomes }
}

interface ResolutionResult {
  value: unknown
  recordId?: string
  targetObject?: ObjectId
  wasCreated: boolean
  webUrl?: string
}

async function resolveMarker(
  marker: LinkMarker,
  ctx: {
    resolvePerson: (
      email: string,
    ) => Promise<{ recordId: string; wasCreated: boolean; companyRecordId: string | null }>
    resolveCompany: (
      domain: string,
    ) => Promise<{ recordId: string; wasCreated: boolean }>
    apiKey: string
    autoLink: boolean
    targetObjectId: ObjectId | undefined
  },
): Promise<ResolutionResult | null> {
  switch (marker.__linkKind) {
    case 'subject_person': {
      if (!marker.subjectEmail) return null
      const p = await ctx.resolvePerson(marker.subjectEmail)
      if (p.wasCreated && ctx.autoLink) {
        await autoLinkNewPersonToCompany(p, marker.subjectEmail, ctx)
      }
      return {
        value: [{ target_object: 'people', target_record_id: p.recordId }],
        recordId: p.recordId,
        targetObject: 'people',
        wasCreated: p.wasCreated,
      }
    }

    case 'subject_company_by_domain': {
      if (!marker.subjectDomain) return null
      const c = await ctx.resolveCompany(marker.subjectDomain)
      return {
        value: [{ target_object: 'companies', target_record_id: c.recordId }],
        recordId: c.recordId,
        targetObject: 'companies',
        wasCreated: c.wasCreated,
      }
    }

    case 'subject_company_via_person': {
      if (!marker.subjectEmail) return null
      const p = await ctx.resolvePerson(marker.subjectEmail)
      if (!p.companyRecordId) {
        // Fallback — if the Person has no company linked yet, try assert-by-domain.
        const domain = marker.subjectEmail.split('@')[1]?.toLowerCase()
        if (domain) {
          const c = await ctx.resolveCompany(domain)
          if (ctx.autoLink) {
            try {
              await linkPersonToCompany(ctx.apiKey, p.recordId, c.recordId)
            } catch {
              // Non-fatal; the Deal can still reference the Company directly.
            }
          }
          return {
            value: [{ target_object: 'companies', target_record_id: c.recordId }],
            recordId: c.recordId,
            targetObject: 'companies',
            wasCreated: c.wasCreated,
          }
        }
        return null
      }
      return {
        value: [{ target_object: 'companies', target_record_id: p.companyRecordId }],
        recordId: p.companyRecordId,
        targetObject: 'companies',
        wasCreated: false,
      }
    }

    case 'specific_record': {
      if (!marker.recordId || !marker.targetObject) return null
      // Confirm the record still exists so we fail fast with a clear outcome.
      // Cheap GET vs. writing a reference that Attio will 400 on later.
      try {
        await getRecord(ctx.apiKey, marker.targetObject, marker.recordId)
      } catch {
        // Let the write attempt surface the real error downstream.
      }
      return {
        value: [
          { target_object: marker.targetObject, target_record_id: marker.recordId },
        ],
        recordId: marker.recordId,
        targetObject: marker.targetObject as ObjectId,
        wasCreated: false,
      }
    }

    case 'actor_subject_email': {
      if (!marker.subjectEmail) return null
      // Attio accepts actor-reference as an array of email shorthand strings.
      return {
        value: [marker.subjectEmail],
        wasCreated: false,
      }
    }

    case 'actor_account_owner': {
      if (!marker.accountOwnerEmail) return null
      return {
        value: [marker.accountOwnerEmail],
        wasCreated: false,
      }
    }
  }
}

async function autoLinkNewPersonToCompany(
  person: { recordId: string; wasCreated: boolean; companyRecordId: string | null },
  email: string,
  ctx: {
    resolveCompany: (
      domain: string,
    ) => Promise<{ recordId: string; wasCreated: boolean }>
    apiKey: string
  },
): Promise<void> {
  if (person.companyRecordId) return
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return
  try {
    const company = await ctx.resolveCompany(domain)
    await linkPersonToCompany(ctx.apiKey, person.recordId, company.recordId)
  } catch {
    // Non-fatal. The main write continues; the Person just won't have a
    // company link for this particular run (next sync will retry).
  }
}
