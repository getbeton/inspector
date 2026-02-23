"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Check, ExternalLink, Server } from "lucide-react"

interface PostHogPreviewProps {
  isConnected: boolean
  mtuCount?: number | null
  region?: string
  className?: string
}

/**
 * Right panel preview for the PostHog connection step.
 * Shows PostHog branding + MTU count after successful connection.
 * Handles both cloud (US/EU) and self-hosted modes.
 */
export function PostHogPreview({
  isConnected,
  mtuCount,
  region,
  className,
}: PostHogPreviewProps) {
  const isSelfHosted = region === "self_hosted"

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-foreground/10 bg-background overflow-hidden",
        className
      )}
    >
      {/* PostHog header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-foreground/10 bg-[#1D4AFF]/5">
        {/* PostHog hedgehog icon */}
        <div className="h-10 w-10 rounded-lg bg-[#1D4AFF] flex items-center justify-center p-1.5">
          <picture>
            <source srcSet="https://cdn.brandfetch.io/id2veLU_gI/theme/dark/symbol.svg" media="(prefers-color-scheme: dark)" />
            <img src="https://cdn.brandfetch.io/id2veLU_gI/theme/light/symbol.svg" alt="PostHog" className="h-full w-full" />
          </picture>
        </div>
        <div>
          <h4 className="font-semibold text-sm">PostHog</h4>
          <p className="text-xs text-muted-foreground">Product Analytics</p>
        </div>
        {isConnected && (
          <div className="ml-auto flex items-center gap-1 text-green-600">
            <Check className="h-4 w-4" />
            <span className="text-xs font-medium">Connected</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {isConnected ? (
          <>
            {/* MTU display */}
            {mtuCount !== null && mtuCount !== undefined && (
              <div className="text-center py-4">
                <div className="text-3xl font-bold">{mtuCount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Monthly Tracked Users
                </div>
              </div>
            )}

            {/* Region / Self-hosted info */}
            {region && (
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-foreground/5 pt-3">
                <span>{isSelfHosted ? "Deployment" : "Region"}</span>
                {isSelfHosted ? (
                  <Badge variant="outline" size="sm">
                    <Server className="h-3 w-3" />
                    Self-Hosted
                  </Badge>
                ) : (
                  <span className="font-medium text-foreground uppercase">{region}</span>
                )}
              </div>
            )}

            <div className="flex items-center justify-center text-xs text-muted-foreground">
              <ExternalLink className="h-3 w-3 mr-1" />
              PostHog Dashboard
            </div>
          </>
        ) : (
          /* Pre-connection state */
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                Connect your PostHog project
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                Beton will analyze product usage
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                Detect PQL signals automatically
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
