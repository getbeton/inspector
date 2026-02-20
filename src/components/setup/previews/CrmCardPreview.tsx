"use client"

import { cn } from "@/lib/utils"
import { resolveTemplate } from "../fields/TemplateInput"
import type { SampleData } from "../steps/DealFieldMappingStep"
import type { DealMappingState } from "../steps/DealFieldMappingStep"

interface CrmCardPreviewProps {
  mappingState: DealMappingState
  sampleData: SampleData
  attioWorkspaceName?: string
  className?: string
}

/**
 * Attio-branded deal card preview for the right panel.
 * Shows all mapped fields with resolved template values.
 * Updates live as the user changes the mapping.
 */
export function CrmCardPreview({
  mappingState,
  sampleData,
  attioWorkspaceName,
  className,
}: CrmCardPreviewProps) {
  const dataRecord = sampleData as unknown as Record<string, unknown>
  const resolvedName = resolveTemplate(
    mappingState.dealNameTemplate || "Untitled Deal",
    dataRecord
  )

  // Resolve all field mapping values
  const resolvedFields = mappingState.fieldMappings
    .filter((m) => m.attioAttributeSlug)
    .map((m) => ({
      label: m.attioAttributeTitle || m.attioAttributeSlug || "Unknown",
      value: resolveTemplate(m.valueTemplate, dataRecord),
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
          <div className="h-5 w-5 rounded bg-[#5B5FC7] flex items-center justify-center">
            <span className="text-white font-bold text-[10px]">A</span>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {attioWorkspaceName || "Attio"} &middot; Deal
          </span>
        </div>
        <span className="ml-auto text-[10px] text-muted-foreground/60">Preview</span>
      </div>

      {/* Deal title */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="font-semibold text-base leading-tight">{resolvedName}</h3>
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

        {/* Linked entities (always show) */}
        <div className="pt-2 mt-2 border-t border-foreground/5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
              Linked
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              {sampleData.company_name}
            </span>
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
