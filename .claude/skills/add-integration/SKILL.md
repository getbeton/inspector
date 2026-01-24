---
name: add-integration
description: Add a new third-party integration (PostHog, Stripe, Apollo pattern). Use when connecting to external APIs or services.
---

# /add-integration - Add New Third-Party Integration

Use this skill to add a new integration following Beton's established patterns (PostHog, Stripe, Apollo, Attio).

## Workflow

### Step 1: Create the integration client

Create `frontend-nextjs/src/lib/integrations/<service>/client.ts`:

```typescript
/**
 * <Service> integration client.
 *
 * Handles authentication and API communication with <Service>.
 */
import { createIntegrationError } from '../types'

const <SERVICE>_API_BASE = 'https://api.<service>.com/v1'

export interface <Service>ClientConfig {
  apiKey: string
  // Add other config options
}

export class <Service>Client {
  private apiKey: string
  private baseUrl: string

  constructor(config: <Service>ClientConfig) {
    if (!config.apiKey) {
      throw createIntegrationError(
        '<Service> API key is required',
        'INVALID_CONFIG'
      )
    }

    this.apiKey = config.apiKey
    this.baseUrl = <SERVICE>_API_BASE
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const isRetryable = response.status === 429 || response.status >= 500
      throw createIntegrationError(
        `<Service> API error: ${response.statusText}`,
        'API_ERROR',
        response.status,
        isRetryable
      )
    }

    return response.json()
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      // Call a lightweight endpoint to verify credentials
      await this.fetch<unknown>('/me')
      return true
    } catch {
      return false
    }
  }

  /**
   * Fetch <entities> from <Service>
   */
  async get<Entities>(options: {
    limit?: number
    cursor?: string
  } = {}): Promise<{ results: unknown[]; next?: string }> {
    const { limit = 100, cursor } = options

    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) {
      params.append('cursor', cursor)
    }

    return this.fetch<{ results: unknown[]; next?: string }>(
      `/<entities>?${params.toString()}`
    )
  }

  // Add more methods as needed...
}

/**
 * Factory function to create a <Service> client
 */
export function create<Service>Client(
  apiKey: string
): <Service>Client {
  return new <Service>Client({ apiKey })
}
```

### Step 2: Export from integrations index

Add to `frontend-nextjs/src/lib/integrations/index.ts`:

```typescript
export * from './<service>/client'
```

### Step 3: Create API endpoints for integration management

Create `frontend-nextjs/src/app/api/integrations/<service>/route.ts`:

```typescript
/**
 * <Service> integration endpoints
 */
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import { <Service>Client } from '@/lib/integrations/<service>/client'

/**
 * GET /api/integrations/<service>
 * Check integration status and health
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Get stored integration config
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('workspace_id', membership.workspaceId)
      .eq('name', '<service>')
      .single()

    if (!integration?.config?.api_key) {
      return NextResponse.json({
        connected: false,
        status: 'not_configured'
      })
    }

    // Test connection
    const client = new <Service>Client({
      apiKey: integration.config.api_key
    })

    const isHealthy = await client.testConnection()

    return NextResponse.json({
      connected: isHealthy,
      status: isHealthy ? 'connected' : 'error',
      configured_at: integration.updated_at
    })
  } catch (error) {
    console.error('Error checking <service> status:', error)
    return NextResponse.json({
      connected: false,
      status: 'error',
      error: 'Failed to check connection'
    })
  }
}

/**
 * POST /api/integrations/<service>
 * Configure the integration
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { api_key } = body

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    if (!api_key) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    // Validate API key by testing connection
    const client = new <Service>Client({ apiKey: api_key })
    const isValid = await client.testConnection()

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid API key - connection test failed' },
        { status: 400 }
      )
    }

    // Store or update integration config
    const { error } = await supabase
      .from('integrations')
      .upsert({
        workspace_id: membership.workspaceId,
        name: '<service>',
        config: { api_key },
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workspace_id,name'
      })

    if (error) {
      console.error('Error saving integration:', error)
      return NextResponse.json({ error: 'Failed to save integration' }, { status: 500 })
    }

    return NextResponse.json({
      message: '<Service> configured successfully',
      connected: true
    })
  } catch (error) {
    console.error('Error configuring <service>:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/integrations/<service>
 * Disconnect the integration
 */
export async function DELETE() {
  try {
    const supabase = await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('integrations')
      .delete()
      .eq('workspace_id', membership.workspaceId)
      .eq('name', '<service>')

    if (error) {
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
    }

    return NextResponse.json({ message: '<Service> disconnected' })
  } catch (error) {
    console.error('Error disconnecting <service>:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Step 4: Add sync service (if data sync needed)

Create `frontend-nextjs/src/lib/integrations/<service>/sync.ts`:

```typescript
/**
 * Sync service for <Service> data
 */
import { SupabaseClient } from '@supabase/supabase-js'
import { <Service>Client } from './client'

export interface SyncResult {
  total: number
  synced: number
  errors: number
}

export class <Service>SyncService {
  constructor(
    private supabase: SupabaseClient,
    private client: <Service>Client,
    private workspaceId: string
  ) {}

  async sync<Entities>(limit: number = 1000): Promise<SyncResult> {
    const result: SyncResult = {
      total: 0,
      synced: 0,
      errors: 0
    }

    try {
      const { results } = await this.client.get<Entities>({ limit })
      result.total = results.length

      for (const record of results) {
        try {
          await this.upsert<Entity>(record)
          result.synced++
        } catch (error) {
          console.error('Error syncing record:', error)
          result.errors++
        }
      }
    } catch (error) {
      console.error('Sync failed:', error)
      throw error
    }

    return result
  }

  private async upsert<Entity>(data: unknown): Promise<void> {
    // Transform and upsert the record
    // Implementation depends on data structure
  }
}
```

### Step 5: Add UI in settings page

Add to `frontend-nextjs/src/app/(dashboard)/settings/integrations/page.tsx`:

```tsx
// Add <Service> integration card
<IntegrationCard
  name="<Service>"
  description="Connect to <Service> for <purpose>"
  icon={<ServiceIcon />}
  connected={integrations.<service>?.connected}
  onConfigure={() => configure<Service>()}
/>
```

---

## Reference Implementations

| Integration | Client File | Purpose |
|-------------|-------------|---------|
| PostHog | `lib/integrations/posthog/client.ts` | Analytics events, persons, HogQL queries |
| Stripe | `lib/integrations/stripe/client.ts` | Payment, subscription data |
| Apollo | `lib/integrations/apollo/client.ts` | Company enrichment |
| Attio | `lib/integrations/attio/client.ts` | CRM sync (most comprehensive example) |

---

## Security Notes

1. **API keys stored in database** - Use the `integrations` table with workspace isolation
2. **Never log API keys** - Use masked versions for debugging
3. **Validate keys** before storing by making a test API call
4. **Workspace isolation** - Each workspace has its own integration config
5. **Server-side only** - Integration clients should only run in API routes, never on the client

---

## Checklist

- [ ] Created client in `frontend-nextjs/src/lib/integrations/<service>/client.ts`
- [ ] Exported from `lib/integrations/index.ts`
- [ ] Created API endpoints in `app/api/integrations/<service>/route.ts`
- [ ] Added sync service (if needed) in `lib/integrations/<service>/sync.ts`
- [ ] Added UI in settings page
- [ ] Tested locally with `npm run dev`
- [ ] Ran `npm run build` before committing
