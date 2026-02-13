'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'
import { trackDemoTourStarted, trackSetupStarted } from '@/lib/analytics'

interface PreSetupViewProps {
  className?: string
}

const STEPS = [
  {
    number: '1',
    title: 'Connect Analytics',
    description: 'Link your PostHog project to import product usage events automatically.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    number: '2',
    title: 'Define Signals',
    description: 'Create rules that detect high-intent product behaviors and score accounts.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    number: '3',
    title: 'Route to CRM',
    description: 'Push qualified leads and account scores directly into Attio for your sales team.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    ),
  },
]

/**
 * Pre-setup landing for new users who haven't connected any integrations yet.
 * Offers two paths: take a demo tour (mock data) or connect real data (setup wizard).
 */
export function PreSetupView({ className }: PreSetupViewProps) {
  const router = useRouter()
  const { enterDemoMode } = useDemoMode()

  const handleDemoTour = () => {
    trackDemoTourStarted()
    enterDemoMode()
    router.push('/signals')
  }

  const handleConnectData = () => {
    trackSetupStarted()
    router.push('/setup')
  }

  return (
    <div className={className}>
      {/* Hero Section */}
      <div className="relative rounded-2xl bg-gradient-to-br from-primary/5 via-background to-primary/10 border border-border p-8 md:p-12 mb-8">
        <div className="text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <span className="text-primary font-bold text-2xl">B</span>
          </div>
          <h2 className="text-3xl font-bold mb-3">Welcome to Beton Inspector</h2>
          <p className="text-muted-foreground text-lg mb-8">
            Detect high-intent product signals and route them to your CRM.
            Turn product usage into pipeline, automatically.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button size="lg" onClick={handleConnectData}>
              Get Started
            </Button>
            <Button size="lg" variant="outline" onClick={handleDemoTour}>
              Explore Demo
            </Button>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 text-center">How it works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((step) => (
            <Card key={step.number}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                    {step.number}
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                    {step.icon}
                  </div>
                </div>
                <h4 className="font-semibold">{step.title}</h4>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
