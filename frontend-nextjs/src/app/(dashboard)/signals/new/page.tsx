import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AddSignalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add Signal</h1>
        <p className="text-muted-foreground">
          Create a new signal to track
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>
            The add signal form will be implemented in a future commit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This page will allow you to configure new signals with custom
            HogQL queries, thresholds, and alert settings.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
