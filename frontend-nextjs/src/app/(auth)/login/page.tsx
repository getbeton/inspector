'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signInWithGoogle } from '@/lib/auth/supabase'
import { useState } from 'react'
import Link from 'next/link'

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true)
      setError(null)

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
    <div className="space-y-4">
      <div className="text-center space-y-2 mb-6">
        <h1 className="text-2xl font-bold">Beton Inspector</h1>
        <p className="text-muted-foreground">
          Signal Discovery & Validation Engine
        </p>
      </div>

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

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                Or continue as demo
              </span>
            </div>
          </div>

          <Link href="/">
            <Button
              variant="outline"
              className="w-full"
              size="lg"
            >
              Demo Mode
            </Button>
          </Link>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        By signing in, you agree to our Terms of Service
      </p>
    </div>
  )
}
