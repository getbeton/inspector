/**
 * Sample data types and defaults for setup wizard previews.
 *
 * Shared between SetupWizard (client) and the sample-data API route (server)
 * so the fallback shape stays in sync.
 */

/**
 * Shape returned by /api/integrations/attio/sample-data.
 * Extends Record<string, unknown> so it can be passed directly
 * to resolveTemplate() without casting.
 */
export interface SampleData extends Record<string, unknown> {
  company_name: string
  company_domain: string
  signal_name: string
  signal_type: string
  health_score: number
  signal_count: number
  deal_value: number
  detected_at: string
}

/**
 * Hardcoded fallback when no real account data exists in the workspace.
 */
export const FALLBACK_SAMPLE: SampleData = {
  company_name: "Acme Corp",
  company_domain: "acme.com",
  signal_name: "Product Qualified Lead",
  signal_type: "pql",
  health_score: 85,
  signal_count: 12,
  deal_value: 48000,
  detected_at: new Date().toISOString().split("T")[0],
}
