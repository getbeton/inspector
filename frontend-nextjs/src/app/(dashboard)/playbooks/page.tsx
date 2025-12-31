'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PlaybookCard, CreatePlaybookDialog } from '@/components/playbooks'
import { cn } from '@/lib/utils/cn'
import { MOCK_PLAYBOOKS } from '@/lib/data/mock-playbooks'
import type { PlaybookData } from '@/lib/data/mock-playbooks'

type TabValue = 'active' | 'paused' | 'all'

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<PlaybookData[]>(MOCK_PLAYBOOKS)
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  const filteredPlaybooks = useMemo(() => {
    if (activeTab === 'all') return playbooks
    return playbooks.filter(p => p.status === activeTab)
  }, [playbooks, activeTab])

  const activeCount = playbooks.filter(p => p.status === 'active').length
  const pausedCount = playbooks.filter(p => p.status === 'paused').length

  // Summary metrics
  const totalLeadsPerMonth = playbooks
    .filter(p => p.status === 'active')
    .reduce((sum, p) => sum + p.leads_per_month, 0)
  const totalEstimatedArr = playbooks
    .filter(p => p.status === 'active')
    .reduce((sum, p) => sum + p.estimated_arr, 0)
  const avgConversionRate = playbooks
    .filter(p => p.status === 'active')
    .reduce((sum, p, _, arr) => sum + p.conversion_rate / arr.length, 0)

  const handleToggleStatus = (id: string) => {
    setPlaybooks(playbooks =>
      playbooks.map(p =>
        p.id === id
          ? { ...p, status: p.status === 'active' ? 'paused' : 'active' }
          : p
      )
    )
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this playbook?')) {
      setPlaybooks(playbooks => playbooks.filter(p => p.id !== id))
    }
  }

  const handleEdit = (id: string) => {
    // TODO: Implement edit functionality
    alert(`Edit playbook ${id} - Coming soon`)
  }

  const handleCreate = (newPlaybook: {
    name: string
    description: string
    conditions: PlaybookData['conditions']
    actions: string[]
    webhook_url?: string
  }) => {
    const playbook: PlaybookData = {
      id: `pb_${Date.now()}`,
      name: newPlaybook.name,
      description: newPlaybook.description,
      conditions: newPlaybook.conditions,
      actions: newPlaybook.actions as PlaybookData['actions'],
      webhook_url: newPlaybook.webhook_url,
      status: 'active',
      leads_per_month: Math.round(30 + Math.random() * 40),
      conversion_rate: 0.1 + Math.random() * 0.2,
      estimated_arr: Math.round((100000 + Math.random() * 100000) / 1000) * 1000,
      created_at: new Date().toISOString(),
    }
    setPlaybooks([playbook, ...playbooks])
  }

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Playbooks</h1>
          <p className="text-muted-foreground">
            Automated workflows that trigger when signals are detected
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Playbook
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Active Playbooks</p>
            <p className="text-3xl font-bold mt-1">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Leads/Month</p>
            <p className="text-3xl font-bold mt-1">{totalLeadsPerMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Avg. Conversion</p>
            <p className="text-3xl font-bold mt-1">{(avgConversionRate * 100).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Est. ARR Impact</p>
            <p className="text-3xl font-bold text-success mt-1">{formatCurrency(totalEstimatedArr)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {[
          { value: 'all', label: 'All', count: playbooks.length },
          { value: 'active', label: 'Active', count: activeCount },
          { value: 'paused', label: 'Paused', count: pausedCount },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value as TabValue)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Playbook List */}
      {filteredPlaybooks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2">No playbooks found</h3>
            <p className="text-muted-foreground mb-4">
              {activeTab === 'all'
                ? "Create your first playbook to automate signal-based workflows."
                : `No ${activeTab} playbooks. Try switching tabs or create a new one.`}
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              Create Playbook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredPlaybooks.map(playbook => (
            <PlaybookCard
              key={playbook.id}
              playbook={playbook}
              onToggleStatus={handleToggleStatus}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <CreatePlaybookDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  )
}
