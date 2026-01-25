/**
 * Setup wizard components
 *
 * These components power the onboarding flow for new workspaces:
 * - ProgressIndicator: Visual step tracker
 * - SetupWizard: Main wizard container (coming soon)
 * - PostHogStep: PostHog integration step
 * - BillingStep: Stripe billing step (coming soon)
 * - AttioStep: Attio CRM integration step (coming soon)
 */

export { ProgressIndicator, type ProgressIndicatorProps } from './ProgressIndicator';
export { PostHogStep, type PostHogStepProps } from './steps/PostHogStep';
