---
name: add-model
description: Create a new Supabase table with migration. Use when adding a new database table or entity.
---

# /add-model - Add New Database Table

Use this skill to add a new table to the Supabase database and create the corresponding migration.

> **⛔ CRITICAL: DO NOT CREATE SUPABASE DATABASE BRANCHES**
>
> Never use `mcp__supabase__create_branch` or create new database branches for testing migrations.
> Google OAuth clients are configured for specific Supabase projects - creating a new DB branch
> will break authentication entirely. Apply migrations directly to the **staging** database.

## Workflow

### Step 1: Create the migration file

Create a new migration in `supabase/migrations/<timestamp>_add_<table_name>.sql`:

```sql
-- Migration: Add <table_name> table
-- Description: <Description of what this table stores>

-- Create the table
CREATE TABLE IF NOT EXISTS public.<table_name> (
  -- Primary key (UUID for Supabase)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key for multi-tenancy
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Core fields
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',

  -- JSON field for flexible data
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for workspace isolation queries
CREATE INDEX idx_<table_name>_workspace_id ON public.<table_name>(workspace_id);

-- Add other useful indexes
CREATE INDEX idx_<table_name>_status ON public.<table_name>(status);
CREATE INDEX idx_<table_name>_created_at ON public.<table_name>(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access data in their workspace
CREATE POLICY "<table_name>_workspace_isolation"
  ON public.<table_name>
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_<table_name>_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER <table_name>_updated_at_trigger
  BEFORE UPDATE ON public.<table_name>
  FOR EACH ROW
  EXECUTE FUNCTION update_<table_name>_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.<table_name> IS '<Description of the table purpose>';
```

### Step 2: Generate migration filename with timestamp

Use this format for the filename:
```
YYYYMMDDHHMMSS_add_<table_name>.sql
```

Example: `20240115143000_add_playbooks.sql`

To get the current timestamp:
```bash
date +%Y%m%d%H%M%S
```

### Step 3: Add TypeScript types

Add to `frontend-nextjs/src/lib/supabase/types.ts`:

```typescript
// <TableName> types
export interface <TableName> {
  id: string
  workspace_id: string
  name: string
  description: string | null
  status: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface <TableName>Insert {
  workspace_id: string
  name: string
  description?: string
  status?: string
  metadata?: Record<string, unknown>
}

export interface <TableName>Update {
  name?: string
  description?: string
  status?: string
  metadata?: Record<string, unknown>
}
```

### Step 4: Apply the migration

**For local development (with Supabase CLI):**
```bash
cd supabase
npx supabase db push
```

**For staging/production:**
Migrations are auto-applied when deployed or can be applied via Supabase Dashboard.

### Step 5: Verify

```bash
# Check migration was applied (via Supabase CLI)
npx supabase db diff

# Or verify in Supabase Dashboard → Table Editor
```

---

## Migration Safety Rules

1. **Always backward-compatible**: Add columns, don't drop/rename in production
2. **Test in staging first**: Apply to staging Supabase project before production
3. **Atomic migrations**: Keep migrations small and focused
4. **Include RLS policies**: Always add Row Level Security for multi-tenant data
5. **No data migrations in schema files**: Use separate scripts for data changes

---

## Common Column Types

```sql
-- Standard types
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
name TEXT NOT NULL
description TEXT
is_active BOOLEAN DEFAULT true
score NUMERIC
amount DECIMAL(12, 2)
created_at TIMESTAMPTZ DEFAULT NOW()
config JSONB DEFAULT '{}'::jsonb

-- With constraints
email TEXT UNIQUE NOT NULL
workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
status TEXT CHECK (status IN ('active', 'inactive', 'pending'))

-- Arrays
tags TEXT[]

-- Enums (create type first)
CREATE TYPE status_enum AS ENUM ('active', 'inactive', 'pending');
status status_enum DEFAULT 'active'
```

---

## Relationship Patterns

### One-to-Many
```sql
-- Parent table (workspaces)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

-- Child table (accounts belong to workspace)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
```

### Many-to-Many (with junction table)
```sql
-- Junction table
CREATE TABLE account_tags (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, tag_id)
);
```

---

## RLS Policy Patterns

### Standard workspace isolation
```sql
CREATE POLICY "workspace_isolation"
  ON public.<table_name>
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );
```

### Read-only for regular users, write for admins
```sql
CREATE POLICY "read_access"
  ON public.<table_name>
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "admin_write_access"
  ON public.<table_name>
  FOR INSERT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );
```

---

## Checklist

- [ ] Created migration file in `supabase/migrations/`
- [ ] Added appropriate indexes
- [ ] Enabled RLS and created policies
- [ ] Added updated_at trigger
- [ ] Added TypeScript types to `lib/supabase/types.ts`
- [ ] Tested migration locally with `supabase db push`
- [ ] Committed migration file
