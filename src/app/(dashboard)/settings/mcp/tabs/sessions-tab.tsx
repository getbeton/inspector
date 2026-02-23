'use client'

import { Card, CardContent } from '@/components/ui/card'

export default function SessionsTab() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Connected Sessions — coming soon.
        </p>
      </CardContent>
    </Card>
  )
}
