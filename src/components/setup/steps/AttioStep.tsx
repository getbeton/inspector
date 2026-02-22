"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Check, AlertCircle, Eye, EyeOff, Link2 } from "lucide-react";
import { trackIntegrationConnected } from "@/lib/analytics";

/**
 * Component state machine
 */
type StepState = "idle" | "validating" | "success" | "error";

/**
 * Error message mapping based on API response codes
 */
const ERROR_MESSAGES: Record<string, string> = {
  "401": "Invalid API key. Please check and try again.",
  "403": "Access denied. Please verify your API key has the required permissions.",
  network: "Unable to reach Attio. Check your connection.",
  unknown: "An unexpected error occurred. Please try again.",
};

export interface AttioStepProps {
  /**
   * Callback when Attio connection is successfully validated
   */
  onSuccess: () => void;
  /**
   * Optional callback to report the connected workspace name
   */
  onWorkspaceName?: (name: string) => void;
  /**
   * Optional CSS class for the container
   */
  className?: string;
}

/**
 * Attio CRM connection step for the setup wizard
 *
 * Features:
 * - API Key input with show/hide toggle
 * - Validation via POST /api/integrations/attio/validate
 * - User-friendly error messages
 * - Success state with workspace info
 *
 * Simpler than PostHogStep - no region selection needed
 */
export function AttioStep({ onSuccess, onWorkspaceName, className }: AttioStepProps) {
  // Form state
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Validation state
  const [state, setState] = useState<StepState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);

  /**
   * Map error response to user-friendly message
   */
  const getErrorMessage = useCallback((err: unknown): string => {
    if (err instanceof Error) {
      // Check for network errors
      if (err.message.includes("fetch") || err.message.includes("network")) {
        return ERROR_MESSAGES.network;
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
   * Validate Attio credentials
   */
  const handleValidate = useCallback(async () => {
    if (!apiKey.trim()) {
      setError("Please enter your API key.");
      return;
    }

    setError(null);
    setState("validating");

    try {
      // Validate the API key
      const validateResponse = await fetch("/api/integrations/attio/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
        }),
      });

      if (!validateResponse.ok) {
        const data = await validateResponse.json().catch(() => ({}));
        throw new Error(data.error || `${validateResponse.status}`);
      }

      const data = await validateResponse.json();
      const wsName = data.workspace_name ?? data.workspaceName ?? "";
      setWorkspaceName(wsName);
      setState("success");
      trackIntegrationConnected("attio");

      // Report workspace name to parent for preview panel
      if (onWorkspaceName && wsName) {
        onWorkspaceName(wsName);
      }

      // Notify parent of success
      onSuccess();
    } catch (err) {
      setState("error");
      setError(getErrorMessage(err));
    }
  }, [apiKey, onSuccess, getErrorMessage]);

  const isLoading = state === "validating";
  const isSuccess = state === "success";

  return (
    <div className={cn("space-y-6", className)} data-slot="attio-step">
      {/* Header explanation */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Connect to Attio CRM</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Beton will sync high-intent signals to your Attio workspace, enriching
          your CRM with product usage data.
        </p>
      </div>

      {/* API Key Input */}
      <div className="space-y-2">
        <Label htmlFor="attio-api-key">API Key</Label>
        <div className="relative">
          <Input
            id="attio-api-key"
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="attio_..."
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
          Find this in Attio → Settings → API Keys → Create API Key
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
      {isSuccess && (
        <Alert variant="success">
          <Check className="h-4 w-4" />
          <AlertTitle>Connected!</AlertTitle>
          <AlertDescription>
            Successfully connected to Attio
            {workspaceName && (
              <>
                {" "}
                workspace: <strong>{workspaceName}</strong>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Validate Button */}
      {!isSuccess && (
        <Button
          onClick={handleValidate}
          disabled={isLoading || !apiKey.trim()}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Spinner className="h-4 w-4" />
              Validating...
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              Connect Attio
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export default AttioStep;
