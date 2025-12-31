'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import type { PlaybookData } from '@/lib/data/mock-playbooks'

interface PlaybookCardProps {
  playbook: PlaybookData
  onToggleStatus?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

export function PlaybookCard({ playbook, onToggleStatus, onEdit, onDelete }: PlaybookCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n)
  }

  const formatPercent = (n: number) => `${(n * 100).toFixed(1)}%`

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'slack_alert':
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
          </svg>
        )
      case 'attio_update':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
        )
      case 'email_sequence':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )
      case 'webhook':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        )
      default:
        return null
    }
  }

  const getActionName = (action: string) => {
    switch (action) {
      case 'slack_alert': return 'Slack'
      case 'attio_update': return 'Attio'
      case 'email_sequence': return 'Email'
      case 'webhook': return 'Webhook'
      default: return action
    }
  }

  return (
    <Card className={cn(
      'transition-all duration-200',
      playbook.status === 'paused' && 'opacity-60'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{playbook.name}</CardTitle>
              <Badge
                variant={playbook.status === 'active' ? 'default' : 'secondary'}
                className={cn(
                  playbook.status === 'active'
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {playbook.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{playbook.description}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleStatus?.(playbook.id)}
              title={playbook.status === 'active' ? 'Pause playbook' : 'Activate playbook'}
            >
              {playbook.status === 'active' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEdit?.(playbook.id)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete?.(playbook.id)}>
              <svg className="w-4 h-4 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* IF/THEN Rule Display */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">IF</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {playbook.conditions.map((condition, i) => (
                <span key={condition.signal_id} className="flex items-center gap-1.5">
                  <Badge variant="outline" className="font-normal">
                    {condition.signal_name}
                  </Badge>
                  {condition.operator && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {condition.operator}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-success bg-success/10 px-2 py-0.5 rounded">THEN</span>
            <div className="flex items-center gap-2">
              {playbook.actions.map((action) => (
                <div
                  key={action}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground"
                  title={getActionName(action)}
                >
                  {getActionIcon(action)}
                  <span>{getActionName(action)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{playbook.leads_per_month}</p>
            <p className="text-xs text-muted-foreground">leads/month</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{formatPercent(playbook.conversion_rate)}</p>
            <p className="text-xs text-muted-foreground">conversion</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-success">{formatCurrency(playbook.estimated_arr)}</p>
            <p className="text-xs text-muted-foreground">est. ARR</p>
          </div>
        </div>

        {/* Expandable Details */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          {isExpanded ? 'Hide details' : 'Show details'}
          <svg
            className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="pt-3 border-t border-border space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(playbook.created_at).toLocaleDateString()}</span>
            </div>
            {playbook.last_triggered && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last triggered</span>
                <span>{new Date(playbook.last_triggered).toLocaleString()}</span>
              </div>
            )}
            {playbook.webhook_url && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Webhook URL</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">
                  {playbook.webhook_url}
                </code>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
