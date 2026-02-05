"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ProgressIndicator } from "./ProgressIndicator";
import { PostHogStep } from "./steps/PostHogStep";
import { BillingStep } from "./steps/BillingStep";
import { AttioStep } from "./steps/AttioStep";

/**
 * Wizard step identifiers
 */
type WizardStep = "posthog" | "billing" | "attio" | "complete";

/**
 * Step display labels for the progress indicator
 */
const STEP_LABELS: Record<WizardStep, string> = {
  posthog: "PostHog",
  billing: "Billing",
  attio: "Attio",
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
   * Optional CSS class for the container
   */
  className?: string;
}

/**
 * Main setup wizard container component
 *
 * Orchestrates the multi-step onboarding flow:
 * - PostHog connection (required)
 * - Billing setup (cloud mode only, skipped for self-hosted)
 * - Attio CRM connection (required)
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
  className,
}: SetupWizardProps) {
  const router = useRouter();

  // Compute the first incomplete step so the wizard resumes where the user left off
  const getInitialStep = (): WizardStep => {
    if (!setupStatus) return "posthog";
    if (!setupStatus.integrations.posthog) return "posthog";
    if (!setupStatus.integrations.attio) return "attio";
    if (billingEnabled && !setupStatus.billing.configured) return "billing";
    return "complete";
  };

  // Current step in the wizard
  const [currentStep, setCurrentStep] = useState<WizardStep>(getInitialStep);

  // Data passed between steps
  const [mtuCount, setMtuCount] = useState<number>(0);

  /**
   * Compute the list of steps based on billing mode
   * Self-hosted: PostHog → Attio
   * Cloud: PostHog → Attio → Billing
   */
  const steps = useMemo(() => {
    if (billingEnabled) {
      return ["posthog", "attio", "billing"] as WizardStep[];
    }
    return ["posthog", "attio"] as WizardStep[];
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
   * Handle PostHog step completion
   */
  const handlePostHogSuccess = useCallback(
    (data: { mtuCount: number; region: string }) => {
      setMtuCount(data.mtuCount);
      setCurrentStep(getNextStep("posthog"));
    },
    [getNextStep]
  );

  /**
   * Handle Billing step completion
   */
  const handleBillingComplete = useCallback(() => {
    const next = getNextStep("billing");
    if (next === "complete") {
      router.push("/signals");
    } else {
      setCurrentStep(next);
    }
  }, [getNextStep, router]);

  /**
   * Handle Attio step completion
   */
  const handleAttioSuccess = useCallback(() => {
    const next = getNextStep("attio");
    if (next === "complete") {
      router.push("/signals");
    } else {
      setCurrentStep(next);
    }
  }, [getNextStep, router]);

  /**
   * Render the current step content
   */
  const renderStep = () => {
    switch (currentStep) {
      case "posthog":
        return <PostHogStep onSuccess={handlePostHogSuccess} />;
      case "billing":
        return <BillingStep mtuCount={mtuCount} onComplete={handleBillingComplete} />;
      case "attio":
        return <AttioStep onSuccess={handleAttioSuccess} />;
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
