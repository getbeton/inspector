'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { resetIdentity } from '@/lib/analytics'

interface HeaderProps {
  user: {
    email: string
    name?: string
    workspace_name?: string
  } | null
  className?: string
  onMenuClick?: () => void
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
}

export function Header({ user, className, onMenuClick, onToggleSidebar, sidebarCollapsed }: HeaderProps) {
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)

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

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true)
      const { signInWithGoogle } = await import('@/lib/auth/supabase')
      await signInWithGoogle()
    } catch (e) {
      console.error('Sign-in error:', e)
      setIsSigningIn(false)
    }
  }

  const initials = user
    ? (user.name
      ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      : user.email[0].toUpperCase())
    : null

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
            {user ? (user.workspace_name || 'Workspace') : 'Beton Inspector'}
          </p>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {user ? (
          <>
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
          </>
        ) : (
          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        )}
      </div>
    </header>
  )
}
