'use client'

import { useState, useCallback } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toastManager } from '@/components/ui/toast'

interface CopyButtonProps {
  value: string
  className?: string
  size?: 'sm' | 'default'
}

export function CopyButton({ value, className, size = 'default' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toastManager.add({ type: 'success', title: 'Copied!' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to copy' })
    }
  }, [value])

  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
        className={cn(
          'inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          size === 'sm' ? 'p-1' : 'p-1.5',
          className,
        )}
      >
        {copied ? (
          <Check className={cn(iconSize, 'text-success')} />
        ) : (
          <Copy className={iconSize} />
        )}
      </button>
      {/* Screen reader announcement */}
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </span>
  )
}
