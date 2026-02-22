"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectTrigger, SelectPopup, SelectItem } from "@/components/ui/select";
import { Check, AlertCircle, Globe, Server, Eye, EyeOff, SkipForward } from "lucide-react";
import { trackIntegrationConnected } from "@/lib/analytics";
import { isPrivateHost } from "@/lib/utils/ssrf";

type DeployMode = "cloud" | "self_hosted";
type ProxyTier = "" | "basic" | "stealth";
type StepState = "idle" | "validating" | "success" | "error";

const PROXY_OPTIONS: { value: ProxyTier; label: string }[] = [
  { value: "", label: "None" },
  { value: "basic", label: "Basic" },
  { value: "stealth", label: "Stealth" },
];

export interface FirecrawlStepProps {
  onSuccess: () => void;
  onSkip: () => void;
  className?: string;
}

/**
 * Normalize a self-hosted URL: strip trailing slash
 */
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Firecrawl connection step for the setup wizard (optional integration).
 *
 * Features:
 * - Cloud / Self-hosted mode toggle
 * - API Key input (fc-... for cloud, any for self-hosted)
 * - Instance URL for self-hosted (with SSRF validation)
 * - Proxy tier selector for cloud mode
 * - Skip button to advance without connecting
 */
export function FirecrawlStep({ onSuccess, onSkip, className }: FirecrawlStepProps) {
  const [mode, setMode] = useState<DeployMode>("cloud");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [proxy, setProxy] = useState<ProxyTier>("");
  const [showApiKey, setShowApiKey] = useState(false);

  const [state, setState] = useState<StepState>("idle");
  const [error, setError] = useState<string | null>(null);

  const getErrorMessage = useCallback((err: unknown): string => {
    if (err instanceof Error) {
      if (err.message.includes("fetch") || err.message.includes("network")) {
        return "Unable to reach Firecrawl. Check your connection.";
      }
      if (err.message && !err.message.match(/^\d{3}$/)) {
        return err.message;
      }
    }
    return "An unexpected error occurred. Please try again.";
  }, []);

  const handleValidate = useCallback(async () => {
    if (!apiKey.trim()) {
      setError("Please enter your API key.");
      return;
    }

    if (mode === "self_hosted") {
      const normalized = normalizeBaseUrl(baseUrl);
      if (!normalized) {
        setError("Please enter your Firecrawl instance URL.");
        return;
      }
      try {
        new URL(normalized);
      } catch {
        setError("Invalid URL format.");
        return;
      }
      if (isPrivateHost(normalized)) {
        setError("Private/internal addresses are not allowed.");
        return;
      }
    }

    setError(null);
    setState("validating");

    try {
      const body: Record<string, unknown> = {
        api_key: apiKey,
        mode,
      };

      if (mode === "self_hosted") {
        body.base_url = normalizeBaseUrl(baseUrl);
      } else {
        body.proxy = proxy || null;
      }

      const res = await fetch("/api/integrations/firecrawl/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || `${res.status}`);
      }

      // Save credentials via the generic integration save endpoint
      const saveBody: Record<string, string> = { api_key: apiKey };
      if (mode === "self_hosted") {
        saveBody.mode = "self_hosted";
        saveBody.base_url = normalizeBaseUrl(baseUrl);
      } else {
        saveBody.mode = "cloud";
        if (proxy) saveBody.proxy = proxy;
      }

      const saveRes = await fetch("/api/integrations/firecrawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(saveBody),
      });

      if (!saveRes.ok) {
        const saveData = await saveRes.json().catch(() => ({}));
        throw new Error(saveData.error || "Failed to save credentials.");
      }

      setState("success");
      trackIntegrationConnected("firecrawl");
      onSuccess();
    } catch (err) {
      setState("error");
      setError(getErrorMessage(err));
    }
  }, [apiKey, mode, baseUrl, proxy, onSuccess, getErrorMessage]);

  const isLoading = state === "validating";
  const isSuccess = state === "success";
  const isSelfHosted = mode === "self_hosted";

  return (
    <div className={cn("space-y-6", className)} data-slot="firecrawl-step">
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
            onClick={() => setMode("self_hosted")}
            disabled={isLoading || isSuccess}
            className="flex-1"
          >
            <Server className="h-4 w-4" />
            Self-Hosted
          </Button>
        </div>
      </div>

      {/* Self-hosted: Instance URL */}
      {isSelfHosted && (
        <div className="space-y-2">
          <Label htmlFor="firecrawl-base-url">Instance URL</Label>
          <Input
            id="firecrawl-base-url"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://firecrawl.yourcompany.com"
            disabled={isLoading || isSuccess}
          />
        </div>
      )}

      {/* API Key Input */}
      <div className="space-y-2">
        <Label htmlFor="firecrawl-api-key">API Key</Label>
        <div className="relative">
          <Input
            id="firecrawl-api-key"
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={isSelfHosted ? "your-api-key" : "fc-..."}
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
            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {isSelfHosted ? (
            "Enter the API key for your self-hosted Firecrawl instance."
          ) : (
            <>
              Get your API key from{" "}
              <a
                href="https://www.firecrawl.dev/app/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                firecrawl.dev/app/api-keys
              </a>
            </>
          )}
        </p>
      </div>

      {/* Cloud: Proxy Tier */}
      {!isSelfHosted && (
        <div className="space-y-2">
          <Label>Proxy Tier</Label>
          <Select
            value={proxy}
            onValueChange={(val) => setProxy(val as ProxyTier)}
            disabled={isLoading || isSuccess}
          >
            <SelectTrigger>
              <span className="truncate">
                {PROXY_OPTIONS.find((o) => o.value === proxy)?.label || "None"}
              </span>
            </SelectTrigger>
            <SelectPopup>
              {PROXY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            Higher proxy tiers bypass bot detection but use more credits
          </p>
        </div>
      )}

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
            Firecrawl is ready for web scraping and data extraction.
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      {!isSuccess && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onSkip}
            disabled={isLoading}
            className="flex-1"
          >
            <SkipForward className="h-4 w-4" />
            Skip
          </Button>
          <Button
            onClick={handleValidate}
            disabled={
              isLoading ||
              !apiKey.trim() ||
              (isSelfHosted && !baseUrl.trim())
            }
            className="flex-1"
          >
            {isLoading && <Spinner className="h-4 w-4" />}
            {isLoading ? "Validating..." : "Connect Firecrawl"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default FirecrawlStep;
