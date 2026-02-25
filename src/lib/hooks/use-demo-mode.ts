'use client'

import { useState, useCallback } from 'react'

const STORAGE_KEY = 'beton_demo_mode'

/**
 * Manages demo mode state via localStorage.
 * Demo mode lets new users explore the app with mock data before connecting real integrations.
 */
export function useDemoMode() {
  const [isDemoMode, setIsDemoMode] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

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
