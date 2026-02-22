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
  /** Demo mode: mock data, no API calls, free prev/next navigation */
  demoMode?: boolean;
  /** Auth bypass mode: show skip buttons on each step */
  authBypass?: boolean;
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
  demoMode = false,
  authBypass = false,
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

  const [currentStep, setCurrentStep] = useState<WizardStep>(
    demoMode ? "posthog" : getInitialStep
  );

  // Data passed between steps
  const [mtuCount, setMtuCount] = useState<number>(demoMode ? 1_420 : 0);
  const [posthogRegion, setPosthogRegion] = useState<string>(demoMode ? "US" : "");
  const [attioWorkspaceName, setAttioWorkspaceName] = useState<string>(
    demoMode ? "Acme Sales" : ""
  );
  const [posthogConnected, setPosthogConnected] = useState(
    demoMode || (setupStatus?.integrations.posthog ?? false)
  );
  const [attioConnected, setAttioConnected] = useState(
    demoMode || (setupStatus?.integrations.attio ?? false)
  );

  // Deal mapping state for live preview
  const [dealMappingState, setDealMappingState] = useState<DealMappingState>({
    dealNameTemplate: "{{company_name}} — {{signal_name}}",
    notificationText: "New deal signal detected",
    fieldMappings: [],
  });

  // Sample data for previews
  const [sampleData, setSampleData] = useState<SampleData>(FALLBACK_SAMPLE);

  // Load sample data on mount (skip in demo mode)
  useEffect(() => {
    if (demoMode || authBypass) return;
    fetch("/api/integrations/attio/sample-data")
      .then((res) => res.json())
      .then((data) => {
        if (data.sample) setSampleData(data.sample);
      })
      .catch(() => {
        // Keep default sample on error
      });
  }, [demoMode, authBypass]);

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

  const getPrevStep = useCallback(
    (current: WizardStep): WizardStep | null => {
      const currentIndex = steps.indexOf(current);
      if (currentIndex <= 0) return null;
      return steps[currentIndex - 1];
    },
    [steps]
  );

  const advanceFrom = useCallback(
    async (step: WizardStep) => {
      if (!demoMode) trackSetupStepCompleted(step);
      const next = getNextStep(step);
      if (next === "complete") {
        if (demoMode) {
          // In demo mode, just stay on the last step
          return;
        }
        trackOnboardingCompleted();
        router.push("/signals");
      } else {
        setCurrentStep(next);
      }
    },
    [getNextStep, router, demoMode]
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

  // Skip button shown on each step when auth is bypassed
  const skipButton = authBypass ? (
    <button
      type="button"
      onClick={() => advanceFrom(currentStep)}
      className="w-full mt-4 py-2 text-xs font-medium text-muted-foreground border-2 border-dashed border-foreground/10 rounded-lg hover:border-foreground/20 hover:text-foreground transition-colors"
    >
      Skip step (auth bypass)
    </button>
  ) : null;

  /**
   * Render dual-panel content for the current step
   */
  const renderStep = (): StepPanels => {
    switch (currentStep) {
      case "posthog":
        return {
          config: demoMode ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded bg-[#1D4AFF] flex items-center justify-center">
                  <span className="text-white font-bold text-[10px]">P</span>
                </div>
                <span className="font-medium">Connect PostHog</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Enter your PostHog API key and project ID to sync product analytics data.
              </p>
              <div className="space-y-3 opacity-60 pointer-events-none">
                <div className="space-y-1">
                  <label className="text-sm font-medium">API Key</label>
                  <div className="h-9 rounded border-2 border-foreground/20 bg-muted/30 px-3 flex items-center text-xs text-muted-foreground font-mono">phx_demo_key_xxxxx</div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Project ID</label>
                  <div className="h-9 rounded border-2 border-foreground/20 bg-muted/30 px-3 flex items-center text-xs text-muted-foreground font-mono">12345</div>
                </div>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-800 font-medium">Connected (demo)</p>
                <p className="text-xs text-green-600 mt-1">1,420 MTUs tracked &middot; US region</p>
              </div>
            </div>
          ) : (
            <div><PostHogStep onSuccess={handlePostHogSuccess} />{skipButton}</div>
          ),
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
          config: demoMode ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded bg-[#5B5FC7] flex items-center justify-center">
                  <span className="text-white font-bold text-[10px]">A</span>
                </div>
                <span className="font-medium">Connect Attio CRM</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Enter your Attio API key to sync signals and create deals in your CRM.
              </p>
              <div className="space-y-3 opacity-60 pointer-events-none">
                <div className="space-y-1">
                  <label className="text-sm font-medium">API Key</label>
                  <div className="h-9 rounded border-2 border-foreground/20 bg-muted/30 px-3 flex items-center text-xs text-muted-foreground font-mono">attio_demo_key_xxxxx</div>
                </div>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-800 font-medium">Connected (demo)</p>
                <p className="text-xs text-green-600 mt-1">Workspace: Acme Sales</p>
              </div>
            </div>
          ) : (
            <div>
              <AttioStep
                onSuccess={handleAttioSuccess}
                onWorkspaceName={setAttioWorkspaceName}
              />
              {skipButton}
            </div>
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
            <div>
              <DealFieldMappingStep
                onSuccess={handleFieldMappingSuccess}
                onMappingChange={setDealMappingState}
                demoMode={demoMode || authBypass}
              />
              {skipButton}
            </div>
          ),
          preview: (
            <div className="space-y-4">
              <SlackNotificationPreview
                dealNameTemplate={dealMappingState.dealNameTemplate}
                notificationText={dealMappingState.notificationText}
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
          config: <div><WebsiteStep initialUrl={websiteUrl} onSuccess={handleWebsiteSuccess} />{skipButton}</div>,
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
          config: <div><BillingStep mtuCount={mtuCount} onComplete={handleBillingComplete} />{skipButton}</div>,
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

      {/* Demo mode navigation */}
      {demoMode && (
        <div className="mt-6 flex items-center justify-between rounded-lg border-2 border-dashed border-foreground/10 bg-muted/20 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              const prev = getPrevStep(currentStep);
              if (prev) setCurrentStep(prev);
            }}
            disabled={!getPrevStep(currentStep)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            &larr; Previous
          </button>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Demo Mode &middot; Step {steps.indexOf(currentStep) + 1}/{steps.length}
          </span>
          <button
            type="button"
            onClick={() => advanceFrom(currentStep)}
            disabled={steps.indexOf(currentStep) >= steps.length - 1}
            className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Step counter (non-demo) */}
      {!demoMode && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Step {steps.indexOf(currentStep) + 1} of {steps.length}
        </p>
      )}
    </div>
  );
}

export default SetupWizard;
