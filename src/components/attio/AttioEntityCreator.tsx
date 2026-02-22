"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { AttioEntityChip } from "@/components/setup/previews/AttioEntityChip"
import {
  Building2,
  User,
  Handshake,
  Check,
  ArrowRight,
  ExternalLink,
} from "lucide-react"
import {
  trackAttioEntityCreated,
  trackAttioEntityCreationFailed,
} from "@/lib/analytics"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntityResult {
  record_id: string
  object_slug: string
  attio_url: string | null
}

interface BatchResult {
  company?: EntityResult
  person?: EntityResult
  deal?: EntityResult
}

export interface AttioEntityCreatorProps {
  companyName?: string
  companyDomain?: string
  personName?: string
  personEmail?: string
  /** Attio workspace slug for deep links */
  attioWorkspaceSlug?: string | null
  /** Callbacks */
  onEntitiesCreated?: (result: BatchResult) => void
  /** Analytics context: where this component is rendered */
  analyticsContext?: "onboarding" | "standalone"
  /** inline = embedded in onboarding, dialog = standalone overlay */
  mode?: "inline" | "dialog"
  className?: string
}

interface ExistenceState {
  loading: boolean
  company: { exists: boolean; recordId?: string } | null
  person: { exists: boolean; recordId?: string } | null
}

type CreationPhase = "idle" | "company" | "person" | "deal" | "done" | "error"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttioEntityCreator({
  companyName,
  companyDomain,
  personName,
  personEmail,
  attioWorkspaceSlug,
  onEntitiesCreated,
  analyticsContext = "standalone",
  mode = "inline",
  className,
}: AttioEntityCreatorProps) {
  // Checkbox state
  const [createCompany, setCreateCompany] = useState(true)
  const [createPerson, setCreatePerson] = useState(true)
  const [createDeal, setCreateDeal] = useState(true)

  // Existence check
  const [existence, setExistence] = useState<ExistenceState>({
    loading: false,
    company: null,
    person: null,
  })

  // Creation state
  const [phase, setPhase] = useState<CreationPhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BatchResult | null>(null)

  // Check if entities already exist in Attio
  useEffect(() => {
    if (!companyDomain && !personEmail) return

    const controller = new AbortController()
    const { signal } = controller
    setExistence((prev) => ({ ...prev, loading: true }))

    const checks = []

    if (companyDomain) {
      checks.push(
        fetch(
          `/api/integrations/attio/search?q=${encodeURIComponent(companyDomain)}&object=companies`,
          { signal }
        )
          .then((r) => r.json())
          .then((data) => {
            if (signal.aborted) return
            const match = data.results?.[0]
            setExistence((prev) => ({
              ...prev,
              company: match
                ? { exists: true, recordId: match.id }
                : { exists: false },
            }))
            if (match) setCreateCompany(false)
          })
          .catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') return
            if (!signal.aborted)
              setExistence((prev) => ({ ...prev, company: { exists: false } }))
          })
      )
    }

    if (personEmail) {
      checks.push(
        fetch(
          `/api/integrations/attio/search?q=${encodeURIComponent(personEmail)}&object=people`,
          { signal }
        )
          .then((r) => r.json())
          .then((data) => {
            if (signal.aborted) return
            const match = data.results?.[0]
            setExistence((prev) => ({
              ...prev,
              person: match
                ? { exists: true, recordId: match.id }
                : { exists: false },
            }))
            if (match) setCreatePerson(false)
          })
          .catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') return
            if (!signal.aborted)
              setExistence((prev) => ({ ...prev, person: { exists: false } }))
          })
      )
    }

    Promise.all(checks).finally(() => {
      if (!signal.aborted) setExistence((prev) => ({ ...prev, loading: false }))
    })

    return () => {
      controller.abort()
    }
  }, [companyDomain, personEmail])

  // Create entities via batch API
  const handleCreate = useCallback(async () => {
    // Track phase locally to avoid stale closure reads on `phase` state
    let currentPhase: CreationPhase = "company"
    setPhase("company")
    setError(null)

    try {
      const body: Record<string, unknown> = {}

      if (createCompany && companyName) {
        body.create_company = true
        body.company_data = {
          name: companyName,
          ...(companyDomain ? { domains: [companyDomain] } : {}),
        }
      }

      if (createPerson && personEmail) {
        body.create_person = true
        body.person_data = {
          email_addresses: personEmail,
          ...(personName
            ? {
                name: personName,
              }
            : {}),
        }
      }

      if (createDeal && companyName) {
        body.create_deal = true
        body.deal_data = {
          name: `${companyName} — Beton Signal`,
        }
      }

      // Single batch call
      currentPhase = createCompany ? "company" : createPerson ? "person" : "deal"
      setPhase(currentPhase)
      const res = await fetch("/api/integrations/attio/entities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to create entities")
      }

      const batchResult: BatchResult = data.results || {}
      setResult(batchResult)
      currentPhase = "done"
      setPhase("done")

      // Track each successfully created entity
      if (batchResult.company) {
        trackAttioEntityCreated({ object_type: "company", context: analyticsContext })
      }
      if (batchResult.person) {
        trackAttioEntityCreated({ object_type: "person", context: analyticsContext })
      }
      if (batchResult.deal) {
        trackAttioEntityCreated({ object_type: "deal", context: analyticsContext })
      }

      onEntitiesCreated?.(batchResult)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred"
      setError(msg)
      setPhase("error")

      // Use currentPhase (local) rather than phase (stale closure)
      const failedType = currentPhase === "company" ? "company" : currentPhase === "person" ? "person" : "deal"
      trackAttioEntityCreationFailed({ object_type: failedType })
    }
  }, [
    createCompany,
    createPerson,
    createDeal,
    companyName,
    companyDomain,
    personName,
    personEmail,
    onEntitiesCreated,
    analyticsContext,
  ])

  const isCreating = phase !== "idle" && phase !== "done" && phase !== "error"
  const nothingToCreate = !createCompany && !createPerson && !createDeal
  const noData = !companyName && !personEmail

  // ── Success state ──────────────────────────────────────────────
  if (phase === "done" && result) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-center gap-2 text-xs text-green-600">
          <Check className="h-3.5 w-3.5" />
          <span className="font-bold uppercase tracking-wider">
            Entities created in Attio
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {result.company && (
            <AttioEntityChip
              name={companyName || "Company"}
              objectSlug="companies"
              workspaceSlug={attioWorkspaceSlug}
              recordId={result.company.record_id}
              linked={!!attioWorkspaceSlug}
            />
          )}
          {result.person && (
            <AttioEntityChip
              name={personName || personEmail || "Contact"}
              objectSlug="people"
              workspaceSlug={attioWorkspaceSlug}
              recordId={result.person.record_id}
              linked={!!attioWorkspaceSlug}
            />
          )}
          {result.deal && (
            <AttioEntityChip
              name={`${companyName || "Deal"} — Beton Signal`}
              objectSlug="deals"
              workspaceSlug={attioWorkspaceSlug}
              recordId={result.deal.record_id}
              linked={!!attioWorkspaceSlug}
            />
          )}
        </div>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "space-y-4",
        mode === "dialog" && "p-4",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <picture>
          <source
            srcSet="https://cdn.brandfetch.io/idZA7HYRWK/theme/dark/symbol.svg"
            media="(prefers-color-scheme: dark)"
          />
          <img
            src="https://cdn.brandfetch.io/idZA7HYRWK/theme/light/symbol.svg"
            alt=""
            className="h-4 w-4"
          />
        </picture>
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Create in Attio
        </span>
        {existence.loading && <Spinner className="size-3" />}
      </div>

      {noData ? (
        <p className="text-xs text-muted-foreground italic">
          Select a contact or enter company data to create Attio entities.
        </p>
      ) : (
        <>
          {/* Company row */}
          {companyName && (
            <EntityRow
              icon={<Building2 className="h-3.5 w-3.5" />}
              label={companyName}
              sublabel={companyDomain}
              checked={createCompany}
              onCheckedChange={setCreateCompany}
              exists={existence.company}
              attioWorkspaceSlug={attioWorkspaceSlug}
              objectSlug="companies"
              disabled={isCreating}
            />
          )}

          {/* Chain arrow */}
          {companyName && personEmail && (
            <div className="flex items-center gap-1 pl-6 text-muted-foreground/40">
              <ArrowRight className="h-3 w-3" />
              <span className="text-[10px]">linked to</span>
            </div>
          )}

          {/* Person row */}
          {personEmail && (
            <EntityRow
              icon={<User className="h-3.5 w-3.5" />}
              label={personName || personEmail.split("@")[0]}
              sublabel={personEmail}
              checked={createPerson}
              onCheckedChange={setCreatePerson}
              exists={existence.person}
              attioWorkspaceSlug={attioWorkspaceSlug}
              objectSlug="people"
              disabled={isCreating}
            />
          )}

          {/* Chain arrow */}
          {(companyName || personEmail) && createDeal && (
            <div className="flex items-center gap-1 pl-6 text-muted-foreground/40">
              <ArrowRight className="h-3 w-3" />
              <span className="text-[10px]">creates</span>
            </div>
          )}

          {/* Deal row */}
          {(companyName || personEmail) && (
            <EntityRow
              icon={<Handshake className="h-3.5 w-3.5" />}
              label={`${companyName || "New"} — Beton Signal`}
              checked={createDeal}
              onCheckedChange={setCreateDeal}
              exists={null}
              attioWorkspaceSlug={attioWorkspaceSlug}
              objectSlug="deals"
              disabled={isCreating}
            />
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          {/* Progress */}
          {isCreating && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3" />
              <span>
                {phase === "company"
                  ? "Creating company..."
                  : phase === "person"
                    ? "Creating contact..."
                    : "Creating deal..."}
              </span>
            </div>
          )}

          {/* Create button */}
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={isCreating || nothingToCreate}
            className="w-full"
          >
            {isCreating ? "Creating..." : "Create in Attio"}
          </Button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entity row with checkbox
// ---------------------------------------------------------------------------

function EntityRow({
  icon,
  label,
  sublabel,
  checked,
  onCheckedChange,
  exists,
  attioWorkspaceSlug,
  objectSlug,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  exists: { exists: boolean; recordId?: string } | null
  attioWorkspaceSlug?: string | null
  objectSlug: "companies" | "people" | "deals"
  disabled?: boolean
}) {
  const existsInAttio = exists?.exists === true

  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors",
        "border-2",
        checked
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-background",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {/* Custom checkbox */}
      <div
        className={cn(
          "h-4 w-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-colors",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 bg-background"
        )}
      >
        {checked && <Check className="h-2.5 w-2.5" />}
      </div>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        disabled={disabled}
      />

      {/* Icon */}
      <span className="text-muted-foreground shrink-0">{icon}</span>

      {/* Label */}
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium truncate block">{label}</span>
        {sublabel && (
          <span className="text-[10px] text-muted-foreground font-mono truncate block">
            {sublabel}
          </span>
        )}
      </div>

      {/* Status badge */}
      {existsInAttio ? (
        <a
          href={
            attioWorkspaceSlug && exists?.recordId
              ? `https://app.attio.com/${attioWorkspaceSlug}/${objectSlug}/${exists.recordId}`
              : undefined
          }
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
        >
          <Badge size="sm" className="bg-success/10 text-success border-success/20 gap-1">
            Exists
            {attioWorkspaceSlug && exists?.recordId && (
              <ExternalLink className="h-2.5 w-2.5" />
            )}
          </Badge>
        </a>
      ) : exists !== null ? (
        <Badge size="sm" variant="outline" className="text-primary border-primary/30 shrink-0">
          New
        </Badge>
      ) : null}
    </label>
  )
}
