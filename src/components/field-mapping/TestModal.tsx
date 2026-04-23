'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Check, Play, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendTest } from './api'
import { useFieldMappingStore } from './store'
import type {
  Destination,
  ObjectId,
  SendTestResult,
} from '@/lib/field-mapping'

interface TestModalProps {
  destination: Destination
  objectId: ObjectId | null
  onClose: () => void
}

export function TestModal({ destination, objectId, onClose }: TestModalProps) {
  const { objects, mappings, subjectByObj, subjects } = useFieldMappingStore()
  const obj = objects.find((o) => o.id === objectId) ?? null
  const rows = objectId ? mappings[objectId] ?? [] : []
  const subjectId = objectId ? subjectByObj[objectId] ?? null : null
  const subject = objectId ? (subjects[objectId] ?? []).find((s) => s.id === (subjectId ?? '')) ?? null : null

  const [stage, setStage] = useState<'idle' | 'sending' | 'done'>('idle')
  const [result, setResult] = useState<SendTestResult & { payload?: Record<string, unknown> | null } | null>(null)

  useEffect(() => {
    if (objectId) {
      setStage('idle')
      setResult(null)
    }
  }, [objectId])

  const handleSend = async () => {
    if (!obj) return
    setStage('sending')
    const r = await sendTest(destination, obj.id, rows, subjectId ?? undefined)
    setResult(r)
    setStage('done')
  }

  return (
    <Dialog open={!!objectId} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="!max-w-3xl">
        <DialogHeader>
          <DialogTitle>Send test → {obj?.label ?? ''}</DialogTitle>
          <DialogDescription>
            Sends one record to your {destination} sandbox. No production data is touched.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="grid grid-cols-[1fr_260px] gap-6">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-foreground/50 mb-2">
                Payload
              </div>
              <pre className="border-2 border-foreground/15 bg-muted/30 p-3 text-[11px] font-mono overflow-x-auto max-h-[360px] whitespace-pre">
                {result?.payload
                  ? JSON.stringify(result.payload, null, 2)
                  : 'Send the test to see the evaluated payload.'}
              </pre>
              {result && stage === 'done' ? (
                <ResultBanner result={result} />
              ) : null}
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-foreground/50 mb-1">
                  Test subject
                </div>
                <div className="border-2 border-foreground/15 bg-background p-2">
                  <div className="font-semibold text-sm truncate">
                    {subject?.name ?? '(auto)'}
                  </div>
                  <div className="text-[10px] font-mono text-foreground/50 truncate">
                    {subject?.email || subject?.domain || subject?.distinctId || ''}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-foreground/50 mb-1">
                  Destination
                </div>
                <div className="border-2 border-foreground/15 bg-background p-2 space-y-0.5">
                  <div className="font-semibold text-sm capitalize">{destination} sandbox</div>
                  <div className="text-[10px] text-foreground/50 font-mono">object: {obj?.id}</div>
                </div>
              </div>
            </div>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {stage === 'done' ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={handleSend} disabled={stage === 'sending' || !obj}>
            {stage === 'sending' ? (
              <>
                <RefreshCw className="size-3 animate-spin" /> Sending…
              </>
            ) : stage === 'done' ? (
              <>
                <RefreshCw className="size-3" /> Send again
              </>
            ) : (
              <>
                <Play className="size-3" fill="currentColor" /> Send test
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResultBanner({ result }: { result: SendTestResult }) {
  const ok = result.status === 'success'
  return (
    <div
      className={cn(
        'mt-4 border-2 p-3 flex items-start gap-3',
        ok ? 'bg-success/10 border-success' : 'bg-destructive/10 border-destructive',
      )}
    >
      <div
        className={cn(
          'shrink-0 size-8 border-2 flex items-center justify-center',
          ok ? 'bg-success text-white border-foreground' : 'bg-destructive text-white border-foreground',
        )}
      >
        {ok ? <Check strokeWidth={3} className="size-4" /> : <AlertTriangle className="size-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 font-bold text-sm">
          <span>{result.title}</span>
          <Badge className={ok ? 'bg-success/20 text-foreground' : 'bg-destructive/20 text-destructive'}>
            {String(result.code)}
          </Badge>
        </div>
        <p className="text-xs text-foreground/70 mt-1">{result.detail}</p>
      </div>
    </div>
  )
}
