"use client"

import { cn } from "@/lib/utils"
import { Check, Link2 } from "lucide-react"

interface AttioConnectionPreviewProps {
  isConnected: boolean
  workspaceName?: string | null
  className?: string
}

/**
 * Right panel preview for the Attio connection step.
 * Shows Attio branding + workspace name after successful connection.
 */
export function AttioConnectionPreview({
  isConnected,
  workspaceName,
  className,
}: AttioConnectionPreviewProps) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 border-foreground/10 bg-background overflow-hidden",
        className
      )}
    >
      {/* Attio header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-foreground/10 bg-[#5B5FC7]/5">
        <div className="h-10 w-10 rounded-lg bg-[#5B5FC7] flex items-center justify-center">
          <span className="text-white font-bold text-lg">A</span>
        </div>
        <div>
          <h4 className="font-semibold text-sm">Attio</h4>
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
            {/* Workspace display */}
            {workspaceName && (
              <div className="text-center py-4">
                <div className="text-lg font-bold">{workspaceName}</div>
                <div className="text-xs text-muted-foreground mt-1">Workspace</div>
              </div>
            )}

            <div className="space-y-2 border-t border-foreground/5 pt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-green-600" />
                Deals will be created automatically
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-green-600" />
                Company records enriched with signals
              </div>
            </div>
          </>
        ) : (
          /* Pre-connection state */
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link2 className="h-3 w-3" />
                Connect your Attio CRM
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                Beton creates deals on signal detection
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
