'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { BillingStatusCard } from '@/components/billing'
import { RefreshButton } from '@/components/ui/refresh-button'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useDashboardMetrics } from '@/lib/hooks/use-dashboard-metrics'

interface WorkspaceSummaryProps {
  className?: string
}

function formatTimeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

/**
 * Post-setup dashboard shown to users who have completed onboarding.
 * Shows integration status, signal metrics, recent signals, and billing.
 */
export function WorkspaceSummary({ className }: WorkspaceSummaryProps) {
  const { data: setupStatus } = useSetupStatus()
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics()

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">
            Your workspace overview
          </p>
        </div>
        <RefreshButton syncType="posthog_events" />
      </div>

      {/* Integration Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">PostHog</span>
              {setupStatus?.integrations.posthog ? (
                <Badge className="bg-success/10 text-success border-success/20">Connected</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Not Connected</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Product analytics</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Attio</span>
              {setupStatus?.integrations.attio ? (
                <Badge className="bg-success/10 text-success border-success/20">Connected</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Not Connected</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">CRM integration</p>
          </CardContent>
        </Card>
      </div>

      {/* Signal Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {metricsLoading ? (
          <Card className="col-span-full">
            <CardContent className="flex items-center justify-center py-8">
              <Spinner className="size-6" />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{metrics?.totalSignals ?? 0}</div>
                <p className="text-sm text-muted-foreground">Total Signals</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{metrics?.activeSignals ?? 0}</div>
                <p className="text-sm text-muted-foreground">Active</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{metrics?.totalAccounts ?? 0}</div>
                <p className="text-sm text-muted-foreground">Accounts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{metrics?.avgLift ? `${metrics.avgLift.toFixed(1)}x` : '—'}</div>
                <p className="text-sm text-muted-foreground">Avg Lift</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Recent Signals */}
      {metrics?.recentSignals && metrics.recentSignals.length > 0 && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Recent Signals</h3>
              <Link href="/signals" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Signal</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Account</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Source</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">When</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.recentSignals.map((signal) => (
                    <tr key={signal.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{signal.type}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]">
                        {signal.accountName || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {signal.source === 'manual' ? 'User' : 'Auto'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        {formatTimeAgo(signal.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing (compact) */}
      <div className="mb-6">
        <BillingStatusCard compact />
      </div>
    </div>
  )
}
