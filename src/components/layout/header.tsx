'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { resetIdentity } from '@/lib/analytics'
import { useAllSyncStatuses, useTriggerSync } from '@/lib/hooks/use-sync-status'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'

interface HeaderProps {
  user: {
    email: string
    name?: string
    workspace_name?: string
  }
  className?: string
  onMenuClick?: () => void
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
}

/**
 * Quick action buttons in header — Sync Data + Add Signal.
 * Only visible when setup is complete. Hidden on mobile.
 */
function HeaderQuickActions() {
  const { data: setupStatus } = useSetupStatus()
  const triggerSync = useTriggerSync()

  if (!setupStatus?.setupComplete) return null

  return (
    <div className="hidden sm:flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => triggerSync.mutate({ syncType: 'posthog_events' })}
        disabled={triggerSync.isPending}
        className="gap-1.5"
      >
        <svg
          className={cn('w-3.5 h-3.5', triggerSync.isPending && 'animate-spin')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {triggerSync.isPending ? 'Syncing...' : 'Sync Data'}
      </Button>
      <Link href="/signals/new">
        <Button size="sm" className="gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Signal
        </Button>
      </Link>
    </div>
  )
}

/**
 * Sync health indicator — green if all syncs are recent, yellow if stale (>24h), red if any failed.
 */
function SyncHealthDot() {
  const { data: statuses } = useAllSyncStatuses()

  if (!statuses || statuses.length === 0) return null

  const now = Date.now()
  const hasFailure = statuses.some(s => s.status === 'failed')
  const hasStale = statuses.some(s => {
    const lastTime = s.completed_at || s.started_at
    if (!lastTime) return true
    return now - new Date(lastTime).getTime() > 24 * 60 * 60 * 1000
  })

  const color = hasFailure ? 'bg-destructive' : hasStale ? 'bg-warning' : 'bg-success'
  const label = hasFailure ? 'Sync error' : hasStale ? 'Sync stale' : 'Syncs healthy'

  return (
    <Link
      href="/settings/sync"
      className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
      title={label}
    >
      <div className="relative">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span className={cn('absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card', color)} />
      </div>
    </Link>
  )
}

export function Header({ user, className, onMenuClick, onToggleSidebar, sidebarCollapsed }: HeaderProps) {
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)

      // Reset PostHog identity BEFORE clearing session
      // This ensures the user is properly disassociated in analytics
      resetIdentity()

      // Clear login tracking from sessionStorage
      Object.keys(sessionStorage)
        .filter(key => key.startsWith('login_tracked_'))
        .forEach(key => sessionStorage.removeItem(key))

      // Call the Next.js logout API route (relative URL)
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        // Redirect to login page
        window.location.href = data.redirect || '/login'
      } else {
        // Fallback: redirect anyway
        window.location.href = '/login'
      }
    } catch (e) {
      console.error('Logout error:', e)
      // Fallback: redirect to login
      window.location.href = '/login'
    }
  }

  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase()

  return (
    <header className={cn('h-16 bg-card border-b border-border flex items-center justify-between px-6', className)}>
      {/* Left side - Page title or breadcrumb */}
      <div className="flex items-center gap-4">
        {/* Sidebar toggle button - works on both mobile and desktop */}
        <button
          onClick={() => {
            if (window.matchMedia('(min-width: 1024px)').matches) {
              onToggleSidebar?.()
            } else {
              onMenuClick?.()
            }
          }}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
          </svg>
        </button>
        <div>
          <p className="text-sm text-muted-foreground">
            {user.workspace_name || 'Workspace'}
          </p>
        </div>
      </div>

      {/* Right side - User menu */}
      <div className="flex items-center gap-2">
        {/* Quick actions — only visible post-setup, hidden on mobile */}
        <HeaderQuickActions />

        {/* Sync health indicator */}
        <SyncHealthDot />

        {/* Notifications placeholder */}
        <button className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 p-1.5 rounded-md hover:bg-muted transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium">{user.name || user.email.split('@')[0]}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-md shadow-lg z-20">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-medium">{user.name || 'User'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false)
                      router.push('/settings')
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full px-4 py-2 text-left text-sm text-destructive hover:bg-muted transition-colors"
                  >
                    {isLoggingOut ? 'Logging out...' : 'Log out'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
