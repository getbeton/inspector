"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Check, Globe, Server, Shield } from "lucide-react"

interface FirecrawlPreviewProps {
  isConnected: boolean
  mode?: "cloud" | "self_hosted" | null
  proxyTier?: string | null
  className?: string
}

const PROXY_LABELS: Record<string, string> = {
  basic: "Basic Proxy",
  stealth: "Stealth Proxy",
}

/**
 * Right panel preview for the Firecrawl connection step.
 * Shows Firecrawl branding + connection details after successful setup.
 * Displays "Optional" badge since Firecrawl is not required for onboarding.
 */
export function FirecrawlPreview({
  isConnected,
  mode,
  proxyTier,
  className,
}: FirecrawlPreviewProps) {
  const isSelfHosted = mode === "self_hosted"

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-foreground/10 bg-background overflow-hidden",
        className
      )}
    >
      {/* Firecrawl header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-foreground/10 bg-[#FF6B2B]/5">
        <picture>
          <source
            srcSet="https://cdn.brandfetch.io/idfR2SHJgu/w/400/h/400/theme/dark/icon.jpeg"
            media="(prefers-color-scheme: dark)"
          />
          <img
            src="https://cdn.brandfetch.io/idfR2SHJgu/w/400/h/400/theme/light/icon.jpeg"
            alt="Firecrawl"
            className="h-10 w-10 rounded-lg object-cover"
          />
        </picture>
        <div>
          <h4 className="font-semibold text-sm">Firecrawl</h4>
          <p className="text-xs text-muted-foreground">Web Scraping</p>
        </div>
        <div className="ml-auto">
          {isConnected ? (
            <div className="flex items-center gap-1 text-green-600">
              <Check className="h-4 w-4" />
              <span className="text-xs font-medium">Connected</span>
            </div>
          ) : (
            <Badge variant="outline" size="sm" className="text-muted-foreground">
              Optional
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isConnected ? (
          <>
            {/* Mode display */}
            <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-foreground/5 pb-3">
              <span>Deployment</span>
              {isSelfHosted ? (
                <Badge variant="outline" size="sm">
                  <Server className="h-3 w-3" />
                  Self-Hosted
                </Badge>
              ) : (
                <Badge variant="outline" size="sm">
                  <Globe className="h-3 w-3" />
                  Cloud
                </Badge>
              )}
            </div>

            {/* Proxy tier display (cloud only) */}
            {!isSelfHosted && proxyTier && PROXY_LABELS[proxyTier] && (
              <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-foreground/5 pb-3">
                <span>Proxy</span>
                <Badge variant="outline" size="sm">
                  <Shield className="h-3 w-3" />
                  {PROXY_LABELS[proxyTier]}
                </Badge>
              </div>
            )}

            {/* Decorative test scrape button */}
            <button
              type="button"
              disabled
              className="w-full rounded-md border-2 border-foreground/10 bg-muted/30 px-3 py-2 text-xs text-muted-foreground cursor-not-allowed"
            >
              Test Scrape (available after setup)
            </button>
          </>
        ) : (
          /* Pre-connection state */
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                Scrape websites for lead intelligence
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                AI-powered data extraction
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                Enrich account profiles with web data
              </div>
            </div>
            <p className="text-xs text-muted-foreground/60 text-center">
              You can set this up later in Settings
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
