"use client";

import { useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { trackSetupStepCompleted, trackOnboardingCompleted } from "@/lib/analytics";
import { ProgressIndicator } from "./ProgressIndicator";
import { PostHogStep } from "./steps/PostHogStep";
import { BillingStep } from "./steps/BillingStep";
import { AttioStep } from "./steps/AttioStep";
import { DealFieldMappingStep, type DealMappingState } from "./steps/DealFieldMappingStep";
import { FALLBACK_SAMPLE, type SampleData } from "@/lib/setup/sample-data";
import { WebsiteStep } from "./steps/WebsiteStep";
import { PostHogPreview } from "./previews/PostHogPreview";
import { AttioConnectionPreview } from "./previews/AttioConnectionPreview";
import { SlackNotificationPreview } from "./previews/SlackNotificationPreview";
import { CrmCardPreview } from "./previews/CrmCardPreview";

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
  attio_mapping: "Deal Mapping",
  website: "Website",
  billing: "Billing",
  complete: "Complete",
};

/**
 * Dual-panel structure returned by each step renderer
 */
interface StepPanels {
  config: ReactNode;
  preview: ReactNode;
}


export interface SetupWizardProps {
  billingEnabled?: boolean;
  setupStatus?: {
    integrations: { posthog: boolean; attio: boolean };
    billing: { configured: boolean };
  };
  websiteUrl?: string | null;
  className?: string;
}

/**
 * Main setup wizard — two-column layout with live preview.
 *
 * Left column: step configuration (inputs, forms)
 * Right column: live preview (Slack notification, CRM card, integration status)
 *
 * On mobile, the preview column is hidden and only config is shown.
 */
export function SetupWizard({
  billingEnabled = false,
  setupStatus,
  websiteUrl,
  className,
}: SetupWizardProps) {
  const router = useRouter();

  const getInitialStep = (): WizardStep => {
    if (!setupStatus) return "posthog";
    if (!setupStatus.integrations.posthog) return "posthog";
    if (!setupStatus.integrations.attio) return "attio";
    // Resume into mapping/website steps — these don't have persistent
    // completion flags yet, so always show them after Attio connects.
    // TODO: Track attio_mapping + website completion in setupStatus
    return "attio_mapping";
  };

  const [currentStep, setCurrentStep] = useState<WizardStep>(getInitialStep);

  // Data passed between steps
  const [mtuCount, setMtuCount] = useState<number>(0);
  const [posthogRegion, setPosthogRegion] = useState<string>("");
  const [attioWorkspaceName, setAttioWorkspaceName] = useState<string>("");
  const [posthogConnected, setPosthogConnected] = useState(
    setupStatus?.integrations.posthog ?? false
  );
  const [attioConnected, setAttioConnected] = useState(
    setupStatus?.integrations.attio ?? false
  );

  // Deal mapping state for live preview
  const [dealMappingState, setDealMappingState] = useState<DealMappingState>({
    dealNameTemplate: "{{company_name}} — {{signal_name}}",
    fieldMappings: [],
  });

  // Sample data for previews
  const [sampleData, setSampleData] = useState<SampleData>(FALLBACK_SAMPLE);

  // Load sample data on mount
  useEffect(() => {
    fetch("/api/integrations/attio/sample-data")
      .then((res) => res.json())
      .then((data) => {
        if (data.sample) setSampleData(data.sample);
      })
      .catch(() => {
        // Keep default sample on error
      });
  }, []);

  const steps = useMemo(() => {
    const base: WizardStep[] = ["posthog", "attio", "attio_mapping", "website"];
    if (billingEnabled) base.push("billing");
    return base;
  }, [billingEnabled]);

  const stepLabels = useMemo(() => steps.map((step) => STEP_LABELS[step]), [steps]);
  const currentStepLabel = STEP_LABELS[currentStep];

  const getNextStep = useCallback(
    (current: WizardStep): WizardStep => {
      const currentIndex = steps.indexOf(current);
      if (currentIndex === -1 || currentIndex >= steps.length - 1) return "complete";
      return steps[currentIndex + 1];
    },
    [steps]
  );

  const advanceFrom = useCallback(
    async (step: WizardStep) => {
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

  // Step handlers
  const handlePostHogSuccess = useCallback(
    (data: { mtuCount: number; region: string }) => {
      setMtuCount(data.mtuCount);
      setPosthogRegion(data.region);
      setPosthogConnected(true);
      advanceFrom("posthog");
    },
    [advanceFrom]
  );

  const handleAttioSuccess = useCallback(
    (workspaceName?: string) => {
      if (workspaceName) setAttioWorkspaceName(workspaceName);
      setAttioConnected(true);
      advanceFrom("attio");
    },
    [advanceFrom]
  );

  const handleFieldMappingSuccess = useCallback(
    (mapping: DealMappingState) => {
      setDealMappingState(mapping);
      advanceFrom("attio_mapping");
    },
    [advanceFrom]
  );

  const handleWebsiteSuccess = useCallback(() => {
    advanceFrom("website");
  }, [advanceFrom]);

  const handleBillingComplete = useCallback(() => {
    advanceFrom("billing");
  }, [advanceFrom]);

  /**
   * Render dual-panel content for the current step
   */
  const renderStep = (): StepPanels => {
    switch (currentStep) {
      case "posthog":
        return {
          config: <PostHogStep onSuccess={handlePostHogSuccess} />,
          preview: (
            <PostHogPreview
              isConnected={posthogConnected}
              mtuCount={posthogConnected ? mtuCount : null}
              region={posthogRegion}
            />
          ),
        };
      case "attio":
        return {
          config: (
            <AttioStep
              onSuccess={handleAttioSuccess}
              onWorkspaceName={setAttioWorkspaceName}
            />
          ),
          preview: (
            <AttioConnectionPreview
              isConnected={attioConnected}
              workspaceName={attioWorkspaceName}
            />
          ),
        };
      case "attio_mapping":
        return {
          config: (
            <DealFieldMappingStep
              onSuccess={handleFieldMappingSuccess}
              onMappingChange={setDealMappingState}
            />
          ),
          preview: (
            <div className="space-y-4">
              <SlackNotificationPreview
                dealNameTemplate={dealMappingState.dealNameTemplate}
                sampleData={sampleData}
              />
              <CrmCardPreview
                mappingState={dealMappingState}
                sampleData={sampleData}
                attioWorkspaceName={attioWorkspaceName}
              />
            </div>
          ),
        };
      case "website":
        return {
          config: <WebsiteStep initialUrl={websiteUrl} onSuccess={handleWebsiteSuccess} />,
          preview: (
            <div className="rounded-lg border-2 border-foreground/10 bg-background p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Website</h4>
                  <p className="text-xs text-muted-foreground">Company domain for account matching</p>
                </div>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                  Match PostHog users to CRM accounts
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                  Auto-enrich with company data
                </div>
              </div>
            </div>
          ),
        };
      case "billing":
        return {
          config: <BillingStep mtuCount={mtuCount} onComplete={handleBillingComplete} />,
          preview: (
            <div className="rounded-lg border-2 border-foreground/10 bg-background p-4 space-y-4">
              <div className="text-center py-4">
                <div className="text-3xl font-bold">{mtuCount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">Monthly Tracked Users</div>
              </div>
              <div className="space-y-2 border-t border-foreground/5 pt-3">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Free tier</span>
                  <span>200 users</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Your usage</span>
                  <span className="font-medium">{mtuCount.toLocaleString()} users</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Rate</span>
                  <span>$0.10/user</span>
                </div>
              </div>
            </div>
          ),
        };
      case "complete":
        return { config: null, preview: null };
      default:
        return { config: null, preview: null };
    }
  };

  const { config, preview } = renderStep();

  return (
    <div className={cn("w-full max-w-5xl mx-auto", className)} data-slot="setup-wizard">
      {/* Progress Indicator — spans full width */}
      <div className="mb-8">
        <ProgressIndicator steps={stepLabels} current={currentStepLabel} />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column: Config */}
        <Card className="p-6">{config}</Card>

        {/* Right column: Preview (sticky, hidden on mobile) */}
        <div className="hidden lg:block">
          <div className="sticky top-8">{preview}</div>
        </div>
      </div>

      {/* Step counter */}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Step {steps.indexOf(currentStep) + 1} of {steps.length}
      </p>
    </div>
  );
}

export default SetupWizard;
