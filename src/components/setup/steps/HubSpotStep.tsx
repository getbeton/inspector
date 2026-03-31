"use client"

import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { Check, AlertCircle, Eye, EyeOff, Link2, Key, Shield } from "lucide-react"
import {
  trackIntegrationConnected,
  trackIntegrationConnectionFailed,
  trackOnboardingStepSkipped,
} from "@/lib/analytics"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthMethod = "oauth" | "private_app"
type StepState = "idle" | "validating" | "success" | "error"

const ERROR_MESSAGES: Record<string, string> = {
  "401": "Invalid token. Please check and try again.",
  "403": "Access denied. Please verify your token has the required scopes.",
  network: "Unable to reach HubSpot. Check your connection.",
  unknown: "An unexpected error occurred. Please try again.",
}

/** Default HubSpot object types to enable */
const DEFAULT_OBJECT_TYPES = [
  { id: "contacts", label: "Contacts", defaultChecked: true },
  { id: "companies", label: "Companies", defaultChecked: true },
  { id: "deals", label: "Deals", defaultChecked: true },
  { id: "tickets", label: "Tickets", defaultChecked: false },
] as const

export interface HubSpotStepProps {
  /** Callback when HubSpot connection is successfully validated */
  onSuccess: (data: {
    portalName: string
    portalId: string
    authType: AuthMethod
    enabledObjects: string[]
  }) => void
  /** Optional callback to skip this step */
  onSkip?: () => void
  /** Optional CSS class for the container */
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * HubSpot CRM connection step for the setup wizard.
 *
 * Features:
 * - Auth method selector: OAuth vs Private App Token
 * - OAuth: "Connect HubSpot" button -> opens OAuth flow
 * - Private App: API key input (masked, must start with `pat-`)
 * - Connection name input
 * - Object type checkboxes
 * - Skip button (HubSpot is optional)
 */
export function HubSpotStep({ onSuccess, onSkip, className }: HubSpotStepProps) {
  // Auth method
  const [authMethod, setAuthMethod] = useState<AuthMethod>("private_app")

  // Form state
  const [token, setToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [connectionName, setConnectionName] = useState("")
  const [enabledObjects, setEnabledObjects] = useState<Set<string>>(
    new Set(DEFAULT_OBJECT_TYPES.filter((o) => o.defaultChecked).map((o) => o.id))
  )

  // Validation state
  const [state, setState] = useState<StepState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [portalInfo, setPortalInfo] = useState<{
    portalName: string
    portalId: string
  } | null>(null)

  const getErrorMessage = useCallback((err: unknown): string => {
    if (err instanceof Error) {
      if (err.message.includes("fetch") || err.message.includes("network")) {
        return ERROR_MESSAGES.network
      }
      return err.message
    }
    const errorStr = String(err)
    for (const code of Object.keys(ERROR_MESSAGES)) {
      if (errorStr.includes(code)) {
        return ERROR_MESSAGES[code]
      }
    }
    return ERROR_MESSAGES.unknown
  }, [])

  const toggleObjectType = (objectId: string) => {
    setEnabledObjects((prev) => {
      const next = new Set(prev)
      if (next.has(objectId)) {
        next.delete(objectId)
      } else {
        next.add(objectId)
      }
      return next
    })
  }

  /**
   * Handle OAuth flow — opens HubSpot authorization page.
   */
  const handleOAuth = useCallback(() => {
    window.open(
      "/api/integrations/hubspot/oauth/authorize",
      "_blank",
      "width=600,height=700"
    )
  }, [])

  /**
   * Validate Private App token via the validate endpoint.
   */
  const handleValidate = useCallback(async () => {
    if (state === "validating") return

    if (!token.trim()) {
      setError("Please enter your Private App token.")
      return
    }

    if (!token.trim().startsWith("pat-")) {
      setError('HubSpot Private App tokens must start with "pat-".')
      return
    }

    setError(null)
    setState("validating")

    try {
      const validateResponse = await fetch("/api/integrations/hubspot/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token: token.trim(),
          auth_type: "private_app",
          name: connectionName.trim() || undefined,
          enabled_objects: Array.from(enabledObjects),
        }),
      })

      if (!validateResponse.ok) {
        const data = await validateResponse.json().catch(() => ({}))
        throw new Error(data.error || `${validateResponse.status}`)
      }

      const data = await validateResponse.json()
      const pName = data.portal_name || data.portalName || data.account_name || ""
      const pId = data.portal_id || data.portalId || data.hub_id || ""

      setPortalInfo({ portalName: pName, portalId: String(pId) })
      setState("success")

      trackIntegrationConnected("hubspot", {
        category: "crm",
        auth_type: "private_app",
        portal_id: String(pId),
      } as Record<string, string>)

      onSuccess({
        portalName: pName,
        portalId: String(pId),
        authType: "private_app",
        enabledObjects: Array.from(enabledObjects),
      })
    } catch (err) {
      setState("error")
      const msg = getErrorMessage(err)
      setError(msg)
      trackIntegrationConnectionFailed({
        integration_name: "hubspot",
        error_message: msg,
      })
    }
  }, [token, connectionName, enabledObjects, onSuccess, getErrorMessage, state])

  const isLoading = state === "validating"
  const isSuccess = state === "success"

  return (
    <div className={cn("space-y-6", className)} data-slot="hubspot-step">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Connect to HubSpot CRM</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Beton will sync high-intent signals to your HubSpot CRM, creating and
          enriching contacts, companies, and deals with product usage data.
        </p>
      </div>

      {/* Auth Method Selector */}
      <div className="space-y-2">
        <Label>Authentication Method</Label>
        <div className="flex gap-2">
          <Button
            variant={authMethod === "oauth" ? "default" : "outline"}
            size="sm"
            onClick={() => setAuthMethod("oauth")}
            disabled={isLoading || isSuccess}
            className="flex-1"
          >
            <Shield className="h-4 w-4" />
            OAuth
          </Button>
          <Button
            variant={authMethod === "private_app" ? "default" : "outline"}
            size="sm"
            onClick={() => setAuthMethod("private_app")}
            disabled={isLoading || isSuccess}
            className="flex-1"
          >
            <Key className="h-4 w-4" />
            Private App Token
          </Button>
        </div>
      </div>

      {/* OAuth Flow */}
      {authMethod === "oauth" && !isSuccess && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Click below to authorize Beton with your HubSpot account.
            You will be redirected to HubSpot to grant access.
          </p>
          <Button
            onClick={handleOAuth}
            disabled={isLoading}
            className="w-full"
            variant="outline"
          >
            <Shield className="h-4 w-4" />
            Connect with HubSpot OAuth
          </Button>
        </div>
      )}

      {/* Private App Token Input */}
      {authMethod === "private_app" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="hubspot-token">Private App Token</Label>
            <div className="relative">
              <Input
                id="hubspot-token"
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="pat-na1-..."
                disabled={isLoading || isSuccess}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                aria-label={showToken ? "Hide token" : "Show token"}
                disabled={isLoading || isSuccess}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create one in{" "}
              <a
                href="https://app.hubspot.com/private-apps"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                HubSpot Settings &rarr; Private Apps
              </a>
            </p>
          </div>

          {/* Connection Name */}
          <div className="space-y-2">
            <Label htmlFor="hubspot-name">Connection Name</Label>
            <Input
              id="hubspot-name"
              type="text"
              value={connectionName}
              onChange={(e) => setConnectionName(e.target.value)}
              placeholder="My HubSpot"
              disabled={isLoading || isSuccess}
            />
          </div>
        </>
      )}

      {/* Object Type Selection */}
      {!isSuccess && (
        <div className="space-y-2">
          <Label>Object Types to Sync</Label>
          <div className="grid grid-cols-2 gap-2">
            {DEFAULT_OBJECT_TYPES.map((obj) => (
              <label
                key={obj.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border-2 px-3 py-2 cursor-pointer transition-colors text-sm",
                  enabledObjects.has(obj.id)
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-background"
                )}
              >
                <input
                  type="checkbox"
                  checked={enabledObjects.has(obj.id)}
                  onChange={() => toggleObjectType(obj.id)}
                  disabled={isLoading}
                  className="sr-only"
                />
                <div
                  className={cn(
                    "h-4 w-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-colors",
                    enabledObjects.has(obj.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30 bg-background"
                  )}
                >
                  {enabledObjects.has(obj.id) && <Check className="h-2.5 w-2.5" />}
                </div>
                {obj.label}
              </label>
            ))}
          </div>
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
      {isSuccess && portalInfo && (
        <Alert variant="success">
          <Check className="h-4 w-4" />
          <AlertTitle>Connected!</AlertTitle>
          <AlertDescription>
            Successfully connected to HubSpot
            {portalInfo.portalName && (
              <>
                {" "}
                portal: <strong>{portalInfo.portalName}</strong>
              </>
            )}
            {portalInfo.portalId && (
              <span className="text-xs text-muted-foreground ml-1">
                (ID: {portalInfo.portalId})
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Validate Button (Private App mode) */}
      {authMethod === "private_app" && !isSuccess && (
        <Button
          onClick={handleValidate}
          disabled={isLoading || !token.trim()}
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
              Connect HubSpot
            </>
          )}
        </Button>
      )}

      {/* Skip Button */}
      {!isSuccess && onSkip && (
        <button
          type="button"
          onClick={() => {
            trackOnboardingStepSkipped({
              step_key: "hubspot",
              step_name: "Connect HubSpot CRM",
            })
            onSkip()
          }}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      )}
    </div>
  )
}

export default HubSpotStep
