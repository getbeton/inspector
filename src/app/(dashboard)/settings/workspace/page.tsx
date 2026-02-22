'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/components/auth/session-provider'
import { GuestSignInPrompt } from '@/components/auth/GuestSignInPrompt'

export default function SettingsWorkspacePage() {
  const { session, loading } = useSession()
  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!session) return <GuestSignInPrompt message="Sign in to manage workspace settings" />

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
        <CardDescription>
          Manage your workspace settings and team members
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Workspace management is coming soon. You&apos;ll be able to rename your workspace, manage members, and configure default settings.
        </p>
      </CardContent>
    </Card>
  )
}
