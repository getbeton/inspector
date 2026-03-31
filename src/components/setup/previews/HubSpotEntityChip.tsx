"use client"

import { cn } from "@/lib/utils"
import { ExternalLink } from "lucide-react"

interface HubSpotEntityChipProps {
  /** Entity display name (e.g., "Acme Corp") */
  name: string
  /** HubSpot object type: "companies", "contacts", or "deals" */
  objectType: "companies" | "contacts" | "deals"
  /** HubSpot portal ID for building the deep link */
  portalId?: string | number | null
  /** HubSpot record ID for deep linking */
  recordId?: string | null
  /** Whether the entity exists in HubSpot */
  linked?: boolean
  className?: string
}

/**
 * Pill badge linking to a HubSpot entity page.
 *
 * - Linked state (solid border): clickable, opens in new tab
 * - Unlinked state (dashed border): muted, shows "(not linked)" tooltip
 * - Neobrutalist hover: shadow offset + translate
 */
export function HubSpotEntityChip({
  name,
  objectType,
  portalId,
  recordId,
  linked = true,
  className,
}: HubSpotEntityChipProps) {
  const urlObjectType: Record<string, string> = {
    contacts: "contact",
    companies: "company",
    deals: "deal",
  }
  const pathType = urlObjectType[objectType] || objectType

  const href =
    linked && portalId && recordId
      ? `https://app.hubspot.com/contacts/${encodeURIComponent(String(portalId))}/${pathType}/${encodeURIComponent(recordId)}`
      : undefined

  const Wrapper = href ? "a" : "span"
  const wrapperProps = href
    ? { href, target: "_blank" as const, rel: "noopener noreferrer" }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      title={linked ? "Open in HubSpot" : "Not linked in HubSpot"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono transition-all",
        linked
          ? "border-2 border-foreground/10 text-foreground hover:shadow-[2px_2px_0_0_rgba(0,0,0,0.1)] hover:-translate-y-px cursor-pointer"
          : "border-2 border-dashed border-muted-foreground/20 text-muted-foreground/60 cursor-default",
        className
      )}
    >
      {/* HubSpot icon - small inline */}
      <div className="h-3 w-3 rounded-sm bg-[#FF7A59] flex items-center justify-center shrink-0">
        <span className="text-white text-[6px] font-bold leading-none">H</span>
      </div>

      {/* Status dot */}
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0",
          linked ? "bg-green-500" : "bg-muted-foreground/30"
        )}
      />

      <span className="truncate max-w-[120px]">{name}</span>

      {href && <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />}
    </Wrapper>
  )
}
