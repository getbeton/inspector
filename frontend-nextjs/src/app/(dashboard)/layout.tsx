import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { DashboardLayout } from '@/components/layout'

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
      {children}
    </DashboardLayout>
  )
}
