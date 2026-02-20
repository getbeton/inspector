'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'
import { RefreshButton } from '@/components/ui/refresh-button'
import { MOCK_IDENTITIES } from '@/lib/data/mock-identities'
import type { IdentityData } from '@/lib/data/mock-identities'

type StatusFilter = 'all' | 'active' | 'new' | 'churned'

export default function IdentitiesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<'score' | 'last_seen' | 'events'>('score')

  const filteredIdentities = useMemo(() => {
    let result = [...MOCK_IDENTITIES]

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(id =>
        id.email.toLowerCase().includes(query) ||
        id.name?.toLowerCase().includes(query) ||
        id.company?.toLowerCase().includes(query)
      )
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(id => id.status === statusFilter)
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score
      if (sortBy === 'events') return b.total_events - a.total_events
      return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
    })

    return result
  }, [searchQuery, statusFilter, sortBy])

  const stats = useMemo(() => ({
    total: MOCK_IDENTITIES.length,
    active: MOCK_IDENTITIES.filter(i => i.status === 'active').length,
    new: MOCK_IDENTITIES.filter(i => i.status === 'new').length,
    churned: MOCK_IDENTITIES.filter(i => i.status === 'churned').length,
  }), [])

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success'
    if (score >= 50) return 'text-warning'
    return 'text-destructive'
  }

  const getStatusBadge = (status: IdentityData['status']) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-success/10 text-success border-success/20">Active</Badge>
      case 'new':
        return <Badge className="bg-primary/10 text-primary border-primary/20">New</Badge>
      case 'churned':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Churned</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Identities</h1>
          <p className="text-muted-foreground">
            Signal recipients. User properties fetched in runtime and deleted afterwards
          </p>
        </div>
        <RefreshButton syncType="posthog_events" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Signals Triggered</p>
            <p className="text-3xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="text-3xl font-bold text-success mt-1">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">New (7d)</p>
            <p className="text-3xl font-bold text-primary mt-1">{stats.new}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Churned</p>
            <p className="text-3xl font-bold text-destructive mt-1">{stats.churned}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-sm">
          <Input
            placeholder="Search by email, name, or company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'active', 'new', 'churned'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                statusFilter === status
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2 border border-border rounded-md bg-background text-sm"
        >
          <option value="score">Sort by Score</option>
          <option value="last_seen">Sort by Last Seen</option>
          <option value="events">Sort by Events</option>
        </select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Identity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Events
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Signals
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Last Seen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredIdentities.map((identity) => (
                  <tr key={identity.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-medium">{identity.name || identity.email}</p>
                        {identity.name && (
                          <p className="text-sm text-muted-foreground">{identity.email}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-medium">{identity.company || '-'}</p>
                        {identity.company_size && (
                          <p className="text-sm text-muted-foreground">{identity.company_size} employees</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={cn('text-lg font-bold', getScoreColor(identity.score))}>
                        {identity.score}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div>
                        <p className="font-medium">{identity.total_events.toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">{identity.session_count} sessions</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Badge variant="outline">{identity.signals_matched}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(identity.status)}
                    </td>
                    <td className="px-4 py-4 text-right text-sm text-muted-foreground">
                      {formatDate(identity.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredIdentities.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No identities found matching your filters</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
