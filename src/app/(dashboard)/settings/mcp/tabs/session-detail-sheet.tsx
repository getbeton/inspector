'use client'

import {
  Sheet,
  SheetPopup,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'
import type { McpSession } from '@/lib/api/mcp-sessions'
import { statusBadge, formatTimestamp, formatDuration } from './session-helpers'

// ---------------------------------------------------------------------------
// Session Detail Sheet
// ---------------------------------------------------------------------------

export default function SessionDetailSheet({
  session,
  open,
  onOpenChange,
}: {
  session: McpSession | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!session) return null

  const badge = statusBadge(session.status)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup>
        <SheetHeader>
          <SheetTitle>Session Details</SheetTitle>
          <SheetDescription>
            {session.agent_app_name || 'Unknown agent'}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-5">
            {/* Status */}
            <DetailRow label="Status">
              <Badge variant={badge.variant} size="sm">
                {badge.dot && (
                  <span className={`inline-block size-1.5 rounded-full ${badge.dot}`} />
                )}
                {badge.label}
              </Badge>
            </DetailRow>

            {/* Session ID */}
            <DetailRow label="Session ID">
              <span className="flex items-center gap-1.5 min-w-0">
                <code className="text-sm font-mono truncate">{session.session_id}</code>
                <CopyButton value={session.session_id} size="sm" />
              </span>
            </DetailRow>

            {/* Internal UUID */}
            <DetailRow label="UUID">
              <span className="flex items-center gap-1.5 min-w-0">
                <code className="text-sm font-mono truncate">{session.id}</code>
                <CopyButton value={session.id} size="sm" />
              </span>
            </DetailRow>

            {/* Agent App */}
            <DetailRow label="Agent App">
              <span className="text-sm">{session.agent_app_name || '—'}</span>
            </DetailRow>

            {/* Duration */}
            <DetailRow label="Duration">
              <span className="text-sm">
                {formatDuration(session.started_at, session.completed_at)}
              </span>
            </DetailRow>

            {/* Timestamps */}
            <div className="border-t border-border pt-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Timestamps
              </h4>
              <DetailRow label="Created">
                <span className="text-sm">{formatTimestamp(session.created_at)}</span>
              </DetailRow>
              {session.started_at && (
                <DetailRow label="Started">
                  <span className="text-sm">{formatTimestamp(session.started_at)}</span>
                </DetailRow>
              )}
              {session.completed_at && (
                <DetailRow label="Completed">
                  <span className="text-sm">{formatTimestamp(session.completed_at)}</span>
                </DetailRow>
              )}
              <DetailRow label="Updated">
                <span className="text-sm">{formatTimestamp(session.updated_at)}</span>
              </DetailRow>
            </div>

            {/* Results */}
            <div className="border-t border-border pt-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Results
              </h4>
              <DetailRow label="EDA Results">
                <span className="text-sm">{session.eda_count}</span>
              </DetailRow>
              <DetailRow label="Website Exploration">
                <span className="text-sm">{session.has_website_result ? 'Yes' : 'No'}</span>
              </DetailRow>
            </div>

            {/* Error message (if failed) */}
            {session.error_message && (
              <div className="border-t border-border pt-4 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-destructive">
                  Error
                </h4>
                <p className="text-sm text-destructive bg-destructive/5 rounded-md px-3 py-2 font-mono whitespace-pre-wrap">
                  {session.error_message}
                </p>
              </div>
            )}
          </div>
        </SheetBody>
      </SheetPopup>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Detail Row
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  )
}
