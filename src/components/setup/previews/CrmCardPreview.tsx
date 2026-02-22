"use client"

import { cn } from "@/lib/utils"
import { resolveTemplate } from "../fields/TemplateInput"
import { AttioEntityChip } from "./AttioEntityChip"
import type { SampleData } from "@/lib/setup/sample-data"
import type { DealMappingState } from "../steps/DealFieldMappingStep"

interface CrmCardPreviewProps {
  mappingState: DealMappingState
  sampleData: SampleData
  attioWorkspaceName?: string
  /** Attio workspace slug (lowercase, URL-safe) for building deep links */
  attioWorkspaceSlug?: string | null
  className?: string
}

/**
 * Attio-branded deal card preview for the right panel.
 * Shows all mapped fields with resolved template values.
 * Updates live as the user changes the mapping.
 *
 * Linked entities section shows company, contact, and deal chips
 * with deep links to Attio.
 */
export function CrmCardPreview({
  mappingState,
  sampleData,
  attioWorkspaceName,
  attioWorkspaceSlug,
  className,
}: CrmCardPreviewProps) {
  const resolvedName = resolveTemplate(
    mappingState.dealNameTemplate || "Untitled Deal",
    sampleData
  )

  // Resolve all field mapping values
  const resolvedFields = mappingState.fieldMappings
    .filter((m) => m.attioAttributeSlug)
    .map((m) => ({
      label: m.attioAttributeTitle || m.attioAttributeSlug || "Unknown",
      value: resolveTemplate(m.valueTemplate, sampleData),
      type: m.attioAttributeType,
      objectSlug: m.attioObjectSlug,
    }))

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-foreground/15 bg-background overflow-hidden shadow-md",
        className
      )}
    >
      {/* Attio-style header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/10 bg-muted/30">
        <div className="flex items-center gap-2">
          {/* Attio icon */}
          <picture>
            <source
              srcSet="https://cdn.brandfetch.io/idZA7HYRWK/theme/dark/symbol.svg"
              media="(prefers-color-scheme: dark)"
            />
            <img
              src="https://cdn.brandfetch.io/idZA7HYRWK/theme/light/symbol.svg"
              alt=""
              className="h-5 w-5"
            />
          </picture>
          <span className="text-xs font-medium text-muted-foreground">
            {attioWorkspaceName || "Attio"} &middot; Deal
          </span>
        </div>
        <span className="ml-auto text-[10px] text-muted-foreground/60">Preview</span>
      </div>

      {/* Deal title + company domain */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="font-semibold text-base leading-tight">{resolvedName}</h3>
        <span className="text-xs text-muted-foreground font-mono">{sampleData.company_domain}</span>
      </div>

      {/* Field values */}
      <div className="px-4 pb-4 space-y-2">
        {resolvedFields.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-3">
            Add field mappings to see them here
          </p>
        ) : (
          resolvedFields.map((field, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <span className="text-muted-foreground text-xs w-28 shrink-0 pt-0.5 truncate">
                {field.label}
              </span>
              <span className="text-foreground text-xs font-medium break-all">
                {field.value || <span className="text-muted-foreground/50 italic">empty</span>}
              </span>
            </div>
          ))
        )}

        {/* User email row */}
        {sampleData.user_email && (
          <div className="flex items-start gap-3 text-sm">
            <span className="text-muted-foreground text-xs w-28 shrink-0 pt-0.5">
              Contact
            </span>
            <span className="text-foreground text-xs font-mono">
              {sampleData.user_email}
            </span>
          </div>
        )}

        {/* Linked entities */}
        <div className="pt-3 mt-2 border-t border-foreground/5 space-y-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold block">
            Linked Entities
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <AttioEntityChip
              name={sampleData.company_name}
              objectSlug="companies"
              workspaceSlug={attioWorkspaceSlug}
              linked={!!attioWorkspaceSlug}
            />
            <AttioEntityChip
              name={sampleData.user_email.split("@")[0] || "Contact"}
              objectSlug="people"
              workspaceSlug={attioWorkspaceSlug}
              linked={false}
            />
            <AttioEntityChip
              name={resolvedName}
              objectSlug="deals"
              workspaceSlug={attioWorkspaceSlug}
              linked={false}
            />
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="px-4 py-2 bg-muted/20 border-t border-foreground/5 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          Created by Beton Inspector
        </span>
        <span className="text-[10px] text-muted-foreground">
          {sampleData.detected_at}
        </span>
      </div>
    </div>
  )
}
