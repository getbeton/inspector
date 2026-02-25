import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getSession } from '@/lib/auth/session'
import { DashboardLayout } from '@/components/layout'
import { AuthTracker } from '@/components/analytics'

export const metadata: Metadata = {
  alternates: {
    canonical: 'https://inspector.getbeton.ai',
  },
}

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  return (
    <DashboardLayout
      user={session ? {
        email: session.email,
        name: session.name,
        workspace_name: session.workspace_name,
      } : null}
    >
      {session && (
        <Suspense fallback={null}>
          <AuthTracker />
        </Suspense>
      )}
      {children}
    </DashboardLayout>
  )
}
