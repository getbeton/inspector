'use client'

import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'beton_demo_mode'

/**
 * Manages demo mode state via localStorage.
 * Demo mode lets new users explore the app with mock data before connecting real integrations.
 */
export function useDemoMode() {
  const [isDemoMode, setIsDemoMode] = useState(false)

  // Read from localStorage on mount (client-only)
  useEffect(() => {
    try {
      setIsDemoMode(localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      // ignore localStorage errors
    }
  }, [])

  const enterDemoMode = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore
    }
    setIsDemoMode(true)
  }, [])

  const exitDemoMode = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setIsDemoMode(false)
  }, [])

  return { isDemoMode, enterDemoMode, exitDemoMode }
}
