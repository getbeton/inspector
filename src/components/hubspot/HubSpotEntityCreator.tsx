"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { HubSpotEntityChip } from "@/components/setup/previews/HubSpotEntityChip"
import {
  Building2,
  User,
  Handshake,
  Check,
  ArrowRight,
  ExternalLink,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntityResult {
  record_id: string
  object_type: string
  hubspot_url: string | null
}

interface BatchResult {
  company?: EntityResult
  contact?: EntityResult
  deal?: EntityResult
}

export interface HubSpotEntityCreatorProps {
  companyName?: string
  companyDomain?: string
  contactName?: string
  contactEmail?: string
  /** HubSpot portal ID for deep links */
  portalId?: string | number | null
  /** Connection ID */
  connectionId?: string
  /** Callbacks */
  onEntitiesCreated?: (result: BatchResult) => void
  /** inline = embedded in onboarding, dialog = standalone overlay */
  mode?: "inline" | "dialog"
  className?: string
}

type CreationPhase = "idle" | "company" | "contact" | "deal" | "done" | "error"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HubSpotEntityCreator({
  companyName,
  companyDomain,
  contactName,
  contactEmail,
  portalId,
  connectionId,
  onEntitiesCreated,
  mode = "inline",
  className,
}: HubSpotEntityCreatorProps) {
  // Checkbox state
  const [createCompany, setCreateCompany] = useState(true)
  const [createContact, setCreateContact] = useState(true)
  const [createDeal, setCreateDeal] = useState(true)

  // Existence check
  const [existenceLoading, setExistenceLoading] = useState(false)
  const [companyExists, setCompanyExists] = useState<{
    exists: boolean
    recordId?: string
  } | null>(null)
  const [contactExists, setContactExists] = useState<{
    exists: boolean
    recordId?: string
  } | null>(null)

  // Creation state
  const [phase, setPhase] = useState<CreationPhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BatchResult | null>(null)

  // Check if entities already exist in HubSpot
  useEffect(() => {
    if (!companyDomain && !contactEmail) return

    const controller = new AbortController()
    const { signal } = controller
    setExistenceLoading(true)

    const checks = []

    if (companyDomain) {
      const params = new URLSearchParams({
        object_type: "companies",
        property: "domain",
        value: companyDomain,
      })
      if (connectionId) params.set("connection_id", connectionId)

      checks.push(
        fetch(`/api/integrations/hubspot/search?${params}`, { signal })
          .then((r) => r.json())
          .then((data) => {
            if (signal.aborted) return
            const match = data.results?.[0]
            setCompanyExists(
              match
                ? { exists: true, recordId: match.id }
                : { exists: false }
            )
            if (match) setCreateCompany(false)
          })
          .catch((err) => {
            if (err instanceof DOMException && err.name === "AbortError") return
            if (!signal.aborted) setCompanyExists({ exists: false })
          })
      )
    }

    if (contactEmail) {
      const params = new URLSearchParams({
        object_type: "contacts",
        property: "email",
        value: contactEmail,
      })
      if (connectionId) params.set("connection_id", connectionId)

      checks.push(
        fetch(`/api/integrations/hubspot/search?${params}`, { signal })
          .then((r) => r.json())
          .then((data) => {
            if (signal.aborted) return
            const match = data.results?.[0]
            setContactExists(
              match
                ? { exists: true, recordId: match.id }
                : { exists: false }
            )
            if (match) setCreateContact(false)
          })
          .catch((err) => {
            if (err instanceof DOMException && err.name === "AbortError") return
            if (!signal.aborted) setContactExists({ exists: false })
          })
      )
    }

    Promise.all(checks).finally(() => {
      if (!signal.aborted) setExistenceLoading(false)
    })

    return () => {
      controller.abort()
    }
  }, [companyDomain, contactEmail, connectionId])

  // Create entities via batch API
  const handleCreate = useCallback(async () => {
    let currentPhase: CreationPhase = "company"
    setPhase("company")
    setError(null)

    try {
      const body: Record<string, unknown> = {}
      if (connectionId) body.connection_id = connectionId

      if (createCompany && companyName) {
        body.create_company = true
        body.company_data = {
          name: companyName,
          ...(companyDomain ? { domain: companyDomain } : {}),
        }
      }

      if (createContact && contactEmail) {
        body.create_contact = true
        body.contact_data = {
          email: contactEmail,
          ...(contactName
            ? {
                firstname: contactName.split(" ")[0],
                lastname: contactName.split(" ").slice(1).join(" ") || undefined,
              }
            : {}),
        }
      }

      if (createDeal && companyName) {
        body.create_deal = true
        body.deal_data = {
          dealname: `${companyName} -- Beton Signal`,
        }
      }

      currentPhase = createCompany ? "company" : createContact ? "contact" : "deal"
      setPhase(currentPhase)

      const res = await fetch("/api/integrations/hubspot/entities", {
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

      onEntitiesCreated?.(batchResult)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred"
      setError(msg)
      setPhase("error")
    }
  }, [
    createCompany,
    createContact,
    createDeal,
    companyName,
    companyDomain,
    contactName,
    contactEmail,
    connectionId,
    onEntitiesCreated,
  ])

  const isCreating = phase !== "idle" && phase !== "done" && phase !== "error"
  const nothingToCreate = !createCompany && !createContact && !createDeal
  const noData = !companyName && !contactEmail

  // ── Success state
  if (phase === "done" && result) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-center gap-2 text-xs text-green-600">
          <Check className="h-3.5 w-3.5" />
          <span className="font-bold uppercase tracking-wider">
            Entities created in HubSpot
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {result.company && (
            <HubSpotEntityChip
              name={companyName || "Company"}
              objectType="companies"
              portalId={portalId}
              recordId={result.company.record_id}
              linked={!!portalId}
            />
          )}
          {result.contact && (
            <HubSpotEntityChip
              name={contactName || contactEmail || "Contact"}
              objectType="contacts"
              portalId={portalId}
              recordId={result.contact.record_id}
              linked={!!portalId}
            />
          )}
          {result.deal && (
            <HubSpotEntityChip
              name={`${companyName || "Deal"} -- Beton Signal`}
              objectType="deals"
              portalId={portalId}
              recordId={result.deal.record_id}
              linked={!!portalId}
            />
          )}
        </div>
      </div>
    )
  }

  // ── Main form
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
        <div className="h-4 w-4 rounded-sm bg-[#FF7A59] flex items-center justify-center">
          <span className="text-white text-[8px] font-bold">H</span>
        </div>
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Create in HubSpot
        </span>
        {existenceLoading && <Spinner className="size-3" />}
      </div>

      {noData ? (
        <p className="text-xs text-muted-foreground italic">
          Select a contact or enter company data to create HubSpot entities.
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
              exists={companyExists}
              portalId={portalId}
              objectType="companies"
              disabled={isCreating}
            />
          )}

          {/* Chain arrow */}
          {companyName && contactEmail && (
            <div className="flex items-center gap-1 pl-6 text-muted-foreground/40">
              <ArrowRight className="h-3 w-3" />
              <span className="text-[10px]">linked to</span>
            </div>
          )}

          {/* Contact row */}
          {contactEmail && (
            <EntityRow
              icon={<User className="h-3.5 w-3.5" />}
              label={contactName || contactEmail.split("@")[0]}
              sublabel={contactEmail}
              checked={createContact}
              onCheckedChange={setCreateContact}
              exists={contactExists}
              portalId={portalId}
              objectType="contacts"
              disabled={isCreating}
            />
          )}

          {/* Chain arrow */}
          {(companyName || contactEmail) && createDeal && (
            <div className="flex items-center gap-1 pl-6 text-muted-foreground/40">
              <ArrowRight className="h-3 w-3" />
              <span className="text-[10px]">creates</span>
            </div>
          )}

          {/* Deal row */}
          {(companyName || contactEmail) && (
            <EntityRow
              icon={<Handshake className="h-3.5 w-3.5" />}
              label={`${companyName || "New"} -- Beton Signal`}
              checked={createDeal}
              onCheckedChange={setCreateDeal}
              exists={null}
              portalId={portalId}
              objectType="deals"
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
                  : phase === "contact"
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
            {isCreating ? "Creating..." : "Create in HubSpot"}
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
  portalId,
  objectType,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  exists: { exists: boolean; recordId?: string } | null
  portalId?: string | number | null
  objectType: "companies" | "contacts" | "deals"
  disabled?: boolean
}) {
  const existsInHubSpot = exists?.exists === true

  const urlObjectType: Record<string, string> = {
    contacts: "contact",
    companies: "company",
    deals: "deal",
  }
  const pathType = urlObjectType[objectType] || objectType

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
      {existsInHubSpot ? (
        <a
          href={
            portalId && exists?.recordId
              ? `https://app.hubspot.com/contacts/${portalId}/${pathType}/${exists.recordId}`
              : undefined
          }
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
        >
          <Badge size="sm" className="bg-success/10 text-success border-success/20 gap-1">
            Exists
            {portalId && exists?.recordId && (
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
