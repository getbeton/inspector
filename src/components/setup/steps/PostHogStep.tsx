"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Check, AlertCircle, Globe, Server, Eye, EyeOff } from "lucide-react";
import {
  trackIntegrationConnected,
  trackIntegrationConnectionFailed,
  trackPostHogSelfHostedSelected,
} from "@/lib/analytics";
import { isPrivateHost } from "@/lib/utils/ssrf";

/**
 * PostHog region configuration
 * US and EU are the two main hosted regions
 */
const REGIONS = [
  {
    id: "us",
    label: "US",
    host: "https://us.posthog.com",
    apiKeysUrl: "https://us.posthog.com/settings/user-api-keys",
    projectSettingsUrl: "https://us.posthog.com/settings/project",
  },
  {
    id: "eu",
    label: "EU",
    host: "https://eu.posthog.com",
    apiKeysUrl: "https://eu.posthog.com/settings/user-api-keys",
    projectSettingsUrl: "https://eu.posthog.com/settings/project",
  },
] as const;

type Region = (typeof REGIONS)[number]["id"];
type DeployMode = "cloud" | "self_hosted";

/**
 * Component state machine
 */
type StepState =
  | "idle"
  | "validating"
  | "calculating_mtu"
  | "success"
  | "error";

/**
 * Error message mapping based on API response codes
 */
const ERROR_MESSAGES: Record<string, string> = {
  "401": "Invalid API key. Please check and try again.",
  "403": "Access denied. Please verify your API key has the required permissions.",
  "404": "Project not found. Please verify your Project ID.",
  network: "Unable to reach PostHog. Check your connection.",
  unknown: "An unexpected error occurred. Please try again.",
};

export interface PostHogStepProps {
  /**
   * Callback when PostHog connection is successfully validated
   * Returns the MTU count for billing calculation
   */
  onSuccess: (data: { mtuCount: number; region: string }) => void;
  /**
   * Optional CSS class for the container
   */
  className?: string;
}

/**
 * Normalize a self-hosted URL: strip trailing slash and /api suffix
 */
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/api$/, "");
}

/**
 * PostHog connection step for the setup wizard
 *
 * Features:
 * - Cloud / Self-hosted mode toggle
 * - Region selector (US/EU) for cloud mode
 * - Instance URL input for self-hosted mode (with SSRF validation)
 * - API Key input (password field with show/hide toggle)
 * - Project ID input
 * - Two-phase validation:
 *   1. Quick validation (POST /api/integrations/posthog/validate)
 *   2. MTU calculation (POST /api/billing/calculate-mtu)
 * - User-friendly error messages
 * - Success state showing active users count
 */
export function PostHogStep({ onSuccess, className }: PostHogStepProps) {
  // Form state
  const [mode, setMode] = useState<DeployMode>("cloud");
  const [region, setRegion] = useState<Region>("us");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [projectId, setProjectId] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Validation state
  const [state, setState] = useState<StepState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mtuCount, setMtuCount] = useState<number | null>(null);

  /**
   * Map error response to user-friendly message
   */
  const getErrorMessage = useCallback((err: unknown): string => {
    if (err instanceof Error) {
      // Check for network errors
      if (err.message.includes("fetch") || err.message.includes("network")) {
        return ERROR_MESSAGES.network;
      }
      // Pass through server error messages directly
      if (err.message && !err.message.match(/^\d{3}$/)) {
        return err.message;
      }
    }

    // Check for HTTP status codes in error
    const errorStr = String(err);
    for (const code of Object.keys(ERROR_MESSAGES)) {
      if (errorStr.includes(code)) {
        return ERROR_MESSAGES[code];
      }
    }

    return ERROR_MESSAGES.unknown;
  }, []);

  /**
   * Validate PostHog credentials and calculate MTU
   */
  const handleValidate = useCallback(async () => {
    if (!apiKey.trim() || !projectId.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    // Client-side SSRF check for self-hosted URLs
    if (mode === "self_hosted") {
      const normalized = normalizeBaseUrl(baseUrl);
      if (!normalized) {
        setError("Please enter your PostHog instance URL.");
        return;
      }
      try {
        new URL(normalized);
      } catch {
        setError("Invalid URL format. Please enter a valid URL.");
        return;
      }
      if (isPrivateHost(normalized)) {
        setError("Private/internal addresses are not allowed for self-hosted instances.");
        return;
      }
    }

    setError(null);
    setState("validating");

    try {
      // Phase 1: Quick validation
      const selectedRegion = REGIONS.find((r) => r.id === region);
      const validateBody: Record<string, unknown> = {
        api_key: apiKey,
        project_id: projectId,
        mode,
      };

      if (mode === "cloud") {
        validateBody.region = region;
        validateBody.host = selectedRegion?.host;
      } else {
        validateBody.base_url = normalizeBaseUrl(baseUrl);
      }

      const validateResponse = await fetch("/api/integrations/posthog/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(validateBody),
      });

      if (!validateResponse.ok) {
        const data = await validateResponse.json().catch(() => ({}));
        const errorMsg = data.error?.message || data.error || `${validateResponse.status}`;
        throw new Error(errorMsg);
      }

      // Phase 2: Calculate MTU
      setState("calculating_mtu");

      const mtuBody: Record<string, unknown> = {
        api_key: apiKey,
        project_id: projectId,
        mode,
      };

      if (mode === "cloud") {
        mtuBody.region = region;
      } else {
        mtuBody.base_url = normalizeBaseUrl(baseUrl);
      }

      const mtuResponse = await fetch("/api/billing/calculate-mtu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(mtuBody),
      });

      if (!mtuResponse.ok) {
        const data = await mtuResponse.json().catch(() => ({}));
        throw new Error(data.error || `${mtuResponse.status}`);
      }

      const mtuData = await mtuResponse.json();
      const count = mtuData.mtu_count ?? mtuData.mtuCount ?? 0;

      setMtuCount(count);
      setState("success");
      trackIntegrationConnected("posthog", {
        mode,
        category: "data_source",
      });

      // Notify parent of success
      onSuccess({
        mtuCount: count,
        region: mode === "cloud" ? region : "self_hosted",
      });
    } catch (err) {
      setState("error");
      const msg = getErrorMessage(err);
      setError(msg);
      trackIntegrationConnectionFailed({
        integration_name: "posthog",
        error_message: msg,
      });
    }
  }, [apiKey, projectId, region, mode, baseUrl, onSuccess, getErrorMessage]);

  const isLoading = state === "validating" || state === "calculating_mtu";
  const isSuccess = state === "success";
  const isSelfHosted = mode === "self_hosted";

  // Determine the help URL for API keys
  const apiKeysUrl = isSelfHosted && baseUrl
    ? `${normalizeBaseUrl(baseUrl)}/settings/user-api-keys`
    : REGIONS.find((r) => r.id === region)?.apiKeysUrl;
  const projectSettingsUrl = isSelfHosted && baseUrl
    ? `${normalizeBaseUrl(baseUrl)}/settings/project`
    : REGIONS.find((r) => r.id === region)?.projectSettingsUrl;

  return (
    <div className={cn("space-y-6", className)} data-slot="posthog-step">
      {/* Deployment Mode Toggle */}
      <div className="space-y-2">
        <Label>Deployment</Label>
        <div className="flex gap-2">
          <Button
            variant={mode === "cloud" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("cloud")}
            disabled={isLoading || isSuccess}
            className="flex-1"
          >
            <Globe className="h-4 w-4" />
            Cloud
          </Button>
          <Button
            variant={mode === "self_hosted" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setMode("self_hosted");
              trackPostHogSelfHostedSelected();
            }}
            disabled={isLoading || isSuccess}
            className="flex-1"
          >
            <Server className="h-4 w-4" />
            Self-Hosted
          </Button>
        </div>
      </div>

      {/* Cloud: Region Selector */}
      {!isSelfHosted && (
        <div className="space-y-2">
          <Label>PostHog Region</Label>
          <div className="flex gap-2">
            {REGIONS.map((r) => (
              <Button
                key={r.id}
                variant={region === r.id ? "default" : "outline"}
                size="sm"
                onClick={() => setRegion(r.id)}
                disabled={isLoading || isSuccess}
                className="flex-1"
              >
                <Globe className="h-4 w-4" />
                {r.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Select the region where your PostHog data is hosted
          </p>
        </div>
      )}

      {/* Self-hosted: Instance URL */}
      {isSelfHosted && (
        <div className="space-y-2">
          <Label htmlFor="posthog-base-url">Instance URL</Label>
          <Input
            id="posthog-base-url"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://posthog.yourcompany.com"
            disabled={isLoading || isSuccess}
          />
          <p className="text-xs text-muted-foreground">
            The URL of your self-hosted PostHog instance (without <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">/api</code>)
          </p>
        </div>
      )}

      {/* API Key Input */}
      <div className="space-y-2">
        <Label htmlFor="posthog-api-key">Personal API Key</Label>
        <div className="relative">
          <Input
            id="posthog-api-key"
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="phx_..."
            disabled={isLoading || isSuccess}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label={showApiKey ? "Hide API key" : "Show API key"}
            disabled={isLoading || isSuccess}
          >
            {showApiKey ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Create one in{" "}
          <a
            href={apiKeysUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            PostHog Settings &rarr; Personal API Keys
          </a>
        </p>
        <p className="text-xs text-muted-foreground">
          Required scopes:{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">person:read</code>{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">query:read</code>{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">event:read</code>{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">group:read</code>
        </p>
      </div>

      {/* Project ID Input */}
      <div className="space-y-2">
        <Label htmlFor="posthog-project-id">Project ID</Label>
        <Input
          id="posthog-project-id"
          type="text"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="12345"
          disabled={isLoading || isSuccess}
        />
        <p className="text-xs text-muted-foreground">
          Find this in{" "}
          <a
            href={projectSettingsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            PostHog Settings &rarr; Project Details
          </a>
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Success Display */}
      {isSuccess && mtuCount !== null && (
        <Alert variant="success">
          <Check className="h-4 w-4" />
          <AlertTitle>Connected!</AlertTitle>
          <AlertDescription>
            Active users (MTU): <strong>{mtuCount.toLocaleString()}</strong>
          </AlertDescription>
        </Alert>
      )}

      {/* Validate Button */}
      {!isSuccess && (
        <Button
          onClick={handleValidate}
          disabled={
            isLoading ||
            !apiKey.trim() ||
            !projectId.trim() ||
            (isSelfHosted && !baseUrl.trim())
          }
          className="w-full"
        >
          {isLoading && <Spinner className="h-4 w-4" />}
          {state === "validating" && "Validating credentials..."}
          {state === "calculating_mtu" && "Calculating active users..."}
          {(state === "idle" || state === "error") && "Connect PostHog"}
        </Button>
      )}
    </div>
  );
}

export default PostHogStep;
