'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function SettingsApiKeysPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
        <CardDescription>
          Manage API keys for programmatic access to Beton Inspector
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium text-sm">Production Key</p>
              <p className="text-xs text-muted-foreground font-mono">beton_prod_••••••••••••</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Active</Badge>
              <Button variant="outline" size="sm">Regenerate</Button>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium text-sm">Development Key</p>
              <p className="text-xs text-muted-foreground font-mono">beton_dev_••••••••••••</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Active</Badge>
              <Button variant="outline" size="sm">Regenerate</Button>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Button variant="outline">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Key
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
