'use client'

import { BillingStatusCard } from '@/components/billing'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useBillingStatus, useCreatePortalSession } from '@/lib/hooks/use-billing'
import { Spinner } from '@/components/ui/spinner'
import { MessageCircle } from 'lucide-react'
import { RefreshButton } from '@/components/ui/refresh-button'
import { useSession } from '@/components/auth/session-provider'
import { GuestSignInPrompt } from '@/components/auth/GuestSignInPrompt'

declare global {
  interface Window {
    Intercom?: (...args: unknown[]) => void
  }
}

export default function SettingsBillingPage() {
  const { session, loading } = useSession()
  const { data: billingStatus, isLoading } = useBillingStatus()
  const portalSession = useCreatePortalSession()

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Spinner className="size-6" /></div>
  if (!session) return <GuestSignInPrompt message="Sign in to manage billing" />

  const handleRefund = () => {
    if (typeof window !== 'undefined' && typeof window.Intercom === 'function') {
      window.Intercom(
        'showNewMessage',
        `I would like to request a refund for my workspace.`
      )
    } else {
      // Fallback: open Stripe billing portal
      portalSession.mutate()
    }
  }

  // Only show refund section if billing is loaded and active
  const showRefund = !isLoading && billingStatus && billingStatus.status !== 'free'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Billing</h2>
          <p className="text-sm text-muted-foreground">Manage your subscription and usage</p>
        </div>
        <RefreshButton syncType="mtu_tracking" />
      </div>
      <BillingStatusCard />

      {showRefund && (
        <Card>
          <CardHeader>
            <CardTitle>Support</CardTitle>
            <CardDescription>
              Need help with billing or want to request a refund?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={handleRefund}
              disabled={portalSession.isPending}
            >
              {portalSession.isPending ? (
                <Spinner className="size-4" />
              ) : (
                <MessageCircle className="size-4" />
              )}
              Request Refund
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
