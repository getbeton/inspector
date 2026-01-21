'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { DashboardThresholdBanner, AccessBlockedOverlay } from '@/components/billing'

interface DashboardLayoutProps {
  children: React.ReactNode
  user: {
    email: string
    name?: string
    workspace_name?: string
  }
}

export function DashboardLayout({ children, user }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - always visible on desktop, slide-in on mobile */}
      <Sidebar
        className={`
          fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Threshold warning banner (sticky) */}
        <DashboardThresholdBanner />

        <Header user={user} onMenuClick={() => setSidebarOpen(true)} />

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>

      {/* Access blocked overlay (when threshold exceeded without payment method) */}
      <AccessBlockedOverlay />
    </div>
  )
}
