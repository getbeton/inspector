import React from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In | Beton Inspector',
  description: 'Sign in to Beton Inspector to detect buying signals in your first-party data.',
  openGraph: {
    title: 'Sign In | Beton Inspector',
    description: 'Sign in to Beton Inspector to detect buying signals in your first-party data.',
    url: 'https://inspector.getbeton.ai/login',
    siteName: 'Beton',
    type: 'website',
    images: [
      {
        url: 'https://getbeton.ai/images/beton-og-image.png',
        width: 1200,
        height: 630,
        alt: 'Beton Inspector'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sign In | Beton Inspector',
    description: 'Sign in to Beton Inspector to detect buying signals in your first-party data.',
    images: ['https://getbeton.ai/images/beton-og-image.png']
  }
}

export default function AuthLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md p-6">
          {children}
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground">
        <nav className="flex items-center justify-center gap-2">
          <Link
            href="https://getbeton.ai"
            className="hover:text-foreground transition-colors"
          >
            ← Back to Beton
          </Link>
          <span className="text-border">|</span>
          <Link
            href="https://getbeton.ai/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <span className="text-border">|</span>
          <Link
            href="https://getbeton.ai/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
        </nav>
      </footer>
    </div>
  )
}
