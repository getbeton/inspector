/**
 * Google Tag Manager DataLayer Utilities
 *
 * This module provides type-safe helpers for pushing events to the GTM dataLayer.
 * All tracking events should go through these functions to ensure consistency
 * and enable easy debugging.
 */

type DataLayerEvent = {
  event: string
  [key: string]: unknown
}

/**
 * Push a custom event to the GTM dataLayer.
 * Safe to call on the server (no-op) or before GTM loads.
 *
 * Note: @next/third-parties declares window.dataLayer as Object[],
 * so we cast our typed events when pushing.
 */
export function pushToDataLayer(data: DataLayerEvent): void {
  if (typeof window === 'undefined') return

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(data as unknown as object)
}

/**
 * Track a generic custom event.
 * Use this for business events like "signal_created", "integration_connected", etc.
 */
export function trackEvent(
  category: string,
  action: string,
  label?: string,
  value?: number
): void {
  pushToDataLayer({
    event: 'custom_event',
    event_category: category,
    event_action: action,
    event_label: label,
    event_value: value
  })
}

/**
 * Track a page view manually (useful for virtual page views in SPAs).
 * Note: @next/third-parties handles automatic page views, so this is optional.
 */
export function trackPageView(path: string, title?: string): void {
  pushToDataLayer({
    event: 'virtual_page_view',
    page_path: path,
    page_title: title
  })
}

/**
 * Track user identification (after login).
 * Pushes user properties to dataLayer for use in GTM tags.
 * Note: Only include non-PII identifiers.
 */
export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
  pushToDataLayer({
    event: 'user_identified',
    user_id: userId,
    ...properties
  })
}

/**
 * Track workspace context.
 * Useful for segmenting analytics by workspace/tenant.
 */
export function setWorkspaceContext(workspaceId: string, workspaceSlug: string): void {
  pushToDataLayer({
    event: 'workspace_context_set',
    workspace_id: workspaceId,
    workspace_slug: workspaceSlug
  })
}

/**
 * Track user signup event (new user registration).
 * GTM will forward this to PostHog as 'user_signed_up' event.
 */
export function trackSignup(
  userId: string,
  properties?: Record<string, unknown>
): void {
  pushToDataLayer({
    event: 'user_signup',
    user_id: userId,
    signup_method: 'google_oauth',
    ...properties,
  })
}

/**
 * Track user login event (returning user).
 * GTM will forward this to PostHog as 'user_logged_in' event.
 */
export function trackLogin(
  userId: string,
  properties?: Record<string, unknown>
): void {
  pushToDataLayer({
    event: 'user_login',
    user_id: userId,
    login_method: 'google_oauth',
    ...properties,
  })
}

// ---------------------------------------------------------------------------
// Onboarding & engagement events
// ---------------------------------------------------------------------------

/**
 * Track when user starts the demo tour from the pre-setup view.
 */
export function trackDemoTourStarted(): void {
  pushToDataLayer({ event: 'demo_tour_started' })
}

/**
 * Track when user exits demo mode (clicks "Connect real data" in banner).
 */
export function trackDemoTourCompleted(): void {
  pushToDataLayer({ event: 'demo_tour_completed' })
}

/**
 * Track when user clicks "Connect Your Data" from the pre-setup view.
 */
export function trackSetupStarted(): void {
  pushToDataLayer({ event: 'setup_started' })
}

/**
 * Track when a setup wizard step becomes active (visible to the user).
 */
export function trackOnboardingStepViewed(props: {
  step_key: string
  step_name: string
  is_optional: boolean
  step_index: number
}): void {
  pushToDataLayer({ event: 'onboarding_step_viewed', ...props })
}

/**
 * Track completion of individual setup wizard steps.
 * Enhanced with timing and metadata for funnel analysis.
 */
export function trackSetupStepCompleted(
  step: string,
  props?: {
    step_name?: string
    is_optional?: boolean
    duration_ms?: number
  }
): void {
  pushToDataLayer({ event: 'setup_step_completed', step, ...props })
}

/**
 * Track when a user skips an optional setup step.
 */
export function trackOnboardingStepSkipped(props: {
  step_key: string
  step_name: string
}): void {
  pushToDataLayer({ event: 'onboarding_step_skipped', ...props })
}

/**
 * Track when an integration is successfully connected during setup.
 * Enhanced with deployment mode and category for segmentation.
 */
export function trackIntegrationConnected(
  integration: string,
  props?: {
    mode?: 'cloud' | 'self_hosted'
    category?: string
  }
): void {
  pushToDataLayer({
    event: 'integration_connected',
    integration,
    ...props,
  })
}

/**
 * Track when an integration connection attempt fails.
 * No PII — only error codes and sanitized messages.
 */
export function trackIntegrationConnectionFailed(props: {
  integration_name: string
  error_code?: string
  error_message?: string
}): void {
  pushToDataLayer({ event: 'integration_connection_failed', ...props })
}

/**
 * Track when user toggles to PostHog self-hosted mode.
 */
export function trackPostHogSelfHostedSelected(): void {
  pushToDataLayer({ event: 'posthog_self_hosted_selected' })
}

/**
 * Track when user selects a Firecrawl proxy tier.
 */
export function trackFirecrawlProxyTierSelected(proxy_tier: string): void {
  pushToDataLayer({ event: 'firecrawl_proxy_tier_selected', proxy_tier })
}

/**
 * Track when a payment card is linked during billing setup.
 */
export function trackCardLinked(): void {
  pushToDataLayer({ event: 'card_linked' })
}

/**
 * Track when a user views their first signal detail page.
 * Uses sessionStorage to deduplicate within a session.
 */
export function trackFirstSignalViewed(signalId: string): void {
  if (typeof window === 'undefined') return
  const key = 'beton_first_signal_viewed'
  if (sessionStorage.getItem(key)) return
  sessionStorage.setItem(key, '1')
  pushToDataLayer({ event: 'first_signal_viewed', signal_id: signalId })
}

/**
 * Track when the full onboarding flow is completed.
 * Enhanced with aggregate stats for funnel analysis and Intercom forwarding.
 */
export function trackOnboardingCompleted(props?: {
  total_duration_ms?: number
  steps_completed?: number
  steps_skipped?: number
  integrations?: string[]
}): void {
  pushToDataLayer({ event: 'onboarding_completed', ...props })
}

// ---------------------------------------------------------------------------
// Attio entity events
// ---------------------------------------------------------------------------

/**
 * Track when an Attio entity (company, person, deal) is created.
 */
export function trackAttioEntityCreated(props: {
  object_type: 'company' | 'person' | 'deal'
  context: 'onboarding' | 'standalone'
}): void {
  pushToDataLayer({ event: 'attio_entity_created', ...props })
}

/**
 * Track when an Attio entity creation fails.
 */
export function trackAttioEntityCreationFailed(props: {
  object_type: 'company' | 'person' | 'deal'
  error_code?: string
}): void {
  pushToDataLayer({ event: 'attio_entity_creation_failed', ...props })
}

/**
 * Track when user selects a contact from the Attio contact picker.
 */
export function trackAttioContactPickerUsed(result_count: number): void {
  pushToDataLayer({ event: 'attio_contact_picker_used', result_count })
}

// ---------------------------------------------------------------------------
// User properties (forwarded via GTM to PostHog $set)
// ---------------------------------------------------------------------------

/**
 * Push user properties to dataLayer for GTM to forward as PostHog $set.
 * Called on onboarding completion to set persistent user traits.
 */
export function setOnboardingUserProperties(props: {
  onboarding_completed_at: string
  integrations_connected: string[]
  has_self_hosted_posthog: boolean
  has_firecrawl: boolean
}): void {
  pushToDataLayer({
    event: 'set_user_properties',
    user_properties_set: {
      onboarding_completed_at: props.onboarding_completed_at,
      integrations_connected: props.integrations_connected,
      has_self_hosted_posthog: props.has_self_hosted_posthog,
      has_firecrawl: props.has_firecrawl,
    },
  })
}

// ---------------------------------------------------------------------------
// Identity management
// ---------------------------------------------------------------------------

/**
 * Reset PostHog identity on logout.
 * GTM will call posthog.reset() to clear the identified user.
 * Also calls posthog.reset() directly if available for immediate effect.
 */
export function resetIdentity(): void {
  pushToDataLayer({ event: 'posthog_reset' })

  // Also call directly if posthog is available
  const posthog = typeof window !== 'undefined'
    ? (window as unknown as { posthog?: { reset?: () => void } }).posthog
    : null
  if (posthog?.reset) {
    posthog.reset()
  }
}
