"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { trackSetupStepCompleted, trackOnboardingCompleted } from "@/lib/analytics";
import { ProgressIndicator } from "./ProgressIndicator";
import { PostHogStep } from "./steps/PostHogStep";
import { BillingStep } from "./steps/BillingStep";
import { AttioStep } from "./steps/AttioStep";
import { AttioFieldMappingStep } from "./steps/AttioFieldMappingStep";
import { WebsiteStep } from "./steps/WebsiteStep";

/**
 * Wizard step identifiers
 */
type WizardStep = "posthog" | "attio" | "attio_mapping" | "website" | "billing" | "complete";

/**
 * Step display labels for the progress indicator
 */
const STEP_LABELS: Record<WizardStep, string> = {
  posthog: "PostHog",
  attio: "Attio",
  attio_mapping: "Field Mapping",
  website: "Website",
  billing: "Billing",
  complete: "Complete",
};

export interface SetupWizardProps {
  /**
   * Whether billing is enabled (cloud mode)
   * When false, the billing step is skipped (self-hosted mode)
   */
  billingEnabled?: boolean;
  /**
   * Current setup status — used to skip already-completed steps
   */
  setupStatus?: {
    integrations: { posthog: boolean; attio: boolean };
    billing: { configured: boolean };
  };
  /**
   * Pre-detected website URL from auth callback domain detection
   */
  websiteUrl?: string | null;
  /**
   * Optional CSS class for the container
   */
  className?: string;
}

/**
 * Main setup wizard container component
 *
 * Orchestrates the multi-step onboarding flow:
 * 1. PostHog connection (required)
 * 2. Attio CRM connection (required)
 * 3. Attio field mapping (new — maps Beton fields to Attio attributes)
 * 4. Website confirmation (new — pre-filled from email domain)
 * 5. Billing setup (cloud mode only)
 *
 * Features:
 * - State machine for step transitions
 * - Progress indicator showing current step
 * - Passes MTU count from PostHog to Billing step
 * - Navigates to /signals on completion
 */
export function SetupWizard({
  billingEnabled = false,
  setupStatus,
  websiteUrl,
  className,
}: SetupWizardProps) {
  const router = useRouter();

  // Compute the first incomplete step so the wizard resumes where the user left off
  const getInitialStep = (): WizardStep => {
    if (!setupStatus) return "posthog";
    if (!setupStatus.integrations.posthog) return "posthog";
    if (!setupStatus.integrations.attio) return "attio";
    // After Attio is connected, proceed to mapping → website → billing
    if (billingEnabled && !setupStatus.billing.configured) return "billing";
    return "complete";
  };

  // Current step in the wizard
  const [currentStep, setCurrentStep] = useState<WizardStep>(getInitialStep);

  // Data passed between steps
  const [mtuCount, setMtuCount] = useState<number>(0);

  /**
   * Compute the list of steps based on billing mode
   * Cloud: PostHog → Attio → Field Mapping → Website → Billing
   * Self-hosted: PostHog → Attio → Field Mapping → Website
   */
  const steps = useMemo(() => {
    const base: WizardStep[] = ["posthog", "attio", "attio_mapping", "website"];
    if (billingEnabled) {
      base.push("billing");
    }
    return base;
  }, [billingEnabled]);

  /**
   * Get display labels for progress indicator
   */
  const stepLabels = useMemo(() => {
    return steps.map((step) => STEP_LABELS[step]);
  }, [steps]);

  /**
   * Get the current step label for progress indicator
   */
  const currentStepLabel = STEP_LABELS[currentStep];

  /**
   * Get the next step in the sequence
   */
  const getNextStep = useCallback(
    (current: WizardStep): WizardStep => {
      const currentIndex = steps.indexOf(current);
      if (currentIndex === -1 || currentIndex >= steps.length - 1) {
        return "complete";
      }
      return steps[currentIndex + 1];
    },
    [steps]
  );

  /**
   * Advance to next step or finish
   */
  const advanceFrom = useCallback(
    (step: WizardStep) => {
      trackSetupStepCompleted(step);
      const next = getNextStep(step);
      if (next === "complete") {
        trackOnboardingCompleted();
        router.push("/signals");
      } else {
        setCurrentStep(next);
      }
    },
    [getNextStep, router]
  );

  /**
   * Handle PostHog step completion
   */
  const handlePostHogSuccess = useCallback(
    (data: { mtuCount: number; region: string }) => {
      setMtuCount(data.mtuCount);
      advanceFrom("posthog");
    },
    [advanceFrom]
  );

  /**
   * Handle Attio step completion
   */
  const handleAttioSuccess = useCallback(() => {
    advanceFrom("attio");
  }, [advanceFrom]);

  /**
   * Handle Attio field mapping completion
   */
  const handleFieldMappingSuccess = useCallback(() => {
    advanceFrom("attio_mapping");
  }, [advanceFrom]);

  /**
   * Handle Website step completion
   */
  const handleWebsiteSuccess = useCallback(() => {
    advanceFrom("website");
  }, [advanceFrom]);

  /**
   * Handle Billing step completion
   */
  const handleBillingComplete = useCallback(() => {
    advanceFrom("billing");
  }, [advanceFrom]);

  /**
   * Render the current step content
   */
  const renderStep = () => {
    switch (currentStep) {
      case "posthog":
        return <PostHogStep onSuccess={handlePostHogSuccess} />;
      case "attio":
        return <AttioStep onSuccess={handleAttioSuccess} />;
      case "attio_mapping":
        return <AttioFieldMappingStep onSuccess={handleFieldMappingSuccess} />;
      case "website":
        return <WebsiteStep initialUrl={websiteUrl} onSuccess={handleWebsiteSuccess} />;
      case "billing":
        return <BillingStep mtuCount={mtuCount} onComplete={handleBillingComplete} />;
      case "complete":
        return null;
      default:
        return null;
    }
  };

  return (
    <div className={cn("w-full max-w-lg mx-auto", className)} data-slot="setup-wizard">
      {/* Progress Indicator */}
      <div className="mb-8">
        <ProgressIndicator steps={stepLabels} current={currentStepLabel} />
      </div>

      {/* Step Content */}
      <Card className="p-6">{renderStep()}</Card>

      {/* Optional footer with step info */}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Step {steps.indexOf(currentStep) + 1} of {steps.length}
      </p>
    </div>
  );
}

export default SetupWizard;
