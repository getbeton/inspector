/**
 * Setup wizard components
 *
 * These components power the onboarding flow for new workspaces:
 * - SetupWizard: Main wizard container orchestrating all steps
 * - ProgressIndicator: Visual step tracker
 * - PostHogStep: PostHog integration step with region selector
 * - BillingStep: Stripe billing step with MTU display
 * - AttioStep: Attio CRM integration step
 */

export { SetupWizard, type SetupWizardProps } from './SetupWizard';
export { ProgressIndicator, type ProgressIndicatorProps } from './ProgressIndicator';
export { PostHogStep, type PostHogStepProps } from './steps/PostHogStep';
export { BillingStep, type BillingStepProps } from './steps/BillingStep';
export { AttioStep, type AttioStepProps } from './steps/AttioStep';
export { SetupBanner } from './SetupBanner';
