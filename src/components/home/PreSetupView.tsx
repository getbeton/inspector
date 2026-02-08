'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'
import { trackDemoTourStarted, trackSetupStarted } from '@/lib/analytics'

interface PreSetupViewProps {
  className?: string
}

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
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-primary font-bold text-2xl">B</span>
        </div>
        <h2 className="text-2xl font-bold mb-2">Welcome to Beton Inspector</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Detect high-intent product signals and route them to your CRM.
          Get started by connecting your data or exploring with demo data.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <Card className="hover:ring-1 hover:ring-primary/50 transition-all cursor-pointer" onClick={handleDemoTour}>
          <CardContent className="pt-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold">Take a Demo Tour</h3>
            <p className="text-sm text-muted-foreground">
              Explore signals, identities, and dashboards with sample data. No setup required.
            </p>
            <Button variant="outline" className="w-full">
              Explore Demo
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:ring-1 hover:ring-primary/50 transition-all cursor-pointer" onClick={handleConnectData}>
          <CardContent className="pt-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h3 className="font-semibold">Connect Your Data</h3>
            <p className="text-sm text-muted-foreground">
              Link PostHog and Attio to start detecting real product signals.
            </p>
            <Button className="w-full">
              Get Started
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
