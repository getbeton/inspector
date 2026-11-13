"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { CopyButton } from "@/components/ui/copy-button";
import { Check, AlertCircle, Eye, EyeOff, Link2, ArrowRight, RotateCw } from "lucide-react";
import { trackIntegrationConnected, trackIntegrationConnectionFailed } from "@/lib/analytics";

type StepState = "idle" | "validating" | "success" | "error";

/**
 * Required scopes — STATIC informational reference only.
 *
 * The validate endpoint returns pass/fail for the whole token; it does NOT
 * report per-scope grant status, so we render this as a checklist of what the
 * Private App needs, not as live per-scope verification.
 */
const HUBSPOT_SCOPES: Array<[code: string, desc: string]> = [
  ["crm.objects.contacts.read", "Read contacts"],
  ["crm.objects.contacts.write", "Write contacts"],
  ["crm.objects.companies.read", "Read companies"],
  ["crm.objects.companies.write", "Write companies"],
  ["crm.objects.deals.write", "Write deals"],
  ["crm.schemas.contacts.write", "Create Beton properties"],
];

export interface HubSpotStepProps {
  /** Called once the token validates successfully. */
  onSuccess: () => void;
  className?: string;
}

/**
 * HubSpot connect step — Private App token input + pass/fail validation against
 * POST /api/integrations/hubspot/validate. Mirrors AttioStep's shape.
 */
export function HubSpotStep({ onSuccess, className }: HubSpotStepProps) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [state, setState] = useState<StepState>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleValidate = useCallback(async () => {
    if (state === "validating") return;
    if (!token.trim()) {
      setError("Please enter your HubSpot Private App token.");
      return;
    }

    setError(null);
    setState("validating");

    try {
      const res = await fetch("/api/integrations/hubspot/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.success === false) {
        const message =
          data?.error?.message ||
          (res.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : "Could not connect to HubSpot. Verify the token and its scopes.");
        throw new Error(message);
      }

      setState("success");
      trackIntegrationConnected("hubspot", { mode: "cloud", category: "crm" });
      onSuccess();
    } catch (err) {
      setState("error");
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      trackIntegrationConnectionFailed({ integration_name: "hubspot", error_message: msg });
    }
  }, [token, state, onSuccess]);

  const isLoading = state === "validating";
  const isSuccess = state === "success";
  const isError = state === "error";

  return (
    <div className={cn("space-y-6", className)} data-slot="hubspot-step">
      {/* Header */}
      <div className="space-y-2">
        <p className="text-[11px] font-heading uppercase tracking-wider text-muted-foreground">
          Connect CRM &middot; HubSpot
        </p>
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center border-2 border-foreground bg-[#FF7A59]/10 font-heading"
            aria-hidden="true"
          >
            H
          </div>
          <h2 className="text-2xl font-heading uppercase tracking-wider">Connect HubSpot</h2>
        </div>
      </div>

      {/* Token input */}
      <div className="space-y-2">
        <Label htmlFor="hubspot-token">HubSpot Private App token</Label>
        <div className="relative">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="hubspot-token"
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              if (state !== "idle") setState("idle");
              if (error) setError(null);
            }}
            placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            disabled={isLoading}
            className={cn("pl-9 pr-10 font-mono", isError && "border-destructive", isSuccess && "border-success")}
            aria-invalid={isError}
          />
          <button
            type="button"
            onClick={() => setShowToken((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label={showToken ? "Hide token" : "Show token"}
            disabled={isLoading}
          >
            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Tokens start with <code className="rounded bg-muted px-1 py-0.5 font-mono">pat-</code>.
          Create one in HubSpot &rarr; Settings &rarr; Integrations &rarr; Private Apps.
        </p>
      </div>

      {/* Action row — right-aligned test button + inline status */}
      <div className="flex items-center justify-end gap-3">
        {isSuccess && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
            <Check className="h-3.5 w-3.5" /> Connection verified
          </span>
        )}
        {isError && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> Connection failed
          </span>
        )}
        <Button onClick={handleValidate} disabled={isLoading || !token.trim()}>
          {isLoading ? (
            <>
              <Spinner className="h-4 w-4" /> Testing&hellip;
            </>
          ) : isSuccess ? (
            <>
              <RotateCw className="h-4 w-4" /> Re-test connection
            </>
          ) : (
            <>
              Test connection <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      {/* Required scopes — STATIC reference (no live per-scope verification) */}
      <div className="border-2 border-foreground/10 bg-muted/20 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-heading text-[11px] font-bold uppercase tracking-wider">
            Required scopes
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {HUBSPOT_SCOPES.length}
          </span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {HUBSPOT_SCOPES.map(([code, desc]) => (
            <li key={code} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <code className="font-mono text-[11px]">{code}</code>
                <CopyButton value={code} size="sm" />
              </div>
              <span className="text-[11px] text-muted-foreground">{desc}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Grant every scope above on your Private App, then paste its token here.
        </p>
      </div>

      {/* Error detail */}
      {isError && error && (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default HubSpotStep;
