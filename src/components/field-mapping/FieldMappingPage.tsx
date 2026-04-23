'use client'

import { useState } from 'react'
import { FieldMappingStoreProvider } from './store'
import { MappingSection } from './MappingSection'
import { SaveBar } from './SaveBar'
import { TestModal } from './TestModal'
import type {
  Destination,
  MappingRow,
  ObjectId,
  ObjectSchema,
} from '@/lib/field-mapping/client'

interface FieldMappingPageProps {
  destination: Destination
  objects: ObjectSchema[]
  mappings: Record<ObjectId, MappingRow[]>
  workspaceId: string
  /** When true, omits the dashboard chrome (SaveBar, page header). Used by the wizard step. */
  embedded?: boolean
}

export function FieldMappingPage({
  destination,
  objects,
  mappings,
  workspaceId,
  embedded = false,
}: FieldMappingPageProps) {
  const [testFor, setTestFor] = useState<ObjectId | null>(null)

  return (
    <FieldMappingStoreProvider
      destination={destination}
      initialObjects={objects}
      initialMappings={mappings}
      workspaceId={workspaceId}
    >
      {!embedded ? <SaveBar /> : null}
      <div className={embedded ? '' : 'max-w-[1360px] mx-auto px-8 pb-20'}>
        {!embedded ? (
          <header className="pt-6 pb-4">
            <h1 className="text-3xl font-heading uppercase tracking-wider mb-2">Field mapping</h1>
            <p className="text-sm text-foreground/60 max-w-2xl">
              Map PostHog properties and Beton-computed fields into {destination} objects. Each
              row defines one destination field. A source can be a property, a formula, or — for
              select fields — an option defined on the object.
            </p>
          </header>
        ) : null}

        {objects.length === 0 ? (
          <div className="border-2 border-dashed border-foreground/20 p-10 text-center text-sm text-foreground/60">
            No {destination} objects available. Make sure the integration is connected and has the
            expected objects (Deals, People, Companies, Workspaces).
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {objects.map((obj) => (
              <MappingSection
                key={obj.id}
                objectSchema={obj}
                destination={destination}
                onTest={setTestFor}
              />
            ))}
          </div>
        )}
      </div>

      <TestModal destination={destination} objectId={testFor} onClose={() => setTestFor(null)} />
    </FieldMappingStoreProvider>
  )
}
