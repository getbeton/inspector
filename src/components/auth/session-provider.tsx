'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import type { SessionUser } from '@/lib/auth/session'

interface SessionContextType {
  session: SessionUser | null
  loading: boolean
  error: string | null
}

const SessionContext = createContext<SessionContextType | undefined>(undefined)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSession = async () => {
      console.log('[SessionProvider] Fetching session from /api/session...')
      try {
        const response = await fetch('/api/session', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        })

        console.log('[SessionProvider] Response status:', response.status)

        if (response.ok) {
          const data = await response.json()
          console.log('[SessionProvider] Session data received:', {
            hasData: !!data,
            sub: data?.sub,
            email: data?.email,
            workspace_id: data?.workspace_id
          })
          setSession(data)
        } else {
          console.log('[SessionProvider] Response not OK, setting session to null')
          setSession(null)
        }
      } catch (err) {
        console.error('[SessionProvider] Failed to fetch session:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch session')
      } finally {
        setLoading(false)
        console.log('[SessionProvider] Loading complete')
      }
    }

    fetchSession()
  }, [])

  return (
    <SessionContext.Provider value={{ session, loading, error }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const context = useContext(SessionContext)

  if (context === undefined) {
    throw new Error('useSession must be used within SessionProvider')
  }

  return context
}
