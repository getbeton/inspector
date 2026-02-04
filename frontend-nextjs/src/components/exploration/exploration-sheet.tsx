'use client'

import {
  Sheet,
  SheetPopup,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { OverviewTab } from './tabs/overview-tab'
import { WebsiteExplorationTab } from './tabs/website-exploration-tab'
import { TablesTab } from './tabs/tables-tab'
import { JoinCandidatesTab } from './tabs/join-candidates-tab'
import { SchemaGraphTab } from './tabs/schema-graph-tab'
import type { ExplorationSession } from '@/lib/api/explorations'

interface ExplorationSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: ExplorationSession | null
  workspaceId: string
  activeTab: string
  onTabChange: (tab: string) => void
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'website', label: 'Website' },
  { id: 'tables', label: 'Tables' },
  { id: 'joins', label: 'Joins' },
  { id: 'schema', label: 'Schema' },
]

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'error' | 'warning' | 'secondary'> = {
  created: 'secondary',
  running: 'warning',
  completed: 'success',
  failed: 'error',
  closed: 'secondary',
}

export function ExplorationSheet({
  open,
  onOpenChange,
  session,
  workspaceId,
  activeTab,
  onTabChange,
}: ExplorationSheetProps) {
  if (!session) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup>
        <SheetHeader>
          <div className="flex items-center gap-3 pr-8">
            <SheetTitle>
              <span className="font-mono text-base">{session.session_id.slice(0, 12)}…</span>
            </SheetTitle>
            <Badge variant={STATUS_VARIANT[session.status] || 'secondary'}>
              {session.status}
            </Badge>
          </div>
          <SheetDescription>
            {session.agent_app_name || 'Agent'} · {new Date(session.created_at).toLocaleString()}
          </SheetDescription>

          {/* Tab Navigation */}
          <div className="flex gap-1 mt-3 -mb-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </SheetHeader>

        <SheetBody>
          {activeTab === 'overview' && (
            <OverviewTab session={session} />
          )}
          {activeTab === 'website' && (
            <WebsiteExplorationTab
              workspaceId={workspaceId}
              sessionId={session.session_id}
            />
          )}
          {activeTab === 'tables' && (
            <TablesTab
              workspaceId={workspaceId}
              sessionId={session.session_id}
            />
          )}
          {activeTab === 'joins' && (
            <JoinCandidatesTab
              workspaceId={workspaceId}
              session={session}
            />
          )}
          {activeTab === 'schema' && (
            <SchemaGraphTab
              workspaceId={workspaceId}
              session={session}
            />
          )}
        </SheetBody>
      </SheetPopup>
    </Sheet>
  )
}
