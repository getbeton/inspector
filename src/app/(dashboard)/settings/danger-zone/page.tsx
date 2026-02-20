'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { toastManager } from '@/components/ui/toast'
import { useSession } from '@/components/auth/session-provider'
import { GuestSignInPrompt } from '@/components/auth/GuestSignInPrompt'

export default function SettingsDangerZonePage() {
  const { session, loading } = useSession()
  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!session) return <GuestSignInPrompt message="Sign in to access workspace settings" />
  const handleDeleteWorkspace = () => {
    // TODO: Call API to delete workspace
    toastManager.add({ type: 'success', title: 'Workspace deletion requested' })
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Irreversible actions that affect your workspace
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Delete Workspace</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete this workspace and all associated data
            </p>
          </div>
          <Dialog>
            <DialogTrigger render={<Button variant="destructive">Delete Workspace</Button>} />
            <DialogPopup>
              <DialogHeader>
                <DialogTitle>Delete Workspace?</DialogTitle>
                <DialogDescription>
                  This action is irreversible. All data, integrations, signals, and workspace
                  members will be permanently deleted.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline">Cancel</Button>} />
                <DialogClose
                  render={
                    <Button variant="destructive" onClick={handleDeleteWorkspace}>
                      Yes, delete workspace
                    </Button>
                  }
                />
              </DialogFooter>
            </DialogPopup>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}
