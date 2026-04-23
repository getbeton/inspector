import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { createAttioAdapter, listMappings } from '@/lib/field-mapping'
import { FieldMappingPage } from '@/components/field-mapping'
import type { Destination, ObjectSchema } from '@/lib/field-mapping'

const SUPPORTED: Destination[] = ['attio']

interface PageProps {
  params: Promise<{ name: string }>
}

export default async function Page({ params }: PageProps) {
  const { name } = await params
  if (!(SUPPORTED as string[]).includes(name)) notFound()
  const destination = name as Destination

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const membership = await getWorkspaceMembership()
  if (!membership) redirect('/')

  const creds = await getIntegrationCredentials(membership.workspaceId, destination)
  if (!creds) {
    // Integration not connected yet — redirect to setup
    redirect('/setup')
  }

  const adapter = createAttioAdapter({ supabase })

  let objects: ObjectSchema[] = []
  try {
    const bareObjects = await adapter.listObjects(membership.workspaceId)
    objects = await Promise.all(
      bareObjects.map(async (obj) => ({
        ...obj,
        fields: await adapter.listFields(membership.workspaceId, obj.id),
      })),
    )
  } catch (err) {
    console.error('[field-mapping] Failed to load objects/fields:', err)
  }

  const mappings = await listMappings(supabase, membership.workspaceId, destination)

  return (
    <FieldMappingPage
      destination={destination}
      objects={objects}
      mappings={mappings}
      workspaceId={membership.workspaceId}
    />
  )
}
