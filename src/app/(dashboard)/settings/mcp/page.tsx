'use client'

import { Suspense, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils/cn'
import { Spinner } from '@/components/ui/spinner'
import SetupTab from './tabs/setup-tab'
import MethodsTab from './tabs/methods-tab'

// ---------------------------------------------------------------------------
// Dynamic imports for data-heavy tabs (code-split from initial bundle)
// ---------------------------------------------------------------------------

function TabSkeleton() {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner className="size-5" />
    </div>
  )
}

const SessionsTab = dynamic(() => import('./tabs/sessions-tab'), {
  loading: () => <TabSkeleton />,
})
const LogsTab = dynamic(() => import('./tabs/logs-tab'), {
  loading: () => <TabSkeleton />,
})

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'setup', label: 'Setup' },
  { id: 'methods', label: 'Methods' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'logs', label: 'Logs' },
] as const

type TabId = (typeof TABS)[number]['id']

function isValidTab(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value)
}

// ---------------------------------------------------------------------------
// Suspense boundary (useSearchParams requires this)
// ---------------------------------------------------------------------------

export default function McpSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <Spinner className="size-6" />
        </div>
      }
    >
      <McpSettingsContent />
    </Suspense>
  )
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function McpSettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabListRef = useRef<HTMLDivElement>(null)

  const rawTab = searchParams.get('tab')
  const activeTab: TabId = isValidTab(rawTab) ? rawTab : 'setup'

  const setTab = useCallback(
    (tab: TabId) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', tab)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  // Arrow key navigation between tabs (WAI-ARIA Tabs pattern)
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = TABS.findIndex((t) => t.id === activeTab)
      let nextIndex: number | null = null

      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % TABS.length
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
      } else if (e.key === 'Home') {
        nextIndex = 0
      } else if (e.key === 'End') {
        nextIndex = TABS.length - 1
      }

      if (nextIndex !== null) {
        e.preventDefault()
        const nextTab = TABS[nextIndex]
        setTab(nextTab.id)
        // Move focus to the new tab button
        const tabList = tabListRef.current
        if (tabList) {
          const buttons = tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]')
          buttons[nextIndex]?.focus()
        }
      }
    },
    [activeTab, setTab],
  )

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="MCP settings tabs"
        className="flex gap-1 border-b border-border pb-px"
        onKeyDown={handleTabKeyDown}
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(tab.id)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab panels */}
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <div
            key={tab.id}
            id={`tabpanel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab.id}`}
            hidden={!isActive}
            tabIndex={0}
          >
            {isActive && <TabContent tabId={tab.id} />}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab content router
// ---------------------------------------------------------------------------

function TabContent({ tabId }: { tabId: TabId }) {
  switch (tabId) {
    case 'setup':
      return <SetupTab />
    case 'methods':
      return <MethodsTab />
    case 'sessions':
      return <SessionsTab />
    case 'logs':
      return <LogsTab />
  }
}
