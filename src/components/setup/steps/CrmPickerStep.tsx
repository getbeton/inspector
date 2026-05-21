"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import type { CrmOption } from "@/lib/setup/wizard-sequence";

/** Sentinel id for the "no CRM" / skip choice. */
export const CRM_SKIP = "skip" as const;

export type CrmSelection = string | typeof CRM_SKIP | null;

/**
 * Static presentation metadata for each known CRM. Anything that comes back from
 * the definitions API but isn't listed here still renders with sensible defaults.
 */
const CRM_META: Record<
  string,
  { initials: string; desc: string; requires: string; objects: string[]; long: string }
> = {
  hubspot: {
    initials: "H",
    desc: "Marketing + sales CRM. Push contacts, companies, deals.",
    requires: "Private App token",
    objects: ["Contacts", "Companies", "Deals"],
    long: "Beton creates or updates contacts, companies, and deals in HubSpot, stamping Beton-prefixed properties for signal context.",
  },
  attio: {
    initials: "A",
    desc: "Modern relational CRM. Push to lists + records.",
    requires: "API key",
    objects: ["People", "Companies", "Lists"],
    long: "Beton writes warm-lead lists and stamps record-level attributes on people and companies.",
  },
};

function metaFor(id: string) {
  return (
    CRM_META[id] ?? {
      initials: id.slice(0, 1).toUpperCase(),
      desc: "Route detected signals to this CRM.",
      requires: "API credentials",
      objects: [],
      long: "",
    }
  );
}

export interface CrmPickerStepProps {
  options: CrmOption[];
  selected: CrmSelection;
  onSelect: (id: CrmSelection) => void;
  className?: string;
}

/**
 * Unified "Choose your CRM" step — segmented tabs layout (the design default).
 *
 * Selecting a CRM sets wizard state that routes the subsequent connect + mapping
 * steps. The "I don't have a CRM" choice short-circuits the wizard to the end.
 */
export function CrmPickerStep({ options, selected, onSelect, className }: CrmPickerStepProps) {
  const selectedMeta = selected && selected !== CRM_SKIP ? metaFor(selected) : null;
  const selectedOption = options.find((o) => o.id === selected);

  return (
    <div className={cn("space-y-6", className)} data-slot="crm-picker-step">
      <div className="space-y-2">
        <p className="text-[11px] font-heading uppercase tracking-wider text-muted-foreground">
          Choose your CRM &middot; optional but recommended
        </p>
        <h2 className="text-2xl font-heading uppercase tracking-wider">Choose your CRM</h2>
        <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
          Beton can route detected signals to your CRM, stamping context (signal name, score,
          fired-at) on the matching contact, company, or deal. Pick the destination you want.
        </p>
      </div>

      {/* Segmented tabs — the design default layout */}
      <div
        role="radiogroup"
        aria-label="CRM destination"
        className="inline-flex flex-wrap border-2 border-foreground shadow-[4px_4px_0_var(--color-foreground)]"
      >
        {options.map((crm, i) => {
          const meta = metaFor(crm.id);
          const isSelected = selected === crm.id;
          return (
            <button
              key={crm.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(crm.id)}
              className={cn(
                "flex items-center gap-2.5 px-4 py-3 font-heading text-xs font-bold uppercase tracking-wider transition-colors",
                i < options.length - 1 && "border-r-2 border-foreground",
                isSelected
                  ? "bg-foreground text-background"
                  : "bg-background text-foreground hover:bg-muted/40"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center border-2 text-[11px] font-mono",
                  isSelected
                    ? "border-background bg-background text-foreground"
                    : "border-foreground/30"
                )}
                aria-hidden="true"
              >
                {meta.initials}
              </span>
              {crm.label}
              {crm.isConnected && (
                <Badge variant="success" size="sm">
                  Connected
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail pane for the selected CRM */}
      {selectedMeta && selectedOption && (
        <div className="flex gap-5 border-2 border-foreground/10 bg-background p-5">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-foreground bg-muted/40 font-heading text-lg"
            aria-hidden="true"
          >
            {selectedMeta.initials}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-heading uppercase tracking-wider">
                {selectedOption.label}
              </h3>
              <Badge variant="default" size="sm">
                <Check className="h-3 w-3" aria-hidden="true" /> Selected
              </Badge>
            </div>
            {selectedMeta.long && (
              <p className="text-sm leading-relaxed text-foreground/80">{selectedMeta.long}</p>
            )}
            <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground">
              <span>
                <strong className="text-foreground">Auth:</strong> {selectedMeta.requires}
              </span>
              {selectedMeta.objects.length > 0 && (
                <span>
                  <strong className="text-foreground">Writes to:</strong>{" "}
                  {selectedMeta.objects.join(", ")}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Skip option — subtle, right-aligned */}
      <div className="flex items-center justify-end border-t-2 border-dashed border-foreground/20 pt-4">
        <button
          type="button"
          aria-pressed={selected === CRM_SKIP}
          onClick={() => onSelect(CRM_SKIP)}
          className={cn(
            "border-2 px-3.5 py-2 font-heading text-[11px] font-bold uppercase tracking-wider transition-colors",
            selected === CRM_SKIP
              ? "border-foreground text-foreground"
              : "border-foreground/20 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          )}
        >
          I don&apos;t have a CRM — skip for now
        </button>
      </div>
    </div>
  );
}

export default CrmPickerStep;
