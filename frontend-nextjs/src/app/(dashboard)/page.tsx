import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardHomePage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to Beton Inspector - your signal discovery and validation engine.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Signals</CardDescription>
            <CardTitle className="text-3xl">--</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Signals currently being tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Accounts Tracked</CardDescription>
            <CardTitle className="text-3xl">--</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Total accounts with signals
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Signals Today</CardDescription>
            <CardTitle className="text-3xl">--</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              New signals detected today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Win Rate</CardDescription>
            <CardTitle className="text-3xl">--%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Signals that converted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Signals</CardTitle>
            <CardDescription>
              View and manage your product signals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href="/signals"
              className="inline-flex items-center justify-center w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              View Signals
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Playbooks</CardTitle>
            <CardDescription>
              Automated workflows for your signals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href="/playbooks"
              className="inline-flex items-center justify-center w-full px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              View Playbooks
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Configure integrations and preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href="/settings"
              className="inline-flex items-center justify-center w-full px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              Settings
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
