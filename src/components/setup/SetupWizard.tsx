"use client";

import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  trackSetupStepCompleted,
  trackOnboardingCompleted,
  trackOnboardingStepViewed,
  trackOnboardingStepSkipped,
  setOnboardingUserProperties,
} from "@/lib/analytics";
import { ProgressIndicator, type StepInfo } from "./ProgressIndicator";
import { PostHogStep } from "./steps/PostHogStep";
import { BillingStep } from "./steps/BillingStep";
import { AttioStep } from "./steps/AttioStep";
import { DealFieldMappingStep, type DealMappingState } from "./steps/DealFieldMappingStep";
import { FirecrawlStep } from "./steps/FirecrawlStep";
import { ContactPicker, type SelectedContact } from "./fields/ContactPicker";
import { FALLBACK_SAMPLE, deriveCompanyFromEmail, type SampleData } from "@/lib/setup/sample-data";
import { useSession } from "@/components/auth/session-provider";
import { WebsiteStep } from "./steps/WebsiteStep";
import { PostHogPreview } from "./previews/PostHogPreview";
import { AttioConnectionPreview } from "./previews/AttioConnectionPreview";
import { FirecrawlPreview } from "./previews/FirecrawlPreview";
import { SlackNotificationPreview } from "./previews/SlackNotificationPreview";
import { CrmCardPreview } from "./previews/CrmCardPreview";
import { useIntegrationDefinitions, getOnboardingSteps } from "@/lib/hooks/use-integration-definitions";
import type { IntegrationDefinition } from "@/lib/integrations/types";

// ── Step sequence types ────────────────────────────────────

/**
 * Descriptor for a single step in the wizard sequence.
 * Integration steps are seeded from the definitions API; system steps are hardcoded.
 */
interface WizardStepDescriptor {
  key: string;
  label: string;
  optional: boolean;
  displayOrder: number;
  /** True if the integration is already connected (from API). System steps default to false. */
  isConnected: boolean;
}

/**
 * Dual-panel structure returned by each step renderer
 */
interface StepPanels {
  config: ReactNode;
  preview: ReactNode;
}

// ── Built-in (non-integration) steps ────────────────────────

const BUILT_IN_STEPS: WizardStepDescriptor[] = [
  { key: "attio_mapping", label: "Deal Mapping", optional: false, displayOrder: 25, isConnected: false },
  { key: "website", label: "Website", optional: false, displayOrder: 55, isConnected: false },
];

const BILLING_STEP: WizardStepDescriptor = {
  key: "billing", label: "Billing", optional: false, displayOrder: 90, isConnected: false,
};

// ── Demo mode step list (no API dependency) ─────────────────

const DEMO_STEPS: WizardStepDescriptor[] = [
  { key: "posthog", label: "PostHog", optional: false, displayOrder: 10, isConnected: false },
  { key: "attio", label: "Attio", optional: false, displayOrder: 20, isConnected: false },
  { key: "attio_mapping", label: "Deal Mapping", optional: false, displayOrder: 25, isConnected: false },
  { key: "website", label: "Website", optional: false, displayOrder: 55, isConnected: false },
  { key: "firecrawl", label: "Firecrawl", optional: true, displayOrder: 60, isConnected: false },
];

// ── Helpers ─────────────────────────────────────────────────

/**
 * Build the full wizard step sequence by merging integration definitions
 * (from API) with built-in system steps. Required steps are ordered first,
 * then optional steps — each group sorted by display_order.
 */
function buildStepSequence(
  definitions: IntegrationDefinition[],
  billingEnabled: boolean
): WizardStepDescriptor[] {
  // Integration steps from the DB (those with a setup_step_key)
  const integrationSteps = getOnboardingSteps(definitions).map((d) => ({
    key: d.setup_step_key!,
    label: d.display_name,
    optional: !d.required,
    displayOrder: d.display_order,
    isConnected: d.is_connected,
  }));

  const allSteps = [...integrationSteps, ...BUILT_IN_STEPS];
  if (billingEnabled) allSteps.push(BILLING_STEP);

  // Required first (sorted by displayOrder), then optional (sorted by displayOrder)
  const required = allSteps.filter((s) => !s.optional).sort((a, b) => a.displayOrder - b.displayOrder);
  const optional = allSteps.filter((s) => s.optional).sort((a, b) => a.displayOrder - b.displayOrder);

  return [...required, ...optional];
}

/**
 * Find the first step that needs attention.
 * Priority: first incomplete required step → first optional step → index 0
 */
function getInitialStepIndex(steps: WizardStepDescriptor[]): number {
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i].optional && !steps[i].isConnected) return i;
  }
  // All required steps done — start at first optional step
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].optional) return i;
  }
  return 0;
}

// ── Component ───────────────────────────────────────────────

export interface SetupWizardProps {
  billingEnabled?: boolean;
  /** @deprecated No longer used — integration status comes from useIntegrationDefinitions */
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
 * Step sequence is driven by the integration_definitions API:
 * - Integration steps (posthog, attio, firecrawl) come from the DB
 * - System steps (deal mapping, website, billing) are merged in from code
 * - Required steps appear first, optional steps after
 * - Optional steps can be skipped
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
  const { session } = useSession();

  // Fetch integration definitions (skip in demo mode)
  const { data: definitions, isLoading: definitionsLoading } = useIntegrationDefinitions();

  // Build step sequence from definitions + built-in steps
  const steps = useMemo(() => {
    if (demoMode) return DEMO_STEPS;
    if (!definitions) return [];
    return buildStepSequence(definitions, billingEnabled);
  }, [definitions, billingEnabled, demoMode]);

  // Track completed/skipped status for each step
  const [stepStatuses, setStepStatuses] = useState<Map<string, "completed" | "skipped">>(new Map());

  // Seed step statuses from definitions on first load (and from legacy setupStatus)
  useEffect(() => {
    if (demoMode || !definitions || steps.length === 0) return;
    const initial = new Map<string, "completed" | "skipped">();
    for (const d of definitions) {
      if (d.is_connected && d.setup_step_key) {
        initial.set(d.setup_step_key, "completed");
      }
    }
    // Legacy: seed from setupStatus for backward compat during transition
    if (setupStatus) {
      if (setupStatus.integrations.posthog) initial.set("posthog", "completed");
      if (setupStatus.integrations.attio) initial.set("attio", "completed");
    }
    setStepStatuses(initial);
  }, [definitions, demoMode, setupStatus, steps.length]);

  // Compute initial step index once steps are ready
  const initialIndex = useMemo(() => {
    if (demoMode) return 0;
    return getInitialStepIndex(steps);
  }, [steps, demoMode]);

  const [currentStepIndex, setCurrentStepIndex] = useState<number | null>(null);

  // Analytics: track when each step started (for duration_ms calculation)
  const stepStartTimeRef = useRef<number>(Date.now());
  const onboardingStartTimeRef = useRef<number>(Date.now());

  // Set initial index once steps are loaded
  useEffect(() => {
    if (steps.length > 0 && currentStepIndex === null) {
      setCurrentStepIndex(initialIndex);
    }
  }, [steps, initialIndex, currentStepIndex]);

  // Analytics: fire onboarding_step_viewed when the active step changes
  useEffect(() => {
    if (demoMode || currentStepIndex === null || steps.length === 0) return;
    const step = steps[currentStepIndex];
    if (!step) return;
    stepStartTimeRef.current = Date.now();
    trackOnboardingStepViewed({
      step_key: step.key,
      step_name: step.label,
      is_optional: step.optional,
      step_index: currentStepIndex,
    });
  }, [currentStepIndex, steps, demoMode]);

  // Cross-step shared data
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
  const [firecrawlConnected, setFirecrawlConnected] = useState(false);
  const [firecrawlMode, setFirecrawlMode] = useState<"cloud" | "self_hosted" | null>(null);
  const [firecrawlProxy, setFirecrawlProxy] = useState<string | null>(null);

  // Deal mapping state for live preview
  const [dealMappingState, setDealMappingState] = useState<DealMappingState>({
    dealNameTemplate: "{{company_name}} — {{signal_name}}",
    notificationText: "New deal signal detected",
    fieldMappings: [],
  });

  // Sample data for previews
  const [sampleData, setSampleData] = useState<SampleData>(FALLBACK_SAMPLE);

  // Selected Attio contact for preview enrichment (production mode only)
  const [selectedContactData, setSelectedContactData] = useState<SelectedContact | null>(null);

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

  // Enrich sample data: selected Attio contact > user email > fallback
  const enrichedSampleData = useMemo<SampleData>(() => {
    const base = { ...sampleData };
    if (selectedContactData?.email) {
      // Use the picked Attio contact's data
      const { companyName, companyDomain } = deriveCompanyFromEmail(selectedContactData.email);
      base.company_name = companyName;
      base.company_domain = companyDomain;
      base.user_email = selectedContactData.email;
    } else if (!demoMode && session?.email && session.sub !== "auth-bypass") {
      const { companyName, companyDomain } = deriveCompanyFromEmail(session.email);
      base.company_name = companyName;
      base.company_domain = companyDomain;
      base.user_email = session.email;
    }
    return base;
  }, [sampleData, session, demoMode, selectedContactData]);

  // Derive PostHog host from region for deep links
  const posthogHost = useMemo(() => {
    if (!posthogConnected || !posthogRegion) return null;
    if (posthogRegion === "self_hosted") return null; // No standard deep link for self-hosted
    return posthogRegion === "eu"
      ? "https://eu.posthog.com"
      : "https://us.posthog.com";
  }, [posthogConnected, posthogRegion]);

  // Attio workspace slug (derived from name — lowercase, hyphenated)
  const attioWorkspaceSlug = useMemo(() => {
    if (!attioConnected || !attioWorkspaceName) return null;
    return attioWorkspaceName.toLowerCase().replace(/\s+/g, "-");
  }, [attioConnected, attioWorkspaceName]);

  // Sync posthogConnected from definitions
  useEffect(() => {
    if (definitions) {
      const ph = definitions.find((d) => d.name === "posthog");
      if (ph?.is_connected) setPosthogConnected(true);
      const at = definitions.find((d) => d.name === "attio");
      if (at?.is_connected) setAttioConnected(true);
      const fc = definitions.find((d) => d.name === "firecrawl");
      if (fc?.is_connected) setFirecrawlConnected(true);
    }
  }, [definitions]);

  const currentStep = currentStepIndex !== null ? steps[currentStepIndex] : null;
  const currentKey = currentStep?.key ?? "";

  const markStep = useCallback(
    (key: string, status: "completed" | "skipped") => {
      setStepStatuses((prev) => new Map(prev).set(key, status));
    },
    []
  );

  /**
   * Advance from the current step. Marks the step as completed (or skipped),
   * fires the appropriate analytics event, then moves to the next step.
   * If all steps are done, fires onboarding_completed and redirects.
   */
  const advanceFrom = useCallback(
    (status: "completed" | "skipped" = "completed") => {
      if (currentStepIndex === null) return;
      const step = steps[currentStepIndex];
      if (!demoMode) {
        const durationMs = Date.now() - stepStartTimeRef.current;

        if (status === "skipped") {
          trackOnboardingStepSkipped({
            step_key: step.key,
            step_name: step.label,
          });
        } else {
          trackSetupStepCompleted(step.key, {
            step_name: step.label,
            is_optional: step.optional,
            duration_ms: durationMs,
          });
        }
        markStep(step.key, status);
      }

      const nextIndex = currentStepIndex + 1;
      if (nextIndex >= steps.length) {
        if (demoMode) return; // stay on last step in demo

        // Compute aggregate stats for the completion event
        const completed = Array.from(stepStatuses.values()).filter((s) => s === "completed").length + 1; // +1 for the current step
        const skipped = Array.from(stepStatuses.values()).filter((s) => s === "skipped").length;
        const totalDurationMs = Date.now() - onboardingStartTimeRef.current;

        // Collect connected integration names for user properties
        const connectedIntegrations: string[] = [];
        if (posthogConnected) connectedIntegrations.push("posthog");
        if (attioConnected) connectedIntegrations.push("attio");
        if (firecrawlConnected) connectedIntegrations.push("firecrawl");

        trackOnboardingCompleted({
          total_duration_ms: totalDurationMs,
          steps_completed: completed,
          steps_skipped: skipped,
          integrations: connectedIntegrations,
        });

        // Set persistent user properties via GTM → PostHog $set
        setOnboardingUserProperties({
          onboarding_completed_at: new Date().toISOString(),
          integrations_connected: connectedIntegrations,
          has_self_hosted_posthog: posthogRegion === "self_hosted",
          has_firecrawl: firecrawlConnected,
        });

        router.push("/memory");
      } else {
        setCurrentStepIndex(nextIndex);
      }
    },
    [currentStepIndex, steps, router, demoMode, markStep, stepStatuses, posthogConnected, attioConnected, firecrawlConnected, posthogRegion]
  );

  const goToPrevStep = useCallback(() => {
    if (currentStepIndex !== null && currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  }, [currentStepIndex]);

  // ── Step-specific callbacks ───────────────────────────────

  const handlePostHogSuccess = useCallback(
    (data: { mtuCount: number; region: string }) => {
      setMtuCount(data.mtuCount);
      setPosthogRegion(data.region);
      setPosthogConnected(true);
      advanceFrom("completed");
    },
    [advanceFrom]
  );

  const handleAttioSuccess = useCallback(
    (workspaceName?: string) => {
      if (workspaceName) setAttioWorkspaceName(workspaceName);
      setAttioConnected(true);
      advanceFrom("completed");
    },
    [advanceFrom]
  );

  const handleFieldMappingSuccess = useCallback(
    (mapping: DealMappingState) => {
      setDealMappingState(mapping);
      advanceFrom("completed");
    },
    [advanceFrom]
  );

  const handleWebsiteSuccess = useCallback(() => {
    advanceFrom("completed");
  }, [advanceFrom]);

  const handleBillingComplete = useCallback(() => {
    advanceFrom("completed");
  }, [advanceFrom]);

  const handleFirecrawlSuccess = useCallback(() => {
    setFirecrawlConnected(true);
    setFirecrawlMode("cloud"); // Default; ideally read from response
    advanceFrom("completed");
  }, [advanceFrom]);

  const handleFirecrawlSkip = useCallback(() => {
    advanceFrom("skipped");
  }, [advanceFrom]);

  // Auth bypass skip button — shown on every step when auth is bypassed
  const authBypassSkipButton = authBypass ? (
    <button
      type="button"
      onClick={() => advanceFrom("skipped")}
      className="w-full mt-4 py-2 text-xs font-medium text-muted-foreground border-2 border-dashed border-foreground/10 rounded-lg hover:border-foreground/20 hover:text-foreground transition-colors"
    >
      Skip step (auth bypass)
    </button>
  ) : null;

  // ── Step rendering ────────────────────────────────────────

  const renderStep = (): StepPanels => {
    switch (currentKey) {
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
            <div><PostHogStep onSuccess={handlePostHogSuccess} />{authBypassSkipButton}</div>
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
              {authBypassSkipButton}
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
              {/* Contact picker — only in production mode with Attio connected */}
              {!demoMode && !authBypass && attioConnected && (
                <ContactPicker
                  onSelect={setSelectedContactData}
                  className="mb-6"
                />
              )}
              <DealFieldMappingStep
                onSuccess={handleFieldMappingSuccess}
                onMappingChange={setDealMappingState}
                demoMode={demoMode || authBypass}
              />
              {authBypassSkipButton}
            </div>
          ),
          preview: (
            <div className="space-y-4">
              <SlackNotificationPreview
                dealNameTemplate={dealMappingState.dealNameTemplate}
                notificationText={dealMappingState.notificationText}
                sampleData={enrichedSampleData}
                posthogHost={posthogHost}
              />
              <CrmCardPreview
                mappingState={dealMappingState}
                sampleData={enrichedSampleData}
                attioWorkspaceName={attioWorkspaceName}
                attioWorkspaceSlug={attioWorkspaceSlug}
                contactRecordId={selectedContactData?.personId}
                contactName={selectedContactData?.personName}
              />
            </div>
          ),
        };

      case "website":
        return {
          config: (
            <div>
              <WebsiteStep initialUrl={websiteUrl} onSuccess={handleWebsiteSuccess} />
              {authBypassSkipButton}
            </div>
          ),
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
          config: (
            <div>
              <BillingStep mtuCount={mtuCount} onComplete={handleBillingComplete} />
              {authBypassSkipButton}
            </div>
          ),
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

      case "firecrawl":
        return {
          config: (
            <div>
              <FirecrawlStep
                onSuccess={handleFirecrawlSuccess}
                onSkip={handleFirecrawlSkip}
              />
              {authBypassSkipButton}
            </div>
          ),
          preview: (
            <FirecrawlPreview
              isConnected={firecrawlConnected}
              mode={firecrawlMode}
              proxyTier={firecrawlProxy}
            />
          ),
        };

      default:
        return { config: null, preview: null };
    }
  };

  // ── Build progress indicator step info ────────────────────

  const progressSteps: StepInfo[] = useMemo(
    () =>
      steps.map((step, index) => {
        let status: StepInfo["status"] = "pending";
        const tracked = stepStatuses.get(step.key);
        if (tracked) {
          status = tracked;
        } else if (currentStepIndex !== null && index < currentStepIndex) {
          // Steps we've passed without explicit tracking are implicitly completed
          status = "completed";
        }
        return {
          key: step.key,
          label: step.label,
          optional: step.optional,
          status,
        };
      }),
    [steps, stepStatuses, currentStepIndex]
  );

  // ── Loading skeleton ──────────────────────────────────────

  if (!demoMode && (definitionsLoading || steps.length === 0 || currentStepIndex === null)) {
    return (
      <div className={cn("w-full max-w-5xl mx-auto", className)} data-slot="setup-wizard">
        {/* Skeleton progress indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className="h-8 w-8 rounded-full border-2 border-muted-foreground/20 bg-muted/30 animate-pulse" />
                <div className="mt-2 h-3 w-12 rounded bg-muted/30 animate-pulse" />
              </div>
              {i < 5 && <div className="mx-2 h-0.5 w-8 lg:w-12 bg-muted-foreground/10" />}
            </div>
          ))}
        </div>
        {/* Skeleton content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="h-6 w-48 rounded bg-muted/30 animate-pulse" />
              <div className="h-4 w-full rounded bg-muted/20 animate-pulse" />
              <div className="h-10 w-full rounded bg-muted/20 animate-pulse" />
              <div className="h-10 w-full rounded bg-muted/20 animate-pulse" />
              <div className="h-10 w-32 rounded bg-muted/30 animate-pulse" />
            </div>
          </Card>
          <div className="hidden lg:block">
            <div className="h-64 rounded-lg border-2 border-foreground/10 bg-muted/10 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const { config, preview } = renderStep();

  return (
    <div className={cn("w-full max-w-5xl mx-auto", className)} data-slot="setup-wizard">
      {/* Progress Indicator — spans full width */}
      <div className="mb-8">
        <ProgressIndicator steps={progressSteps} currentIndex={currentStepIndex ?? 0} />
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
            onClick={goToPrevStep}
            disabled={currentStepIndex === 0}
            className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            &larr; Previous
          </button>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Demo Mode &middot; Step {(currentStepIndex ?? 0) + 1}/{steps.length}
          </span>
          <button
            type="button"
            onClick={() => advanceFrom("completed")}
            disabled={(currentStepIndex ?? 0) >= steps.length - 1}
            className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Step counter (non-demo) */}
      {!demoMode && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Step {(currentStepIndex ?? 0) + 1} of {steps.length}
        </p>
      )}
    </div>
  );
}

export default SetupWizard;
