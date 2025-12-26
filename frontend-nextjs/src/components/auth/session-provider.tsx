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
      try {
        const response = await fetch('/api/session', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        })

        if (response.ok) {
          const data = await response.json()
          setSession(data)
        } else {
          setSession(null)
        }
      } catch (err) {
        console.error('Failed to fetch session:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch session')
      } finally {
        setLoading(false)
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
