"use client"

import { cn } from "@/lib/utils"
import { Check, Link2, Key, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface HubSpotConnectionPreviewProps {
  isConnected: boolean
  portalName?: string | null
  portalId?: string | null
  authType?: "oauth" | "private_app" | null
  enabledObjects?: string[]
  className?: string
}

/**
 * Right panel preview for the HubSpot connection step.
 * Shows HubSpot branding + portal name after successful connection.
 */
export function HubSpotConnectionPreview({
  isConnected,
  portalName,
  portalId,
  authType,
  enabledObjects,
  className,
}: HubSpotConnectionPreviewProps) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 border-foreground/10 bg-background overflow-hidden",
        className
      )}
    >
      {/* HubSpot header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-foreground/10 bg-[#FF7A59]/5">
        <div className="h-10 w-10 rounded-lg bg-[#FF7A59] flex items-center justify-center p-1.5">
          <svg viewBox="0 0 512 512" className="h-full w-full" fill="white">
            <path d="M267.4 211.6v-69.8c19.1-7.9 32.4-27.4 32.4-49.8 0-29.8-24.2-54-54-54s-54 24.2-54 54c0 22.4 13.3 41.9 32.4 49.8v69.8c-38.5 9.6-72.6 30.5-98.1 59.2L80.3 188c3.6-12 1.3-25-6.1-34.8-7.4-9.8-19.1-15.5-31.3-15.5-2.7 0-5.4.3-8.1.9-16.3 3.5-26.7 19.5-23.2 35.8 2.3 10.8 10.1 19.8 20.3 23.6 10.2 3.8 21.6 2 30.1-4.8l45.8 32.8c-25.8 36-40.3 79.5-40.3 125.3 0 3.1.1 6.2.2 9.3l-32.3 9.4c-7-12.3-20.2-20.1-34.7-20.1-22.1 0-40 17.9-40 40s17.9 40 40 40c18.9 0 34.7-13.1 38.8-30.7l33.2-9.7c30.3 77.6 105.7 132.7 193.6 132.7 114.9 0 208-93.1 208-208 0-93.2-61.4-172.1-146-198.4zM245.8 72c10.5 0 19 8.5 19 19s-8.5 19-19 19-19-8.5-19-19 8.5-19 19-19zM0.6 390c-8.3 0-15-6.7-15-15s6.7-15 15-15 15 6.7 15 15-6.7 15-15 15zm245.2 135c-99.4 0-180-80.6-180-180s80.6-180 180-180 180 80.6 180 180-80.6 180-180 180z" />
          </svg>
        </div>
        <div>
          <h4 className="font-semibold text-sm">HubSpot</h4>
          <p className="text-xs text-muted-foreground">CRM Platform</p>
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
            {/* Portal display */}
            {portalName && (
              <div className="text-center py-4">
                <div className="text-lg font-bold">{portalName}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Portal{portalId ? ` (${portalId})` : ""}
                </div>
              </div>
            )}

            {/* Auth type indicator */}
            {authType && (
              <div className="flex items-center justify-center gap-2">
                {authType === "oauth" ? (
                  <Badge size="sm" className="bg-blue-500/10 text-blue-600 border-blue-500/20 gap-1">
                    <Shield className="h-3 w-3" />
                    OAuth
                  </Badge>
                ) : (
                  <Badge size="sm" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
                    <Key className="h-3 w-3" />
                    Private App
                  </Badge>
                )}
              </div>
            )}

            {/* Enabled objects */}
            {enabledObjects && enabledObjects.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-center">
                {enabledObjects.map((obj) => (
                  <Badge key={obj} size="sm" variant="outline">
                    {obj.charAt(0).toUpperCase() + obj.slice(1)}
                  </Badge>
                ))}
              </div>
            )}

            <div className="space-y-2 border-t border-foreground/5 pt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-green-600" />
                Companies and contacts will be synced
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-green-600" />
                Deals created from detected signals
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-green-600" />
                Beton scores enriched on records
              </div>
            </div>
          </>
        ) : (
          /* Pre-connection state */
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link2 className="h-3 w-3" />
                Connect your HubSpot CRM
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                Beton creates deals on signal detection
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                Enriches contacts with usage signals
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                Map custom fields in the next step
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
