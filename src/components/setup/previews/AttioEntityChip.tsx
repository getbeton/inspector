"use client"

import { cn } from "@/lib/utils"
import { ExternalLink } from "lucide-react"

interface AttioEntityChipProps {
  /** Entity display name (e.g., "Acme Corp") */
  name: string
  /** Attio object type slug: "companies", "people", or "deals" */
  objectSlug: "companies" | "people" | "deals"
  /** Attio workspace slug for building the deep link */
  workspaceSlug?: string | null
  /** Attio record ID for deep linking */
  recordId?: string | null
  /** Whether the entity exists in Attio */
  linked?: boolean
  className?: string
}

/**
 * Pill badge linking to an Attio entity page.
 *
 * - Linked state (solid border): clickable, opens in new tab
 * - Unlinked state (dashed border): muted, shows "(not linked)" tooltip
 * - Neobrutalist hover: shadow offset + translate
 */
export function AttioEntityChip({
  name,
  objectSlug,
  workspaceSlug,
  recordId,
  linked = true,
  className,
}: AttioEntityChipProps) {
  const href =
    linked && workspaceSlug && recordId
      ? `https://app.attio.com/${workspaceSlug}/${objectSlug}/${recordId}`
      : undefined

  const Wrapper = href ? "a" : "span"
  const wrapperProps = href
    ? { href, target: "_blank" as const, rel: "noopener noreferrer" }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      title={linked ? `Open in Attio` : "Not linked in Attio"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono transition-all",
        linked
          ? "border-2 border-foreground/10 text-foreground hover:shadow-[2px_2px_0_0_rgba(0,0,0,0.1)] hover:-translate-y-px cursor-pointer"
          : "border-2 border-dashed border-muted-foreground/20 text-muted-foreground/60 cursor-default",
        className
      )}
    >
      {/* Attio icon — small inline */}
      <picture>
        <source
          srcSet="https://cdn.brandfetch.io/idZA7HYRWK/theme/dark/symbol.svg"
          media="(prefers-color-scheme: dark)"
        />
        <img
          src="https://cdn.brandfetch.io/idZA7HYRWK/theme/light/symbol.svg"
          alt=""
          className="h-3 w-3"
        />
      </picture>

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
