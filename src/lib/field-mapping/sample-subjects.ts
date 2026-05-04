import type { ObjectId, SampleSubject } from './types'

// Supabase server/admin client type varies with project generics. Library layer
// uses a loose alias to stay destination-agnostic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Fetch sample subjects for the live-preview picker.
 *
 * v1 strategy:
 *   - group_org subjects (for Companies / Workspaces / Deals that source from orgs)
 *     come from the workspace's `accounts` table — real Beton-derived org data.
 *   - person subjects come from a small synthetic seed until PostHog person sync lands.
 *
 * The SampleSubject.props shape mirrors what the formula engine expects:
 *   - common PostHog properties (email, name, sessions_7d, etc.)
 *   - Beton-computed properties (health_score, concrete_grade, etc.)
 * so formulas referencing `person.*`, `group.*`, or `beton.*` can resolve.
 */
export async function fetchSampleSubjects(
  supabase: SupabaseClient,
  workspaceId: string,
  objectId: ObjectId,
  limit = 10,
): Promise<SampleSubject[]> {
  const subjectKind = objectIdToSubjectKind(objectId)

  if (subjectKind === 'group_org') {
    return fetchAccountSubjects(supabase, workspaceId, limit)
  }

  return getDemoPersons(limit)
}

function objectIdToSubjectKind(objectId: ObjectId): 'person' | 'group_org' {
  return objectId === 'people' ? 'person' : 'group_org'
}

async function fetchAccountSubjects(
  supabase: SupabaseClient,
  workspaceId: string,
  limit: number,
): Promise<SampleSubject[]> {
  // Note: `as any` cast is the project pattern — supabase types lag behind schema.
  const { data } = await (supabase as any)
    .from('accounts')
    .select('id, name, domain, health_score, signal_count, last_signal_at, concrete_grade')
    .eq('workspace_id', workspaceId)
    .order('signal_count', { ascending: false, nullsLast: true })
    .limit(limit)

  const rows = (data ?? []) as Array<{
    id: string
    name: string | null
    domain: string | null
    health_score: number | null
    signal_count: number | null
    last_signal_at: string | null
    concrete_grade: string | null
  }>

  if (rows.length === 0) return getDemoOrgs(limit)

  return rows.map((r) => ({
    id: `acc-${r.id}`,
    name: r.name ?? r.domain ?? '(unknown)',
    domain: r.domain ?? undefined,
    lastSeen: r.last_signal_at ?? undefined,
    props: {
      // PostHog-shape props
      name: r.name ?? '',
      domain: r.domain ?? '',
      // Beton-computed props
      health_score: r.health_score ?? 0,
      signal_count: r.signal_count ?? 0,
      concrete_grade: r.concrete_grade ?? '',
      last_signal_date: r.last_signal_at ?? '',
      account_name: r.name ?? '',
    },
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo fallbacks — used when workspace has no accounts or for persons pre-PostHog-sync.
// Matches the prototype's TEST_SUBJECTS shape so previews behave identically.
// ─────────────────────────────────────────────────────────────────────────────

function getDemoPersons(limit: number): SampleSubject[] {
  const all: SampleSubject[] = [
    {
      id: 'ph-p-1a2b3c',
      name: 'Jane Cooper',
      email: 'jane@acme.io',
      distinctId: '01925f32-8a41-7a9d-acme-01',
      lastSeen: '2h ago',
      props: {
        email: 'jane@acme.io',
        name: 'Jane Cooper',
        first_name: 'Jane',
        last_name: 'Cooper',
        job_title: 'Head of Growth',
        role: 'admin',
        phone: '+1 415 555 0143',
        city: 'San Francisco',
        country: 'United States',
        region: 'California',
        first_seen: '2024-08-02T14:22:10Z',
        last_seen: '2025-11-14T09:41:03Z',
        sessions_7d: 12,
        sessions_30d: 47,
        events_30d: 831,
        plan: 'growth',
        signed_up_at: '2024-07-19T11:02:00Z',
        utm_source: 'hackernews',
        activation_score: 78,
      },
    },
    {
      id: 'ph-p-5x9y',
      name: 'Devon Martinez',
      email: 'devon@northwind.co',
      distinctId: '01925f32-aa11-7b01-nw-08',
      lastSeen: '14h ago',
      props: {
        email: 'devon@northwind.co',
        name: 'Devon Martinez',
        first_name: 'Devon',
        last_name: 'Martinez',
        job_title: 'VP Engineering',
        role: 'owner',
        city: 'Austin',
        country: 'United States',
        region: 'Texas',
        first_seen: '2023-11-14T09:02:18Z',
        last_seen: '2025-11-13T22:10:41Z',
        sessions_7d: 4,
        sessions_30d: 19,
        events_30d: 312,
        plan: 'enterprise',
        activation_score: 92,
      },
    },
    {
      id: 'ph-p-ze88',
      name: 'Priya Shah',
      email: 'priya@lumen.studio',
      distinctId: '01925f42-ce99-7c02-ls-02',
      lastSeen: '3d ago',
      props: {
        email: 'priya@lumen.studio',
        name: 'Priya Shah',
        first_name: 'Priya',
        last_name: 'Shah',
        job_title: 'Founder',
        role: 'owner',
        city: 'Bengaluru',
        country: 'India',
        region: 'Karnataka',
        first_seen: '2025-09-20T11:30:00Z',
        last_seen: '2025-11-11T06:22:00Z',
        sessions_7d: 1,
        sessions_30d: 3,
        events_30d: 28,
        plan: 'starter',
        activation_score: 22,
      },
    },
  ]
  return all.slice(0, limit)
}

function getDemoOrgs(limit: number): SampleSubject[] {
  const all: SampleSubject[] = [
    {
      id: 'ph-g-acme',
      name: 'Acme Robotics',
      domain: 'acme.io',
      memberCount: 42,
      lastSeen: '2h ago',
      props: {
        name: 'Acme Robotics',
        domain: 'acme.io',
        slug: 'acme-robotics',
        plan: 'growth',
        seat_count: 42,
        mau_30d: 28,
        events_30d: 14820,
        signed_up_at: '2024-02-11T15:00:00Z',
        industry: 'Hardware',
        country: 'United States',
        activation_score: 64,
        mrr: 1490,
        // Beton-computed
        health_score: 72,
        signal_count: 14,
        concrete_grade: 'M75',
        last_signal_date: '2026-04-20T12:00:00Z',
        account_name: 'Acme Robotics',
      },
    },
    {
      id: 'ph-g-nw',
      name: 'Northwind Labs',
      domain: 'northwind.co',
      memberCount: 8,
      lastSeen: '14h ago',
      props: {
        name: 'Northwind Labs',
        domain: 'northwind.co',
        plan: 'enterprise',
        seat_count: 8,
        mau_30d: 8,
        events_30d: 9200,
        industry: 'SaaS',
        country: 'United States',
        activation_score: 88,
        mrr: 4800,
        health_score: 91,
        signal_count: 22,
        concrete_grade: 'M100',
        last_signal_date: '2026-04-22T09:15:00Z',
        account_name: 'Northwind Labs',
      },
    },
  ]
  return all.slice(0, limit)
}
