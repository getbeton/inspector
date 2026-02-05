'use client'

import { Badge } from '@/components/ui/badge'
import { useSessionWebsiteResult } from '@/lib/hooks/use-explorations'

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

export function WebsiteExplorationTab({ workspaceId, sessionId }: WebsiteExplorationTabProps) {
  const { data: websiteData, isLoading } = useSessionWebsiteResult(workspaceId, sessionId)

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

  return (
    <div className="space-y-6">
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
