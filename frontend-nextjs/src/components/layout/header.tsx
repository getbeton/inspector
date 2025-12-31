'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

interface HeaderProps {
  user: {
    email: string
    name?: string
    workspace_name?: string
  }
  className?: string
  onMenuClick?: () => void
}

export function Header({ user, className, onMenuClick }: HeaderProps) {
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch (e) {
      // Ignore errors
    }
    // Clear cookie and redirect
    document.cookie = 'beton_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
    router.push('/login')
  }

  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase()

  return (
    <header className={cn('h-16 bg-card border-b border-border flex items-center justify-between px-6', className)}>
      {/* Left side - Page title or breadcrumb */}
      <div className="flex items-center gap-4">
        {/* Mobile menu button - hidden on desktop */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div>
          <p className="text-sm text-muted-foreground">
            {user.workspace_name || 'Workspace'}
          </p>
        </div>
      </div>

      {/* Right side - User menu */}
      <div className="flex items-center gap-4">
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
