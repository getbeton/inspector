---
name: add-endpoint
description: Scaffold a new Next.js API route with TypeScript types. Use when creating a new API endpoint or route handler.
---

# /add-endpoint - Add New API Endpoint

Use this skill to create a new Next.js API route following Beton's established patterns.

## Workflow

### Step 1: Create the route file

Create `frontend-nextjs/src/app/api/<module>/route.ts`:

```typescript
/**
 * <Module Name> API endpoints.
 *
 * Provides endpoints for:
 * - <List key functionality>
 */
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * GET /api/<module>
 * List all <entities> for current workspace
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's workspace
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Build query with workspace isolation
    const { data, error, count } = await supabase
      .from('<table_name>')
      .select('*', { count: 'exact' })
      .eq('workspace_id', membership.workspaceId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) {
      console.error('Error fetching <entities>:', error)
      return NextResponse.json({ error: 'Failed to fetch <entities>' }, { status: 500 })
    }

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: count ? Math.ceil(count / limit) : 0
      }
    })
  } catch (error) {
    console.error('Error in GET /api/<module>:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/<module>
 * Create a new <entity>
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's workspace
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const body = await request.json()
    const { name, ...otherFields } = body

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      )
    }

    // Create entity
    const { data, error } = await supabase
      .from('<table_name>')
      .insert({
        workspace_id: membership.workspaceId,
        name,
        ...otherFields
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating <entity>:', error)
      return NextResponse.json({ error: 'Failed to create <entity>' }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/<module>:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Step 2: Create dynamic route (for single entity operations)

Create `frontend-nextjs/src/app/api/<module>/[id]/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/<module>/[id]
 * Get a single <entity> by ID
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
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

    const { data, error } = await supabase
      .from('<table_name>')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', membership.workspaceId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: '<Entity> not found' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error in GET /api/<module>/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/<module>/[id]
 * Update a <entity>
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const body = await request.json()

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

    const { data, error } = await supabase
      .from('<table_name>')
      .update(body)
      .eq('id', id)
      .eq('workspace_id', membership.workspaceId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to update <entity>' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error in PATCH /api/<module>/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/<module>/[id]
 * Delete a <entity>
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
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
      .from('<table_name>')
      .delete()
      .eq('id', id)
      .eq('workspace_id', membership.workspaceId)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete <entity>' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/<module>/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Step 3: Add TypeScript types (optional but recommended)

Add to `frontend-nextjs/src/lib/supabase/types.ts` or create module-specific types:

```typescript
export interface <Entity> {
  id: string
  workspace_id: string
  name: string
  // Add other fields
  created_at: string
  updated_at: string
}

export interface <Entity>Insert {
  workspace_id: string
  name: string
  // Add required fields
}

export interface <Entity>Update {
  name?: string
  // Add optional fields
}
```

### Step 4: Add API client hook (for frontend consumption)

Add to `frontend-nextjs/src/lib/api/<module>.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface <Entity> {
  id: string
  name: string
  // Add fields
  created_at: string
}

export function use<Entities>() {
  return useQuery({
    queryKey: ['<entities>'],
    queryFn: async () => {
      const res = await fetch('/api/<module>')
      if (!res.ok) throw new Error('Failed to fetch <entities>')
      return res.json()
    }
  })
}

export function useCreate<Entity>() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Partial<<Entity>>) => {
      const res = await fetch('/api/<module>', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('Failed to create <entity>')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['<entities>'] })
    }
  })
}
```

---

## Reference Pattern

See `frontend-nextjs/src/app/api/signals/route.ts` for a comprehensive example with:
- Query parameters parsing
- Pagination
- Workspace isolation
- Error handling
- Related data (joins)

---

## Checklist

- [ ] Created route file in `frontend-nextjs/src/app/api/<module>/route.ts`
- [ ] Created dynamic route for single-entity operations (if needed)
- [ ] Added TypeScript types
- [ ] Added React Query hooks for frontend
- [ ] Tested locally with `npm run dev`
- [ ] Ran `npm run build` before committing

---

## Common Patterns

### Workspace isolation (multi-tenant)
```typescript
const membership = await getWorkspaceMembership()
const { data } = await supabase
  .from('table')
  .select('*')
  .eq('workspace_id', membership.workspaceId)
```

### Error handling
```typescript
if (!data) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### Query with relationships
```typescript
const { data } = await supabase
  .from('signals')
  .select(`
    *,
    accounts (
      id,
      name,
      domain
    )
  `)
  .eq('workspace_id', workspaceId)
```
