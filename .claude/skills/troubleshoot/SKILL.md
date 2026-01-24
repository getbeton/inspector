---
name: troubleshoot
description: Debug common issues (connection, migration, build, OAuth errors). Use when encountering development errors or deployment problems.
---

# /troubleshoot - Debug Common Issues

Use this skill when encountering errors during development. It provides a decision tree for the most common problems.

## Decision Tree

### 1. Next.js Build Errors

**Symptoms**: TypeScript errors, module not found, build failures

**Diagnosis**:
```bash
cd frontend-nextjs
npm run build
```

**Solutions**:
```bash
# Clean install
rm -rf node_modules package-lock.json .next
npm install
npm run build

# Type check only
npx tsc --noEmit

# Lint check
npm run lint
```

**Common causes**:
- Missing dependencies: `npm install`
- TypeScript errors: Fix types or add `// @ts-expect-error` (last resort)
- Import errors: Check file paths are correct (case-sensitive!)
- Missing environment variables: Check `.env.local`

---

### 2. Supabase Connection Issues

**Symptoms**: "Failed to fetch", connection errors, auth failures

**Diagnosis**:
```bash
# Check environment variables
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY

# Test Supabase connection in browser console
# Open your app and run:
# supabase.auth.getSession()
```

**Solutions**:

| Issue | Fix |
|-------|-----|
| Missing env vars | Add to `.env.local` |
| Wrong project URL | Verify in Supabase Dashboard → Settings → API |
| RLS blocking | Check RLS policies in Supabase Dashboard |
| Expired session | Clear cookies and re-login |

**Common RLS fixes**:
```sql
-- Check if RLS is blocking your queries
SELECT * FROM pg_policies WHERE tablename = '<table_name>';

-- Temporarily disable RLS for debugging (NEVER in production)
ALTER TABLE <table_name> DISABLE ROW LEVEL SECURITY;
```

---

### 3. OAuth / Login Errors

**Symptoms**: Login redirects to error, "invalid_grant", cookies not set

**Checklist**:

1. **Supabase Dashboard** (Authentication → URL Configuration):
   - Site URL: `https://your-domain.vercel.app`
   - Redirect URLs: Include all valid callback URLs
   - For Google OAuth: Verify client ID/secret in Providers

2. **Environment Variables**:
   ```bash
   # Required for Supabase Auth
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Cookie issues**:
   - `Secure=true` only works on HTTPS (not localhost without SSL)
   - Check `SameSite` attribute matches your setup
   - Verify domain is correct for cookies

4. **PKCE Flow**:
   - Supabase uses PKCE by default
   - Ensure code verifier is stored correctly in cookies/localStorage

---

### 4. Vercel Deployment Issues

**Symptoms**: Build failing on Vercel, environment mismatch

**Diagnosis**:
```bash
# Check Vercel deployment status
npx vercel ls --scope getbeton

# View deployment logs
npx vercel logs <deployment-url> --scope getbeton
```

**Solutions**:

| Issue | Fix |
|-------|-----|
| Build failing | Run `npm run build` locally first |
| Missing env vars | Add in Vercel Dashboard → Settings → Environment Variables |
| Wrong Node version | Check `package.json` engines or add `.nvmrc` |
| Timeout | Check Vercel function limits (10s for Hobby, 60s for Pro) |

**Environment variable checklist**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `CRON_SECRET` (for cron jobs)

---

### 5. Cron Job Not Running

**Symptoms**: Scheduled job not executing, stale data

**Diagnosis**:
```bash
# Check vercel.json config
cat vercel.json | jq '.crons'

# Test endpoint manually
curl -X GET https://your-app.vercel.app/api/cron/signal-detection \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Solutions**:

| Issue | Fix |
|-------|-----|
| Wrong config | Verify `vercel.json` cron schedule format |
| Missing secret | Add `CRON_SECRET` to Vercel env vars |
| Auth failing | Check `Authorization` header validation in route |
| Function timeout | Optimize or split into smaller jobs |

**Cron config example** (`vercel.json`):
```json
{
  "crons": [{
    "path": "/api/cron/signal-detection",
    "schedule": "0 */6 * * *"
  }]
}
```

---

### 6. API Route Errors

**Symptoms**: 500 errors, unexpected responses, auth failures

**Diagnosis**:
```bash
# Test endpoint locally
curl -s http://localhost:3000/api/signals | jq

# Check server logs
# In terminal running `npm run dev`, look for error output
```

**Common issues**:

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Missing/invalid auth | Check `supabase.auth.getUser()` |
| 404 Not Found | Wrong route path | Verify file is in `app/api/` |
| 500 Server Error | Unhandled exception | Add try/catch, check logs |
| RLS violation | Missing workspace filter | Add `.eq('workspace_id', ...)` |

**Debugging pattern**:
```typescript
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    console.log('User:', user?.id)
    console.log('Auth error:', authError)

    // ... rest of handler
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

---

### 7. Local Development Issues

**Symptoms**: App not starting, port conflicts, missing dependencies

**Solutions**:

```bash
# Port conflict
lsof -i :3000
kill -9 <PID>

# Clear Next.js cache
rm -rf .next

# Reset node_modules
rm -rf node_modules package-lock.json
npm install

# Check Node version
node -v  # Should be 18+
```

---

## Quick Reference Commands

```bash
# === Development ===
cd frontend-nextjs && npm run dev     # Start dev server
npm run build                         # Build for production
npm run lint                          # Run linter
npx tsc --noEmit                      # Type check only

# === Vercel ===
npx vercel ls --scope getbeton        # List deployments
npx vercel logs <url> --scope getbeton # View logs
npx vercel env pull                   # Pull env vars locally

# === Supabase ===
npx supabase status                   # Check local Supabase
npx supabase db diff                  # Show migration diff
npx supabase db push                  # Apply migrations

# === Git ===
git status                            # Check changes
git log --oneline -5                  # Recent commits
git diff                              # Show changes
```

---

## Environment Variable Reference

### Required (always needed)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Server-side only
```bash
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Admin access, never expose to client
CRON_SECRET=your-secret            # For cron job auth
```

### Optional (integrations)
```bash
POSTHOG_API_KEY=phx_...
POSTHOG_PROJECT_ID=12345
STRIPE_API_KEY=sk_...
APOLLO_API_KEY=...
ATTIO_API_KEY=...
```
