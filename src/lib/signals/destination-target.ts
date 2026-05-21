/**
 * Pure helpers for constructing signal sync-target payloads from the
 * signals/new destination picker.
 *
 * The PATCH /api/signals/custom endpoint accepts a `target` of the shape:
 *   { type, external_id, external_name?, auto_update }
 *
 * For each destination the `external_id` carries a different meaning:
 *   - posthog_cohort → the numeric cohort id (as a string)
 *   - attio_list     → the Attio list id
 *   - hubspot        → the HubSpot OBJECT TYPE to write to (contacts/companies/deals).
 *     See src/app/api/cron/sync-signals/route.ts where `target.external_id` is
 *     read as `objectType` (defaulting to 'contacts').
 *
 * Keeping this construction pure makes the mapping testable without spinning up
 * the React form.
 */

export type DestinationType = 'posthog_cohort' | 'attio_list' | 'hubspot'

/** HubSpot object types the destination picker offers (UI-singular). */
export type HubSpotObjectChoice = 'contact' | 'company' | 'deal'

/** API object-type names the sync cron expects in `external_id` (plural). */
export type HubSpotObjectApiName = 'contacts' | 'companies' | 'deals'

export interface SyncTargetPayload {
  type: DestinationType
  external_id: string
  external_name?: string
  auto_update: boolean
}

/**
 * Map the UI-facing singular HubSpot object choice to the plural object-type
 * API name stored in `external_id` and consumed by the sync cron.
 */
export function hubspotObjectApiName(choice: HubSpotObjectChoice): HubSpotObjectApiName {
  switch (choice) {
    case 'company':
      return 'companies'
    case 'deal':
      return 'deals'
    case 'contact':
    default:
      return 'contacts'
  }
}

/** Human label for a HubSpot object choice, used as the target's external_name. */
export function hubspotObjectLabel(choice: HubSpotObjectChoice): string {
  switch (choice) {
    case 'company':
      return 'HubSpot · Companies'
    case 'deal':
      return 'HubSpot · Deals'
    case 'contact':
    default:
      return 'HubSpot · Contacts'
  }
}

/**
 * Build the `target` payload for a HubSpot destination.
 *
 * `external_id` holds the plural object-type API name so the sync cron writes to
 * the correct HubSpot object. `auto_update` defaults to true — a HubSpot target
 * only makes sense when it keeps firing on new matches.
 */
export function buildHubSpotTarget(
  choice: HubSpotObjectChoice,
  options: { autoUpdate?: boolean } = {},
): SyncTargetPayload {
  return {
    type: 'hubspot',
    external_id: hubspotObjectApiName(choice),
    external_name: hubspotObjectLabel(choice),
    auto_update: options.autoUpdate ?? true,
  }
}
