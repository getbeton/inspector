'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSessionWebsiteResult, useUpdateWebsiteExploration } from '@/lib/hooks/use-explorations'
import type { WebsiteExplorationResult } from '@/lib/agent/types'

interface WebsiteExplorationTabProps {
  workspaceId: string | undefined
  sessionId: string
}

const PLG_OPTIONS = [
  { value: 'plg', label: 'Product-Led Growth' },
  { value: 'slg', label: 'Sales-Led Growth' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'not_applicable', label: 'N/A' },
]

interface EditableFields {
  is_b2b: boolean
  plg_type: string
  website_url: string
  product_description: string
  icp_description: string
  product_assumptions: string[]
  pricing_model: string
}

function toEditableFields(data: WebsiteExplorationResult | null): EditableFields {
  return {
    is_b2b: data?.is_b2b ?? true,
    plg_type: data?.plg_type || 'plg',
    website_url: data?.website_url || '',
    product_description: data?.product_description || '',
    icp_description: data?.icp_description || '',
    product_assumptions: data?.product_assumptions || [],
    pricing_model: data?.pricing_model ? JSON.stringify(data.pricing_model, null, 2) : '',
  }
}

export function WebsiteExplorationTab({ workspaceId, sessionId }: WebsiteExplorationTabProps) {
  const { data: websiteData, isLoading } = useSessionWebsiteResult(workspaceId, sessionId)
  const updateMutation = useUpdateWebsiteExploration(workspaceId ?? '', sessionId)

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<EditableFields>(() => toEditableFields(null))
  const [newAssumption, setNewAssumption] = useState('')

  useEffect(() => {
    if (websiteData) {
      setDraft(toEditableFields(websiteData))
    }
  }, [websiteData])

  const handleSave = async () => {
    let pricingModel: Record<string, any> | null = null
    try {
      if (draft.pricing_model) {
        pricingModel = JSON.parse(draft.pricing_model)
      }
    } catch {
      // keep as null if invalid JSON
    }

    await updateMutation.mutateAsync({
      is_b2b: draft.is_b2b,
      plg_type: draft.plg_type as WebsiteExplorationResult['plg_type'],
      website_url: draft.website_url || null,
      product_description: draft.product_description || null,
      icp_description: draft.icp_description || null,
      product_assumptions: draft.product_assumptions.length > 0 ? draft.product_assumptions : null,
      pricing_model: pricingModel,
    } as Partial<WebsiteExplorationResult>)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setDraft(toEditableFields(websiteData ?? null))
    setIsEditing(false)
  }

  const addAssumption = () => {
    if (newAssumption.trim()) {
      setDraft(prev => ({
        ...prev,
        product_assumptions: [...prev.product_assumptions, newAssumption.trim()],
      }))
      setNewAssumption('')
    }
  }

  const removeAssumption = (index: number) => {
    setDraft(prev => ({
      ...prev,
      product_assumptions: prev.product_assumptions.filter((_, i) => i !== index),
    }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!websiteData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No website exploration data for this session.
      </div>
    )
  }

  // View mode
  if (!isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Business Type</h4>
            <div className="flex gap-2">
              <Badge variant={websiteData.is_b2b ? 'default' : 'secondary'}>
                {websiteData.is_b2b ? 'B2B' : 'B2C'}
              </Badge>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Growth Model</h4>
            <Badge variant="outline">
              {PLG_OPTIONS.find(o => o.value === websiteData.plg_type)?.label || websiteData.plg_type || '—'}
            </Badge>
          </div>
        </div>

        {websiteData.website_url && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Website</h4>
            <a
              href={websiteData.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              {websiteData.website_url}
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Product Description</h4>
          <p className="text-sm">{websiteData.product_description || '—'}</p>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">ICP Description</h4>
          <p className="text-sm">{websiteData.icp_description || '—'}</p>
        </div>

        {websiteData.product_assumptions && websiteData.product_assumptions.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Product Assumptions</h4>
            <div className="flex flex-wrap gap-1.5">
              {websiteData.product_assumptions.map((a, i) => (
                <Badge key={i} variant="outline">{a}</Badge>
              ))}
            </div>
          </div>
        )}

        {websiteData.pricing_model && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Pricing Model</h4>
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
              {JSON.stringify(websiteData.pricing_model, null, 2)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  // Edit mode
  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1 block">Business Type</label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_b2b}
              onChange={(e) => setDraft(prev => ({ ...prev, is_b2b: e.target.checked }))}
              className="rounded border-input"
            />
            B2B
          </label>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1 block">Growth Model</label>
          <select
            value={draft.plg_type}
            onChange={(e) => setDraft(prev => ({ ...prev, plg_type: e.target.value }))}
            className="h-8 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            {PLG_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground mb-1 block">Website URL</label>
        <Input
          value={draft.website_url}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setDraft(prev => ({ ...prev, website_url: e.target.value }))
          }
          placeholder="https://example.com"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground mb-1 block">Product Description</label>
        <textarea
          value={draft.product_description}
          onChange={(e) => setDraft(prev => ({ ...prev, product_description: e.target.value }))}
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs/5"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground mb-1 block">ICP Description</label>
        <textarea
          value={draft.icp_description}
          onChange={(e) => setDraft(prev => ({ ...prev, icp_description: e.target.value }))}
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs/5"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground mb-1 block">Product Assumptions</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {draft.product_assumptions.map((a, i) => (
            <Badge key={i} variant="outline" className="gap-1">
              {a}
              <button
                onClick={() => removeAssumption(i)}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newAssumption}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAssumption(e.target.value)}
            placeholder="Add assumption"
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter') { e.preventDefault(); addAssumption() }
            }}
          />
          <Button variant="outline" size="sm" onClick={addAssumption}>Add</Button>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground mb-1 block">Pricing Model (JSON)</label>
        <textarea
          value={draft.pricing_model}
          onChange={(e) => setDraft(prev => ({ ...prev, pricing_model: e.target.value }))}
          rows={4}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono shadow-xs/5"
          placeholder='{"model": "freemium", "tiers": [...]}'
        />
      </div>
    </div>
  )
}
