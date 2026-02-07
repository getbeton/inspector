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
