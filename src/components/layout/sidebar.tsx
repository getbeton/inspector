'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

// ---------------------------------------------------------------------------
// Navigation data types
// ---------------------------------------------------------------------------

interface NavLink {
  href: string
  label: string
  icon: React.ReactNode
}

interface NavSection {
  label: string
  icon: React.ReactNode
  basePath: string // used for active-state matching on the section header
  children: { href: string; label: string }[]
}

type NavEntry = NavLink | NavSection

function isSection(entry: NavEntry): entry is NavSection {
  return 'children' in entry
}

// ---------------------------------------------------------------------------
// Icon helpers (inline SVGs — kept small & co-located with nav data)
// ---------------------------------------------------------------------------

const icons = {
  home: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  signals: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  identities: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  memory: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  chevron: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  close: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
}

// ---------------------------------------------------------------------------
// Navigation structure
// ---------------------------------------------------------------------------

const navEntries: NavEntry[] = [
  { href: '/', label: 'Home', icon: icons.home },
  { href: '/signals', label: 'Signals', icon: icons.signals },
  { href: '/identities', label: 'Identities', icon: icons.identities },
  {
    label: 'Memory',
    icon: icons.memory,
    basePath: '/memory',
    children: [
      { href: '/memory', label: 'Logs' },
      { href: '/memory/assumptions', label: 'Business Model' },
      { href: '/memory/db-structure', label: 'DB & Joins' },
    ],
  },
  {
    label: 'Settings',
    icon: icons.settings,
    basePath: '/settings',
    children: [
      { href: '/settings', label: 'Integrations' },
      { href: '/settings/billing', label: 'Billing' },
      { href: '/settings/workspace', label: 'Workspace' },
      { href: '/settings/danger-zone', label: 'Danger Zone' },
    ],
  },
]

// ---------------------------------------------------------------------------
// localStorage helpers for expand/collapse persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'sidebar-sections'

function loadExpandedSections(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveExpandedSections(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore localStorage errors (e.g. private browsing quota)
  }
}

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

/** Returns section labels that should be auto-expanded based on pathname. */
function getAutoExpandedSections(pathname: string): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const entry of navEntries) {
    if (isSection(entry)) {
      const hasActiveChild = entry.children.some(
        (child) => pathname === child.href || pathname.startsWith(child.href + '/')
      )
      if (hasActiveChild) result[entry.label] = true
    }
  }
  return result
}

interface SidebarProps {
  className?: string
  onClose?: () => void
}

export function Sidebar({ className, onClose }: SidebarProps) {
  const pathname = usePathname()

  // Expanded sections state — initialised from localStorage + auto-expand for active route
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    ...loadExpandedSections(),
    ...getAutoExpandedSections(pathname),
  }))

  // Persist expanded state to localStorage whenever it changes
  useEffect(() => {
    saveExpandedSections(expanded)
  }, [expanded])

  // Auto-expand sections when navigating to a sub-item via URL
  useEffect(() => {
    setExpanded((prev) => {
      const autoExpanded = getAutoExpandedSections(pathname)
      let changed = false
      const next = { ...prev }
      for (const [label, shouldExpand] of Object.entries(autoExpanded)) {
        if (shouldExpand && !prev[label]) {
          next[label] = true
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [pathname])

  const toggleSection = useCallback((label: string) => {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }))
  }, [])

  const handleNavClick = useCallback(() => {
    // Close sidebar on mobile when navigating
    if (onClose) onClose()
  }, [onClose])

  return (
    <aside className={cn('w-64 bg-card border-r border-border flex flex-col', className)}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-border">
        <Link href="/" className="flex items-center gap-2" onClick={handleNavClick}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">B</span>
          </div>
          <span className="font-semibold text-lg">Beton</span>
        </Link>
        {/* Close button — visible only on mobile */}
        <button
          onClick={onClose}
          aria-label="Close sidebar"
          className="lg:hidden p-2 -mr-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
        >
          {icons.close}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navEntries.map((entry) =>
          isSection(entry) ? (
            <NavSectionItem
              key={entry.label}
              section={entry}
              pathname={pathname}
              isExpanded={!!expanded[entry.label]}
              onToggle={() => toggleSection(entry.label)}
              onNavClick={handleNavClick}
            />
          ) : (
            <NavLinkItem
              key={entry.href}
              item={entry}
              pathname={pathname}
              onClick={handleNavClick}
            />
          )
        )}
      </nav>

    </aside>
  )
}

// ---------------------------------------------------------------------------
// NavLinkItem — top-level link (Home, Signals, Identities)
// ---------------------------------------------------------------------------

function NavLinkItem({
  item,
  pathname,
  onClick,
}: {
  item: NavLink
  pathname: string
  onClick: () => void
}) {
  const isActive =
    pathname === item.href ||
    (item.href !== '/' && pathname.startsWith(item.href))

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {item.icon}
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// NavSectionItem — collapsible section (Memory, Settings)
// ---------------------------------------------------------------------------

function NavSectionItem({
  section,
  pathname,
  isExpanded,
  onToggle,
  onNavClick,
}: {
  section: NavSection
  pathname: string
  isExpanded: boolean
  onToggle: () => void
  onNavClick: () => void
}) {
  const hasActiveChild = section.children.some(
    (child) => pathname === child.href || pathname.startsWith(child.href + '/')
  )

  // Special case: /settings exactly should highlight Integrations (first child)
  // and /memory exactly should highlight Logs (first child)

  return (
    <div>
      {/* Section header — button, NOT a link */}
      <button
        onClick={onToggle}
        aria-expanded={isExpanded}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-left',
          hasActiveChild
            ? 'text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        {section.icon}
        <span className="flex-1 truncate">{section.label}</span>
        <span
          className={cn(
            'transition-transform duration-200',
            isExpanded ? 'rotate-90' : 'rotate-0'
          )}
        >
          {icons.chevron}
        </span>
      </button>

      {/* Sub-items */}
      {isExpanded && (
        <ul role="list" className="mt-1 ml-5 space-y-0.5">
          {section.children.map((child) => {
            // Exact match for basePath routes (e.g. /settings matches /settings exactly)
            // or startsWith for deeper routes (e.g. /settings/billing)
            const isChildActive =
              pathname === child.href ||
              (child.href !== section.basePath && pathname.startsWith(child.href + '/'))

            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavClick}
                  className={cn(
                    'flex items-center pl-6 pr-3 py-2 rounded-md text-sm transition-colors min-h-[44px]',
                    isChildActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span className="truncate">{child.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
