import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function IdentitiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Identities</h1>
        <p className="text-muted-foreground">
          Manage account and user identity resolution
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>
            The identities page will be implemented in a future commit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This page will help you manage how users and accounts are
            identified and linked across different data sources.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
