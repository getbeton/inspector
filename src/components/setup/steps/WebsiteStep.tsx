'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface WebsiteStepProps {
  initialUrl?: string | null
  onSuccess: (websiteUrl: string) => void
  className?: string
}

/**
 * Website confirmation step in the setup wizard.
 * Pre-fills with domain auto-detected from the user's email at signup.
 * Allows the user to confirm or change their company website URL.
 */
export function WebsiteStep({ initialUrl, onSuccess, className }: WebsiteStepProps) {
  const [websiteUrl, setWebsiteUrl] = useState(initialUrl || '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!websiteUrl.trim()) {
      setError('Please enter your company website URL')
      return
    }

    // Normalize URL
    let url = websiteUrl.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`
    }

    setIsSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/workspace/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website_url: url }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to save website URL')
      }

      onSuccess(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save website URL')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Confirm Your Website</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {initialUrl
              ? 'We detected your company domain from your email. Please confirm or update it.'
              : 'Enter your company website so Beton can match accounts and enrich data.'}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Website URL</label>
          <Input
            placeholder="https://yourcompany.com"
            value={websiteUrl}
            onChange={(e) => {
              setWebsiteUrl(e.target.value)
              setError(null)
            }}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleSubmit}
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? 'Saving...' : 'Confirm Website'}
        </Button>

        <button
          type="button"
          onClick={() => onSuccess('')}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
