'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

// User-friendly error messages for auth callback errors
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'workspace_creation_failed': 'Failed to create your workspace. Please try again.',
  'workspace_setup_failed': 'Failed to complete workspace setup. Please try again.',
  'auth_code_exchange_failed': 'Authentication failed. Please try again.',
  'auth_callback_failed': 'Login callback failed. Please try again.',
}

type EmailState = 'idle' | 'sending' | 'sent'

// Separate component for the login form that uses useSearchParams
function LoginForm() {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [emailState, setEmailState] = useState<EmailState>('idle')

  // `next` param is set by MCP OAuth flow (/api/mcp/authorize redirects here)
  const next = searchParams.get('next')

  // Handle error from URL (e.g., from auth callback failures)
  useEffect(() => {
    const urlError = searchParams.get('error')
    if (urlError) {
      const message = AUTH_ERROR_MESSAGES[urlError] || decodeURIComponent(urlError)
      setError(message)
    }
  }, [searchParams])

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Dynamic import to avoid build-time evaluation of Supabase client
      const { signInWithGoogle } = await import('@/lib/auth/supabase')
      // Pass `next` so the auth callback redirects back to the MCP authorize endpoint
      const { error: authError } = await signInWithGoogle(next ?? undefined)

      if (authError) {
        setError(authError.message || 'Failed to sign in with Google')
      }
      // If successful, Supabase will redirect automatically
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGithubSignIn = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { signInWithGithub } = await import('@/lib/auth/supabase')
      const { error: authError } = await signInWithGithub(next ?? undefined)

      if (authError) {
        setError(authError.message || 'Failed to sign in with GitHub')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || emailState === 'sending') return

    try {
      setEmailState('sending')
      setError(null)

      const { signInWithEmail } = await import('@/lib/auth/supabase')
      const { error: authError } = await signInWithEmail(email, next ?? undefined)

      if (authError) {
        setError(authError.message || 'Failed to send magic link')
        setEmailState('idle')
        return
      }

      setEmailState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setEmailState('idle')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome</CardTitle>
        <CardDescription>
          Sign in to your Beton Inspector account
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            {error}
          </div>
        )}

        {emailState === 'sent' ? (
          <div className="p-3 bg-primary/10 text-foreground rounded-md text-sm space-y-1">
            <div className="font-semibold">Check your inbox</div>
            <div className="text-muted-foreground">
              We sent a magic link to <span className="font-mono">{email}</span>. Click the link to finish signing in.
            </div>
            <button
              type="button"
              onClick={() => { setEmailState('idle'); setEmail('') }}
              className="text-xs underline text-muted-foreground"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleEmailSignIn} className="space-y-2">
            <Input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={emailState === 'sending'}
              required
              autoComplete="email"
            />
            <Button
              type="submit"
              disabled={!email || emailState === 'sending'}
              className="w-full"
              size="lg"
            >
              {emailState === 'sending' ? 'Sending magic link…' : 'Continue with email'}
            </Button>
          </form>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-foreground/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wider">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full"
          size="lg"
          variant="outline"
        >
          {isLoading ? 'Signing in…' : 'Sign in with Google'}
        </Button>

        <Button
          onClick={handleGithubSignIn}
          disabled={isLoading}
          className="w-full"
          size="lg"
          variant="outline"
        >
          {isLoading ? 'Signing in…' : 'Sign in with GitHub'}
        </Button>
      </CardContent>
    </Card>
  )
}

// Loading fallback for Suspense
function LoginFormSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome</CardTitle>
        <CardDescription>
          Sign in to your Beton Inspector account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-10 bg-muted animate-pulse rounded-md" />
        <div className="h-12 bg-muted animate-pulse rounded-md" />
        <div className="h-12 bg-muted animate-pulse rounded-md" />
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-2 mb-6">
        <h1 className="text-2xl font-bold">Beton Inspector</h1>
        <p className="text-muted-foreground">
          Signal Discovery & Validation Engine
        </p>
      </div>

      <Suspense fallback={<LoginFormSkeleton />}>
        <LoginForm />
      </Suspense>

      <p className="text-xs text-muted-foreground text-center">
        By signing in, you agree to our Terms of Service
      </p>
    </div>
  )
}
