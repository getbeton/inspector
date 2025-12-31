'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// Integration status type
interface IntegrationStatus {
  posthog: boolean
  attio: boolean
  slack: boolean
}

export default function DashboardHomePage() {
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    posthog: false,
    attio: false,
    slack: false,
  })
  const [isDemoMode, setIsDemoMode] = useState(true)

  const hasRequiredIntegrations = integrations.posthog && integrations.attio
  const setupProgress = [integrations.posthog, integrations.attio].filter(Boolean).length

  // New user landing (no integrations, demo mode)
  if (!hasRequiredIntegrations && isDemoMode) {
    return (
      <div className="space-y-8">
        {/* Welcome header */}
        <div className="text-center max-w-2xl mx-auto py-8">
          <h1 className="text-3xl font-bold mb-3">Welcome to Beton Inspector</h1>
          <p className="text-muted-foreground text-lg">
            Discover behavioral signals that predict customer conversion
          </p>
        </div>

        {/* Two-path choice */}
        <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
          <Card className="border-2 hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle>Ready to connect?</CardTitle>
              <CardDescription>
                Connect your PostHog and Attio to discover signals in your own data.
                See which user behaviors predict revenue outcomes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setIsDemoMode(false)}
                className="w-full"
              >
                Get Started
              </Button>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-muted transition-colors">
            <CardHeader>
              <CardTitle>Just exploring?</CardTitle>
              <CardDescription>
                Try the demo with sample data to see how Beton works.
                All features enabled, no setup required.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/signals"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
              >
                Try Demo
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Feature highlights */}
        <div className="pt-8">
          <h2 className="text-lg font-semibold text-center mb-6">What you can do</h2>
          <div className="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-medium mb-1">Discover Signals</h3>
              <p className="text-sm text-muted-foreground">
                Find behavioral patterns that predict conversion
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="font-medium mb-1">Validate with Backtests</h3>
              <p className="text-sm text-muted-foreground">
                Statistical proof with confidence intervals
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="font-medium mb-1">Automate Actions</h3>
              <p className="text-sm text-muted-foreground">
                Send signals to CRM, Slack, and more
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Demo mode active - quick access view
  if (isDemoMode) {
    return (
      <div className="space-y-6">
        {/* Demo mode banner */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-emerald-700 dark:text-emerald-400">Demo mode active</p>
              <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80">All features enabled with sample data</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDemoMode(false)}
            className="text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/10"
          >
            Use Real Data
          </Button>
        </div>

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Quick access to your signal discovery tools
          </p>
        </div>

        {/* Quick stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sample Signals</CardDescription>
              <CardTitle className="text-3xl">5</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Pre-discovered patterns</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Demo Accounts</CardDescription>
              <CardTitle className="text-3xl">150</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Sample customer data</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg Win Rate</CardDescription>
              <CardTitle className="text-3xl">34%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Demo signal accuracy</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Playbooks</CardDescription>
              <CardTitle className="text-3xl">3</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Sample automations</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick access cards */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Signals
              </CardTitle>
              <CardDescription>
                5 sample signals ready to explore
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/signals"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
              >
                View Signals
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Backtest
              </CardTitle>
              <CardDescription>
                Create and validate custom signals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/backtest"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
              >
                Open Backtest
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Playbooks
              </CardTitle>
              <CardDescription>
                Automation rules for signals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/playbooks"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
              >
                View Playbooks
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Setup mode - connect integrations
  return (
    <div className="space-y-6">
      {/* Header with demo toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Setup</h1>
          <p className="text-muted-foreground">
            Connect your data sources to start analyzing real signals
          </p>
        </div>
        <Button variant="outline" onClick={() => setIsDemoMode(true)}>
          Use Demo Instead
        </Button>
      </div>

      {/* Setup progress */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Setup Progress</CardTitle>
            <Badge variant={hasRequiredIntegrations ? 'default' : 'secondary'}>
              {setupProgress}/2 Required
            </Badge>
          </div>
          <CardDescription>
            PostHog + Attio are required to analyze your data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${(setupProgress / 2) * 100}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Integration cards */}
      <div className="grid gap-4">
        {/* PostHog */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <span className="text-xl font-bold text-blue-600">P</span>
                </div>
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    PostHog
                    <Badge variant="outline" className="text-xs">Required</Badge>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Product analytics - behavioral events and user properties
                  </p>
                </div>
              </div>
              {integrations.posthog ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500">Connected</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIntegrations(prev => ({ ...prev, posthog: false }))}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setIntegrations(prev => ({ ...prev, posthog: true }))}>
                  Connect
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Attio */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <span className="text-xl font-bold text-purple-600">A</span>
                </div>
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    Attio
                    <Badge variant="outline" className="text-xs">Required</Badge>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    CRM - customer data and deal outcomes
                  </p>
                </div>
              </div>
              {integrations.attio ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500">Connected</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIntegrations(prev => ({ ...prev, attio: false }))}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setIntegrations(prev => ({ ...prev, attio: true }))}>
                  Connect
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Slack */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <span className="text-xl font-bold text-amber-600">S</span>
                </div>
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    Slack
                    <Badge variant="outline" className="text-xs">Optional</Badge>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Notifications - get alerts when signals fire
                  </p>
                </div>
              </div>
              {integrations.slack ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500">Connected</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIntegrations(prev => ({ ...prev, slack: false }))}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setIntegrations(prev => ({ ...prev, slack: true }))}
                >
                  Connect
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Continue button */}
      {hasRequiredIntegrations && (
        <Card className="bg-emerald-500/10 border-emerald-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">Setup complete!</p>
                  <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80">You&apos;re ready to discover signals</p>
                </div>
              </div>
              <Link
                href="/signals"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                Continue to Signals
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
