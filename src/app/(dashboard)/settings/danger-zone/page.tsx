'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/components/auth/session-provider'
import { GuestSignInPrompt } from '@/components/auth/GuestSignInPrompt'

export default function SettingsDangerZonePage() {
  const { session, loading } = useSession()
  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!session) return <GuestSignInPrompt message="Sign in to access workspace settings" />

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Irreversible actions that affect your workspace
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Workspace deletion is coming soon. Contact support if you need to delete your workspace immediately.
        </p>
      </CardContent>
    </Card>
  )
}
