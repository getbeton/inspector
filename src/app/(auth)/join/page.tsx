'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function JoinWorkspaceForm() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const workspaceId = searchParams.get('workspace')
  const domain = searchParams.get('domain')

  const [workspaceName, setWorkspaceName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Fetch workspace info on mount
  useEffect(() => {
    if (!workspaceId || !domain) {
      setFetchError('Missing workspace or domain information.')
      setLoading(false)
      return
    }

    fetch(`/api/workspace/join-by-domain?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(res => res.json())
      .then(data => {
        if (data.workspaceName) {
          setWorkspaceName(data.workspaceName)
        } else {
          setFetchError('Could not find the workspace.')
        }
      })
      .catch(() => {
        setFetchError('Failed to load workspace information.')
      })
      .finally(() => setLoading(false))
  }, [workspaceId, domain])

  const handleJoin = async () => {
    if (!workspaceId || !domain) return
    setJoining(true)
    setError(null)

    try {
      const res = await fetch('/api/workspace/join-by-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, domain }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to join workspace.')
        return
      }

      // Successfully joined — redirect to dashboard
      router.push('/?signup=true')
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  const handleCreateOwn = async () => {
    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/workspace/create-personal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create workspace.')
        return
      }

      // Successfully created — redirect to dashboard
      router.push('/?signup=true')
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Finding your team...</CardTitle>
          <CardDescription>
            Checking for a workspace matching your email domain
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-12 bg-muted animate-pulse rounded-md" />
        </CardContent>
      </Card>
    )
  }

  if (fetchError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>{fetchError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleCreateOwn}
            disabled={creating}
            className="w-full"
            size="lg"
          >
            {creating ? 'Creating...' : 'Create my own workspace'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Workspace initial for the avatar
  const initial = (workspaceName || 'W')[0].toUpperCase()

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>We found your team</CardTitle>
          <CardDescription>
            Your email domain <span className="font-medium text-foreground">@{domain}</span> matches an existing workspace
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Workspace display */}
          <div className="flex items-center gap-4 p-4 rounded-md border-2 border-foreground/10 bg-muted/50">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-foreground/20 text-lg font-bold"
              style={{ backgroundColor: '#4A90E2', color: 'white' }}
            >
              {initial}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-lg truncate">{workspaceName}</p>
              <p className="text-sm text-muted-foreground">@{domain}</p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Primary action: join */}
          <Button
            onClick={handleJoin}
            disabled={joining || creating}
            className="w-full"
            size="lg"
          >
            {joining ? 'Joining...' : `Join ${workspaceName}`}
          </Button>

          {/* Secondary action: create own */}
          <Button
            onClick={handleCreateOwn}
            disabled={joining || creating}
            variant="ghost"
            className="w-full"
            size="lg"
          >
            {creating ? 'Creating...' : 'Create my own workspace'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function JoinFormSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Finding your team...</CardTitle>
        <CardDescription>
          Checking for a workspace matching your email domain
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-12 bg-muted animate-pulse rounded-md" />
      </CardContent>
    </Card>
  )
}

export default function JoinPage() {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-2 mb-6">
        <h1 className="text-2xl font-bold">Beton Inspector</h1>
        <p className="text-muted-foreground">
          Signal Discovery & Validation Engine
        </p>
      </div>

      <Suspense fallback={<JoinFormSkeleton />}>
        <JoinWorkspaceForm />
      </Suspense>
    </div>
  )
}
