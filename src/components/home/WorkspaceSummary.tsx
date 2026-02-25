'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { BillingStatusCard } from '@/components/billing'
import { RefreshButton } from '@/components/ui/refresh-button'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useDashboardMetrics } from '@/lib/hooks/use-dashboard-metrics'
import { useMcpSessions } from '@/lib/hooks/use-mcp-sessions'

interface WorkspaceSummaryProps {
  className?: string
}

const INTERNAL_AGENTS = ['upsell_agent']

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
 * Two-column hero (signals + integrations), recent signals, and billing.
 */
export function WorkspaceSummary({ className }: WorkspaceSummaryProps) {
  const { data: setupStatus } = useSetupStatus()
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics()
  const { data: mcpSessions } = useMcpSessions()

  const externalSessionCount = mcpSessions?.filter(
    (s) => !INTERNAL_AGENTS.includes(s.agent_app_name)
  ).length ?? 0

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

      {/* Two-column hero */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Signals card */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Signals</h3>
            {metricsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner className="size-5" />
              </div>
            ) : (
              <div className="space-y-2">
                <MetricRow label="Total Signals" value={metrics?.totalSignals ?? 0} />
                <MetricRow label="Active" value={metrics?.activeSignals ?? 0} />
                <MetricRow label="Accounts" value={metrics?.totalAccounts ?? 0} />
                <MetricRow label="Avg Lift" value={metrics?.avgLift ? `${metrics.avgLift.toFixed(1)}x` : '—'} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Integrations card */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Integrations</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">PostHog</span>
                {setupStatus?.integrations.posthog ? (
                  <Badge className="bg-success/10 text-success border-success/20">Connected</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Not Connected</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Attio</span>
                {setupStatus?.integrations.attio ? (
                  <Badge className="bg-success/10 text-success border-success/20">Connected</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Not Connected</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">MCP</span>
                <Badge variant="outline">
                  {externalSessionCount} {externalSessionCount === 1 ? 'session' : 'sessions'}
                </Badge>
              </div>
            </div>
            <div className="pt-1">
              <Link
                href="/settings"
                className="text-xs text-primary hover:underline"
              >
                Manage integrations
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Signals — always shown */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">Recent Signals</h3>
            <Link href="/signals" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          {metricsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Spinner className="size-5" />
            </div>
          ) : metrics?.recentSignals && metrics.recentSignals.length > 0 ? (
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
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No signals yet. Signals will appear here once detection runs.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing (compact) */}
      <div className="mb-6">
        <BillingStatusCard compact />
      </div>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-bold">{value}</span>
    </div>
  )
}
