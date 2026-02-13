'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function SettingsWorkspacePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
        <CardDescription>
          Manage your workspace settings and team members
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Workspace Name</label>
            <Input defaultValue="My Workspace" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Workspace Slug</label>
            <Input defaultValue="my-workspace" disabled className="bg-muted" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Default Timezone</label>
          <select className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm">
            <option value="UTC">UTC</option>
            <option value="America/New_York">Eastern Time (ET)</option>
            <option value="America/Los_Angeles">Pacific Time (PT)</option>
            <option value="Europe/London">London (GMT)</option>
            <option value="Europe/Paris">Paris (CET)</option>
          </select>
        </div>
        <div className="pt-2">
          <Button>Save Changes</Button>
        </div>
      </CardContent>
    </Card>
  )
}
