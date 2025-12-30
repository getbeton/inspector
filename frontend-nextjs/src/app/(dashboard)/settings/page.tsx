import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure integrations and preferences
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>
              Connect your data sources and destinations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                  <span className="text-lg">P</span>
                </div>
                <div>
                  <p className="font-medium">PostHog</p>
                  <p className="text-sm text-muted-foreground">Product analytics</p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">Coming soon</span>
            </div>

            <div className="flex items-center justify-between p-4 border border-border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                  <span className="text-lg">A</span>
                </div>
                <div>
                  <p className="font-medium">Attio</p>
                  <p className="text-sm text-muted-foreground">CRM integration</p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">Coming soon</span>
            </div>

            <div className="flex items-center justify-between p-4 border border-border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                  <span className="text-lg">S</span>
                </div>
                <div>
                  <p className="font-medium">Slack</p>
                  <p className="text-sm text-muted-foreground">Notifications</p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">Coming soon</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>
              Manage your workspace settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Workspace configuration will be available in a future update.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
