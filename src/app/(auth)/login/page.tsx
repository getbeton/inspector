'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// User-friendly error messages for auth callback errors
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'workspace_creation_failed': 'Failed to create your workspace. Please try again.',
  'workspace_setup_failed': 'Failed to complete workspace setup. Please try again.',
  'auth_code_exchange_failed': 'Authentication failed. Please try again.',
  'auth_callback_failed': 'Login callback failed. Please try again.',
}

// Separate component for the login form that uses useSearchParams
function LoginForm() {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const { error: authError } = await signInWithGoogle()

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

        <Button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? 'Signing in...' : 'Sign in with Google'}
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
