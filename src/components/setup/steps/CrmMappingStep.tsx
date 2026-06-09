"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { FieldMappingPage, fetchFieldMappings, type FieldMappingsPayload } from "@/components/field-mapping";
import type { Destination } from "@/lib/field-mapping/client";

export interface CrmMappingStepProps {
  /** Which CRM the user picked + connected. */
  destination: Destination;
  /** Workspace id required by the field-mapping store (localStorage key + saves). */
  workspaceId: string;
  className?: string;
}

/**
 * CRM-routed field-mapping step. Loads the connected CRM's objects + saved
 * mappings from the real GET /api/integrations/[name]/field-mappings endpoint,
 * then embeds the production FieldMappingPage (which wires save/test/sample-subject
 * to the real PUT / send-test / sample-subjects routes).
 *
 * Custom-field creation: the underlying mapping system maps Beton fields INTO
 * existing CRM properties (property / formula / option / link sources). It does
 * not create brand-new CRM properties, so there is intentionally no "Add custom
 * field" affordance here — formulas cover the computed-field case.
 */
export function CrmMappingStep({ destination, workspaceId, className }: CrmMappingStepProps) {
  const [data, setData] = useState<FieldMappingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await fetchFieldMappings(destination);
        if (cancelled) return;
        setData(payload);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load mappings");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [destination, reloadKey]);

  const crmLabel = destination === "hubspot" ? "HubSpot" : "Attio";

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Spinner className="h-6 w-6" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading {crmLabel} objects&hellip;
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("space-y-4", className)}>
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load field mappings</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          onClick={() => {
            setIsLoading(true);
            setError(null);
            setReloadKey((k) => k + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)} data-slot="crm-mapping-step">
      <div className="space-y-2">
        <p className="text-[11px] font-heading uppercase tracking-wider text-muted-foreground">
          Field mapping &middot; {crmLabel}
        </p>
        <h2 className="text-2xl font-heading uppercase tracking-wider">
          Map signal fields to {crmLabel}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          When a signal fires, Beton writes the matching identity into {crmLabel}. Pick which{" "}
          property receives each Beton field. A source can be a property, a formula, or — for
          select fields — a fixed option.
        </p>
      </div>

      <FieldMappingPage
        destination={destination}
        objects={data?.objects ?? []}
        mappings={data?.mappings ?? { deals: [], people: [], companies: [], workspaces: [] }}
        workspaceId={workspaceId}
        embedded
      />
    </div>
  );
}

export default CrmMappingStep;
