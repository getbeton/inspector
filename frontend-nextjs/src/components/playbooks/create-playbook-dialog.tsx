'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils/cn'
import { AVAILABLE_SIGNALS, AVAILABLE_ACTIONS } from '@/lib/data/mock-playbooks'
import type { PlaybookCondition } from '@/lib/data/mock-playbooks'

interface CreatePlaybookDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreate?: (playbook: {
    name: string
    description: string
    conditions: PlaybookCondition[]
    actions: string[]
    webhook_url?: string
  }) => void
}

export function CreatePlaybookDialog({ isOpen, onClose, onCreate }: CreatePlaybookDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedSignals, setSelectedSignals] = useState<{ id: string; name: string; operator: 'AND' | 'OR' | null }[]>([])
  const [selectedActions, setSelectedActions] = useState<string[]>([])
  const [webhookUrl, setWebhookUrl] = useState('')

  if (!isOpen) return null

  const handleAddSignal = (signalId: string) => {
    const signal = AVAILABLE_SIGNALS.find(s => s.id === signalId)
    if (!signal || selectedSignals.some(s => s.id === signalId)) return

    const operator = selectedSignals.length > 0 ? 'AND' : null
    setSelectedSignals([...selectedSignals, { id: signal.id, name: signal.name, operator }])
  }

  const handleRemoveSignal = (signalId: string) => {
    const newSignals = selectedSignals.filter(s => s.id !== signalId)
    // Update operators after removal
    if (newSignals.length > 0) {
      newSignals[0] = { ...newSignals[0], operator: null }
    }
    setSelectedSignals(newSignals)
  }

  const handleToggleOperator = (signalId: string) => {
    setSelectedSignals(signals =>
      signals.map(s =>
        s.id === signalId && s.operator
          ? { ...s, operator: s.operator === 'AND' ? 'OR' : 'AND' }
          : s
      )
    )
  }

  const handleToggleAction = (actionId: string) => {
    setSelectedActions(actions =>
      actions.includes(actionId)
        ? actions.filter(a => a !== actionId)
        : [...actions, actionId]
    )
  }

  const handleCreate = () => {
    if (!name || selectedSignals.length === 0 || selectedActions.length === 0) return

    const conditions: PlaybookCondition[] = selectedSignals.map((s, i) => ({
      signal_id: s.id,
      signal_name: s.name,
      operator: i === selectedSignals.length - 1 ? null : s.operator || 'AND',
    }))

    onCreate?.({
      name,
      description,
      conditions,
      actions: selectedActions,
      webhook_url: selectedActions.includes('webhook') ? webhookUrl : undefined,
    })

    // Reset form
    setName('')
    setDescription('')
    setSelectedSignals([])
    setSelectedActions([])
    setWebhookUrl('')
    onClose()
  }

  // Estimate leads per month based on selected signals
  const estimatedLeads = Math.max(10, Math.round(50 - selectedSignals.length * 12 + Math.random() * 20))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <Card className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        <CardHeader>
          <CardTitle>Create Playbook</CardTitle>
          <CardDescription>
            Define automation rules that trigger when signal conditions are met
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Name & Description */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Playbook Name</label>
              <Input
                placeholder="e.g., High-Intent PQL Alert"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description (optional)</label>
              <Input
                placeholder="What does this playbook do?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Conditions */}
          <div>
            <label className="text-sm font-medium mb-3 block">
              <span className="text-primary font-bold">IF</span> these signals are detected:
            </label>

            {/* Selected signals */}
            {selectedSignals.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-muted/50 rounded-lg">
                {selectedSignals.map((signal, i) => (
                  <div key={signal.id} className="flex items-center gap-1.5">
                    {signal.operator && (
                      <button
                        onClick={() => handleToggleOperator(signal.id)}
                        className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        {signal.operator}
                      </button>
                    )}
                    <Badge variant="outline" className="flex items-center gap-1.5 pr-1">
                      {signal.name}
                      <button
                        onClick={() => handleRemoveSignal(signal.id)}
                        className="ml-1 hover:text-destructive transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Available signals */}
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_SIGNALS.filter(s => !selectedSignals.some(ss => ss.id === s.id)).map(signal => (
                <button
                  key={signal.id}
                  onClick={() => handleAddSignal(signal.id)}
                  className="text-left px-3 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
                >
                  + {signal.name}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <label className="text-sm font-medium mb-3 block">
              <span className="text-success font-bold">THEN</span> perform these actions:
            </label>
            <div className="space-y-2">
              {AVAILABLE_ACTIONS.map(action => (
                <label
                  key={action.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    selectedActions.includes(action.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <Checkbox
                    checked={selectedActions.includes(action.id)}
                    onCheckedChange={() => handleToggleAction(action.id)}
                  />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{action.name}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Webhook URL input */}
            {selectedActions.includes('webhook') && (
              <div className="mt-3">
                <label className="text-sm font-medium mb-1.5 block">Webhook URL</label>
                <Input
                  placeholder="https://hooks.example.com/your-endpoint"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Preview */}
          {selectedSignals.length > 0 && selectedActions.length > 0 && (
            <div className="p-4 bg-muted/50 rounded-lg border border-border">
              <p className="text-sm text-muted-foreground">
                Based on your conditions, approximately{' '}
                <span className="font-bold text-foreground">~{estimatedLeads} leads/month</span>
                {' '}would trigger this playbook.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name || selectedSignals.length === 0 || selectedActions.length === 0}
            >
              Create Playbook
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
