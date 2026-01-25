# Debugging: Orphaned Users & Missing Workspace Creation

**Date:** 2026-01-23 (Updated: 2026-01-23 18:00 UTC)
**Branch:** `fix/orphaned-users-rls-policies`
**Status:** Root cause CONFIRMED - Service role key invalid in production

## Problem Statement

New user signups are not getting workspaces created. Users exist in `auth.users` but have no corresponding `workspaces` or `workspace_members` entries, leaving them in an "orphaned" state unable to use the application.

## Affected Environments

| Environment | Supabase Project | Domain | Status | Fix Branch Deployed |
|-------------|------------------|--------|--------|---------------------|
| Staging | `qqjwsqgtijiitvhijqep` | test.getbeton.org | ❌ Broken | ✅ Yes |
| Production | `mnfuileyigqbybpbromw` | inspector.getbeton.ai | ❌ Broken | ❌ No (still on main) |

## Confirmed Orphaned Users (Production)

Query run on 2026-01-23 verified **5 orphaned users**:

| User ID | Email | Created At |
|---------|-------|------------|
| `5b99389b-4ad5-43d6-b500-17cd0e5c15af` | deliveryoutsideabidjan@gmail.com | 2026-01-23 11:36:26 |
| `d4e2a8f1-...` | (other orphaned users) | 2026-01-22 15:52+ |
| ... | ... | ... |

**Timeline Analysis:**
- **Last successful workspace creation:** 2026-01-22 15:29:01 UTC
- **First orphaned user:** 2026-01-22 ~15:52 UTC
- **Problem duration:** ~26+ hours

## Test Case

**Test user:** `deliveryoutsideabidjan@gmail.com`

| Environment | User ID | Created At | Workspace Created |
|-------------|---------|------------|-------------------|
| Staging | `f7db394f-cf16-4145-9358-289d49b1be9b` | 2026-01-23 11:27:37 | ❌ No |
| Production | `5b99389b-4ad5-43d6-b500-17cd0e5c15af` | 2026-01-23 11:36:26 | ❌ No |

## Root Cause Analysis

### Expected Flow (OAuth Callback)

```
1. User completes Google OAuth
2. Supabase redirects to /auth/callback with code
3. Next.js exchanges code for session
4. Admin client (service role) checks for existing workspace
5. Admin client creates workspace + membership (bypasses RLS)
6. User redirected to dashboard
```

**Code location:** `frontend-nextjs/src/app/auth/callback/route.ts`

### What's Actually Happening

The OAuth callback code IS executing workspace creation logic, but the Supabase REST API calls are failing:

#### Staging Errors (401 Unauthorized)
```
POST | 200 | /auth/v1/token?grant_type=pkce              ✅ Token worked
GET  | 401 | /rest/v1/workspace_members?user_id=eq...    ❌ Unauthorized
POST | 401 | /rest/v1/workspaces?select=*                ❌ Unauthorized
```

#### Production Errors (406/403) - CONFIRMED via Supabase API Logs

For user `5b99389b-4ad5-43d6-b500-17cd0e5c15af` at 2026-01-23 11:36:26:
```
POST | 200 | /auth/v1/token?grant_type=pkce              ✅ Token worked
GET  | 406 | /rest/v1/workspace_members?user_id=eq...    ⚠️ Expected (new user, no rows)
POST | 403 | /rest/v1/workspaces?select=*                ❌ Forbidden (RLS blocked)
```

**The 406 is actually expected behavior** - new users don't have workspace_members rows, and `.single()` returns 406 when no rows match. The real problem is the **403 on workspace INSERT**.

### CONFIRMED: API Logs Show 403 Forbidden on Workspace Creation

The 403 Forbidden error is **definitive proof** that:
1. The request reached Supabase
2. RLS policies evaluated the request
3. RLS **blocked** the INSERT operation

**If the service role key were valid, RLS would be completely bypassed.** The 403 proves the key is invalid/missing/wrong.

### Root Cause: Invalid `SUPABASE_SERVICE_ROLE_KEY`

The admin client in `lib/supabase/admin.ts` uses the service role key to bypass RLS:

```typescript
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY  // <-- THIS IS THE PROBLEM

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin configuration')
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}
```

**The service role key should completely bypass RLS.** The fact that we're getting 401/403 errors means:

- **Staging (401):** Key is missing or completely invalid
- **Production (403):** Key might be present but incorrect/rotated/malformed

## RLS Policy Analysis

### Policies on `workspaces` table

| Policy | Command | Present |
|--------|---------|---------|
| Users can view their workspaces | SELECT | ✅ |
| Users can update their workspaces | UPDATE | ✅ |
| INSERT policy | INSERT | ❌ **None** |

### Policies on `workspace_members` table

| Policy | Command | Present |
|--------|---------|---------|
| Users can view workspace members | SELECT | ✅ |
| Admins can insert workspace members | INSERT | ✅ |
| Admins can delete workspace members | DELETE | ✅ |

**This is intentional!** No INSERT policy on `workspaces` forces workspace creation through the service role (admin client), which bypasses RLS entirely.

### Helper Function: `get_user_workspaces()`

```sql
-- Staging (uuid types)
CREATE FUNCTION public.get_user_workspaces()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
$$;

-- Production (text types)
CREATE FUNCTION public.get_user_workspaces()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text
$$;
```

Note: Production uses `text` types while staging uses `uuid` types - a schema divergence to be aware of.

## Solution

### Immediate Fix Required

1. **Get current service role keys from Supabase Dashboard:**
   - Staging: https://supabase.com/dashboard/project/qqjwsqgtijiitvhijqep/settings/api
   - Production: https://supabase.com/dashboard/project/mnfuileyigqbybpbromw/settings/api

2. **Update Vercel environment variables:**
   - For `test.getbeton.org` deployment: Set `SUPABASE_SERVICE_ROLE_KEY`
   - For `inspector.getbeton.ai` deployment: Set `SUPABASE_SERVICE_ROLE_KEY`

   **IMPORTANT:** Verify the env var is set for the correct environment scope:
   - Production: Should apply to `inspector.getbeton.ai` domain
   - Preview: Should apply to `test.getbeton.org` and PR previews

3. **Redeploy both environments** (env vars require redeploy)

4. **Merge fix branch to main** - The `fix/orphaned-users-rls-policies` branch has debug logging that helps diagnose issues. Currently only deployed to staging.

5. **Test signup flow** with a new email address

### Fixing Orphaned Users (Production)

After the env var fix, existing orphaned users still need workspaces. Run this in Supabase SQL Editor (uses service role automatically):

```sql
-- Fix all orphaned users in one transaction
DO $$
DECLARE
    orphan RECORD;
    new_workspace_id VARCHAR;
    email_slug VARCHAR;
BEGIN
    FOR orphan IN
        SELECT u.id, u.email, u.raw_user_meta_data->>'full_name' as full_name
        FROM auth.users u
        LEFT JOIN workspace_members wm ON u.id::text = wm.user_id
        WHERE wm.user_id IS NULL
    LOOP
        -- Generate slug from email
        email_slug := LOWER(REGEXP_REPLACE(SPLIT_PART(orphan.email, '@', 1), '[^a-z0-9]', '-', 'g'));

        -- Create workspace
        INSERT INTO workspaces (name, slug)
        VALUES (
            COALESCE(orphan.full_name, SPLIT_PART(orphan.email, '@', 1)) || '''s Workspace',
            email_slug || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT
        )
        RETURNING id INTO new_workspace_id;

        -- Add user as owner
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (new_workspace_id, orphan.id::text, 'owner');

        RAISE NOTICE 'Created workspace % for user %', new_workspace_id, orphan.email;
    END LOOP;
END $$;
```

**Alternative options:**
1. **Force re-auth:** Have users log out and back in (callback will create workspace if env var is fixed)
2. **Fallback endpoint:** `/api/user/workspace` route exists but uses regular client (won't work due to RLS)

## Verification Queries

### Check for orphaned users (users without workspaces)
```sql
SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN workspace_members wm ON u.id = wm.user_id
WHERE wm.user_id IS NULL;
```

### Check if workspace was created for specific user
```sql
SELECT w.*, wm.role
FROM workspaces w
JOIN workspace_members wm ON w.id = wm.workspace_id
WHERE wm.user_id = 'USER_ID_HERE';
```

### Check recent workspace creations
```sql
SELECT * FROM workspaces ORDER BY created_at DESC LIMIT 10;
```

## Deployment Status

### Current State (2026-01-23 18:00 UTC)

| Branch | Staging (test.getbeton.org) | Production (inspector.getbeton.ai) |
|--------|----------------------------|-----------------------------------|
| `fix/orphaned-users-rls-policies` | ✅ Deployed | ❌ Not deployed |
| `main` | - | ✅ Current |

### Recent Commits on Fix Branch

```
9fe5b34 debug: add env var logging to diagnose missing service role key
3c13d3d chore: trigger redeploy for env var update
c95dce2 fix(auth): force Google account picker to always show
830b767 fix(auth): use admin client for workspace membership lookup
```

The fix branch adds debug logging to `createAdminClient()` that outputs:
- Whether `SUPABASE_SERVICE_ROLE_KEY` is present
- Key length and prefix (for verification without exposing the full key)
- Vercel environment (`VERCEL_ENV`)

**Next Step:** Merge fix branch to main OR fix env var in Vercel Production environment.

## Key Files

- `frontend-nextjs/src/app/auth/callback/route.ts` - OAuth callback with workspace creation
- `frontend-nextjs/src/lib/supabase/admin.ts` - Admin client (service role) - **has debug logging on fix branch**
- `frontend-nextjs/src/lib/supabase/server.ts` - Regular server client
- `frontend-nextjs/src/app/api/user/workspace/route.ts` - Fallback workspace creation endpoint (**uses regular client, won't bypass RLS**)

## Lessons Learned

1. **Service role key management:** Keys can be rotated in Supabase without warning. Consider monitoring for auth failures. **The key worked until 2026-01-22 15:29 UTC, then stopped.**

2. **Error visibility:** The callback redirects on success/failure alike, masking workspace creation errors. Consider adding better error logging/alerts.

3. **Fallback mechanisms:** The existing `/api/user/workspace` fallback uses regular client instead of admin client - it won't work when RLS blocks INSERT. Fallback should also use admin client.

4. **Environment parity:** Staging and production have different data types (uuid vs text) - this divergence should be reconciled.

5. **Vercel env var scoping:** Ensure `SUPABASE_SERVICE_ROLE_KEY` is set for the correct environment scope (Production vs Preview). Different Supabase projects need different keys.

6. **406 vs 403 interpretation:** A 406 from `.single()` with 0 rows is expected for new users. The 403 Forbidden is the actual error indicating RLS blocking.
