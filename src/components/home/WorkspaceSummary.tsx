'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { BillingStatusCard } from '@/components/billing'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'
import { useDashboardMetrics } from '@/lib/hooks/use-dashboard-metrics'

interface WorkspaceSummaryProps {
  className?: string
}

/**
 * Post-setup dashboard shown to users who have completed onboarding.
 * Shows integration status, signal metrics, and quick actions.
 */
export function WorkspaceSummary({ className }: WorkspaceSummaryProps) {
  const { data: setupStatus } = useSetupStatus()
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics()

  return (
    <div className={className}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-muted-foreground">
          Your workspace overview
        </p>
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

      {/* Billing (compact) */}
      <div className="mb-6">
        <BillingStatusCard compact />
      </div>

      {/* Quick Actions */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-medium mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Link href="/signals">
              <Button variant="outline" size="sm">View Signals</Button>
            </Link>
            <Link href="/identities">
              <Button variant="outline" size="sm">View Identities</Button>
            </Link>
            <Link href="/settings">
              <Button variant="outline" size="sm">Manage Integrations</Button>
            </Link>
            <Link href="/signals/new">
              <Button size="sm">Add Signal</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
