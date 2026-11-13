/**
 * Destination adapter dispatch.
 *
 * Single place that maps a `Destination` name → a concrete `DestinationAdapter`,
 * so API routes and pages never branch on the CRM themselves. Adapters take an
 * injected supabase client (RLS- or admin-scoped by the caller); add a new
 * `case` here as each destination connector lands.
 */
import { createAttioAdapter } from './attio-adapter'
import { createHubSpotDestinationAdapter } from './hubspot-adapter'
import type { DestinationAdapter } from './adapter'
import type { Destination } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/** Caller-supplied context: just the supabase client the adapters need. */
export interface AdapterForContext {
  supabase: SupabaseClient
}

/**
 * Resolve the `DestinationAdapter` for a destination name.
 * Throws if `destination` is not a known/supported destination.
 */
export function adapterFor(destination: Destination, ctx: AdapterForContext): DestinationAdapter {
  switch (destination) {
    case 'attio':
      return createAttioAdapter({ supabase: ctx.supabase })
    case 'hubspot':
      return createHubSpotDestinationAdapter({ supabase: ctx.supabase })
    default: {
      // Exhaustiveness guard — surfaces a compile error if a Destination is added
      // without a dispatch case, and a clear runtime error for bad input.
      const exhaustive: never = destination
      throw new Error(`No adapter for destination "${String(exhaustive)}"`)
    }
  }
}
