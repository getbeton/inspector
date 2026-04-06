'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface InviteInfo {
  workspaceName: string
  inviterEmail: string
  role: string
  expiresAt: string
}

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params.token

  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        // Check auth status and fetch invite info in parallel
        const [authRes, infoRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch(`/api/workspace/invites/${token}/info`),
        ])

        setIsAuthenticated(authRes.ok)

        if (!infoRes.ok) {
          const data = await infoRes.json()
          setError(data.error || 'This invite is no longer valid')
          return
        }

        setInfo(await infoRes.json())
      } catch {
        setError('Failed to load invite details')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleAccept() {
    setAccepting(true)
    setError(null)
    try {
      const res = await fetch('/api/workspace/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to accept invite')
        return
      }

      router.push('/')
    } catch {
      setError('Something went wrong')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading invite...</div>
      </div>
    )
  }

  if (error && !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-4 p-8 rounded-lg border bg-card text-center">
          <div className="text-4xl mb-4">😕</div>
          <h1 className="text-xl font-semibold mb-2">Invite Not Found</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <a
            href="/login"
            className="inline-block px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: '#4A90E2' }}
          >
            Go to Login
          </a>
        </div>
      </div>
    )
  }

  if (!info) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4 p-8 rounded-lg border bg-card">
        {/* Workspace avatar */}
        <div className="flex justify-center mb-6">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-2xl font-bold"
            style={{ backgroundColor: '#4A90E2' }}
          >
            {info.workspaceName.charAt(0).toUpperCase()}
          </div>
        </div>

        <h1 className="text-xl font-semibold text-center mb-2">
          Join {info.workspaceName}
        </h1>

        <p className="text-muted-foreground text-center text-sm mb-6">
          {info.inviterEmail} invited you to join as {info.role === 'admin' ? 'an admin' : 'a member'}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm border border-red-200">
            {error}
          </div>
        )}

        {isAuthenticated ? (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full py-2.5 px-4 rounded-md text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#4A90E2' }}
          >
            {accepting ? 'Joining...' : `Join ${info.workspaceName}`}
          </button>
        ) : (
          <a
            href={`/login?next=/invite/${token}`}
            className="block w-full py-2.5 px-4 rounded-md text-sm font-medium text-white text-center transition-opacity"
            style={{ backgroundColor: '#4A90E2' }}
          >
            Sign in to accept invite
          </a>
        )}

        <p className="text-xs text-muted-foreground text-center mt-4">
          Expires {new Date(info.expiresAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}
