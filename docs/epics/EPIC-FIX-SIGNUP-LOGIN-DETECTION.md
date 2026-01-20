# Epic: Fix Signup vs Login Event Detection

## Problem Statement

Currently, when an existing user logs in, the `user_signup` event fires instead of `user_login`. This breaks analytics segmentation between new user acquisition and returning user engagement.

**Expected behavior:**
- New users → `user_signup` event
- Returning users → `user_login` event

**Actual behavior:**
- All users → `user_signup` event (even returning users)

---

## Root Cause Analysis

### The Detection Mechanism

The current implementation uses a `?signup=true` query parameter to distinguish new users:

```
New user:      OAuth → /auth/callback → ?signup=true → dashboard
Existing user: OAuth → /auth/callback → (no param)   → dashboard
```

The `AuthTracker` component reads this parameter to decide which event to fire.

### The Bug Location

**File:** `frontend-nextjs/src/app/auth/callback/route.ts` (lines 46-50)

```typescript
// Check if user has a workspace
const { data: existingMember } = await supabase
  .from('workspace_members')
  .select('workspace_id')
  .eq('user_id', data.user.id)
  .single()

// ...later...
const isNewUser = !existingMember
```

### Why It Fails

1. **Session timing issue**: The Supabase client is created at line 33 *before* `exchangeCodeForSession()` is called. At this point, no session cookies exist.

2. **RLS blocks the query**: After `exchangeCodeForSession()`, the session is stored in the client, but Row Level Security (RLS) policies on `workspace_members` likely require `auth.uid() = user_id`. The query may fail silently because:
   - The session cookie hasn't been written to the response yet
   - The Supabase client was instantiated before auth context existed

3. **Error ignored**: The query destructures only `data`, ignoring any `error`:
   ```typescript
   const { data: existingMember } = await supabase...  // ← error not checked
   ```

   If RLS blocks the query or it fails for any reason, `existingMember` is `null`, and `isNewUser` becomes `true` for everyone.

---

## Proposed Solutions

### Option A: Service Role Client (Recommended)

Create a service role Supabase client that bypasses RLS for this specific query.

**Pros:**
- Clean solution, follows Supabase best practices for auth callbacks
- No timing issues - service role always works
- Can verify user existence reliably

**Cons:**
- Requires `SUPABASE_SERVICE_ROLE_KEY` environment variable
- Must ensure service role is only used server-side

**Implementation:**

1. Add service role client to `lib/supabase/server.ts`:
   ```typescript
   export function createServiceClient() {
     const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
     const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

     if (!supabaseUrl || !serviceRoleKey) {
       throw new Error('Missing Supabase service role environment variables')
     }

     return createClient<Database>(supabaseUrl, serviceRoleKey)
   }
   ```

2. Use in auth callback:
   ```typescript
   // After exchangeCodeForSession, use service client to check existence
   const serviceClient = createServiceClient()
   const { data: existingMember, error } = await serviceClient
     .from('workspace_members')
     .select('workspace_id')
     .eq('user_id', data.user.id)
     .single()

   // Handle the case where no member exists (PGRST116 error)
   const isNewUser = error?.code === 'PGRST116' || !existingMember
   ```

---

### Option B: Server-Side Session Storage

Store the "is new user" flag server-side during workspace creation, then read it.

**Approach:** Add a `created_at` timestamp check - if workspace was created within the last few seconds, it's a signup.

**Pros:**
- Doesn't require service role
- Uses existing data

**Cons:**
- Race condition risk (what if creation takes > threshold?)
- Less explicit than Option A

---

### Option C: Auth Metadata Flag

Set a flag in Supabase Auth user metadata during first workspace creation.

**Implementation:**
1. On first login (workspace creation), set `user.user_metadata.has_workspace = true`
2. On subsequent logins, check this metadata

**Pros:**
- Metadata is always available after `exchangeCodeForSession`
- No RLS concerns

**Cons:**
- Requires updating user metadata
- Metadata can get out of sync if workspace is deleted

---

## Recommended Approach: Option A

The service role client is the cleanest solution because:
1. It's the standard pattern for auth callbacks that need to query data
2. It eliminates all timing/RLS issues
3. It's explicit and easy to understand
4. The service role key is already needed for other server-side operations

---

## Implementation Tasks

### Task 1: Add Service Role Client
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to environment variables (Vercel)
- [ ] Create `createServiceClient()` function in `lib/supabase/server.ts`
- [ ] Add runtime validation to ensure it's only used server-side

### Task 2: Fix Auth Callback
- [ ] Import service client in `app/auth/callback/route.ts`
- [ ] Replace anon client query with service client for existence check
- [ ] Add proper error handling for the query
- [ ] Add logging for debugging

### Task 3: Add Tests
- [ ] Test new user signup → `user_signup` event
- [ ] Test existing user login → `user_login` event
- [ ] Test page refresh while logged in → no duplicate events
- [ ] Test logout → `posthog_reset` event

### Task 4: Documentation
- [ ] Update `docs/POSTHOG_GTM_CONFIGURATION.md` with testing steps
- [ ] Add inline comments explaining the service role usage

---

## Environment Variables Required

```bash
# Already exists (public)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Needs to be added (server-only, never expose to client)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Security note:** The service role key bypasses RLS and should ONLY be used in:
- Server-side API routes
- Auth callbacks
- Cron jobs

Never import `createServiceClient` in client components or expose the key in `NEXT_PUBLIC_*` variables.

---

## Verification Checklist

After implementation, verify in PostHog Live Events:

| Action | Expected Event |
|--------|---------------|
| New user signs up via Google OAuth | `posthog_identify` → `user_signup` |
| Same user logs out | `posthog_reset` |
| Same user logs in again | `posthog_identify` → `user_login` |
| Refresh page while logged in | `posthog_identify` only (no signup/login) |
| Different new user signs up | `posthog_identify` → `user_signup` |

---

## Timeline Estimate

- Task 1: Environment + Service Client
- Task 2: Auth Callback Fix
- Task 3: Testing
- Task 4: Documentation

---

## Related Files

| File | Purpose |
|------|---------|
| `src/app/auth/callback/route.ts` | OAuth callback - **needs fix** |
| `src/lib/supabase/server.ts` | Server client - **needs service role client** |
| `src/components/analytics/auth-tracker.tsx` | Reads `?signup=true` to fire events |
| `src/lib/analytics/gtm.ts` | `trackSignup()` and `trackLogin()` functions |
| `docs/POSTHOG_GTM_CONFIGURATION.md` | GTM setup documentation |

---

## References

- [Supabase SSR Auth Helpers](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase Service Role Key](https://supabase.com/docs/guides/api/api-keys#service-role-key)
- [PostHog Identify Documentation](https://posthog.com/docs/product-analytics/identify)
