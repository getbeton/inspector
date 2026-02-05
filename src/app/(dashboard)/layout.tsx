import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getSession } from '@/lib/auth/session'
import { DashboardLayout } from '@/components/layout'
import { AuthTracker } from '@/components/analytics'

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  return (
    <DashboardLayout
      user={{
        email: session.email,
        name: session.name,
        workspace_name: session.workspace_name,
      }}
    >
      <Suspense fallback={null}>
        <AuthTracker />
      </Suspense>
      {children}
    </DashboardLayout>
  )
}
