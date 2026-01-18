---
name: troubleshoot
description: Debug common issues (connection, migration, build, OAuth errors). Use when encountering development errors or deployment problems.
---

# /troubleshoot - Debug Common Issues

Use this skill when encountering errors during development. It provides a decision tree for the most common problems.

## Decision Tree

### 1. "Connection refused" on localhost

**Symptoms**: API calls fail, services unreachable

**Diagnosis**:
```bash
docker-compose ps
```

**Solutions**:
- If services are down: `docker-compose up -d`
- If services show "Exit": Check logs with `docker-compose logs backend`
- Port conflicts: Check nothing else is using ports 8080 (backend) or 3000 (Next.js)

---

### 2. Alembic Migration Errors

**Symptoms**:
- "Target database is not up to date"
- "Can't locate revision"
- Migration conflicts

**Diagnosis**:
```bash
docker-compose exec backend alembic current
docker-compose exec backend alembic history --verbose
```

**Solutions**:

| Error | Fix |
|-------|-----|
| DB behind | `docker-compose exec backend alembic upgrade head` |
| Multiple heads | `docker-compose exec backend alembic merge heads -m "merge"` |
| Corrupted state | Check `alembic_version` table, may need manual fix |

**Prevention**: Always create migrations from a clean state.

---

### 3. Next.js Build Errors

**Symptoms**: TypeScript errors, module not found, build failures

**Diagnosis**:
```bash
cd frontend-nextjs
npm run build
```

**Solutions**:
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build

# Type check only
npx tsc --noEmit

# Lint check
npm run lint
```

**Common causes**:
- Missing dependencies: `npm install`
- TypeScript errors: Fix types or add `// @ts-ignore` (last resort)
- Import errors: Check file paths are correct

---

### 4. OAuth Callback Fails

**Symptoms**: Login redirects to error, "invalid_grant", cookies not set

**Checklist**:

1. **Supabase Dashboard** (Authentication → URL Configuration):
   - Redirect URL: `https://inspector.getbeton.ai/api/oauth/callback`

2. **Railway Frontend Service**:
   - `API_URL=http://backend.railway.internal:8080`

3. **Request routing**:
   - OAuth must go through frontend proxy (not directly to backend)
   - Check `frontend-nextjs/next.config.ts` → `rewrites()`

4. **Cookie issues**:
   - `Secure=true` only works on HTTPS
   - Check `SameSite` attribute matches your setup

---

### 5. Railway Preview Environment Not Deploying

**Symptoms**: Branch push doesn't create environment, deploy hangs

**Diagnosis**:
```bash
railway logs --service backend
railway status
```

**Solutions**:

| Issue | Fix |
|-------|-----|
| Branch name too long | Railway truncates to 25 chars - use shorter names |
| Invalid characters | Branch names are sanitized: `feature/my-thing` → `pr-feature-my-thing` |
| Token expired | Re-authenticate: `railway login` |
| Missing env vars | Check `RAILWAY_TOKEN` and `RAILWAY_PROJECT_ID` in GitHub secrets |

**Manual creation**:
```bash
BRANCH_NAME=feature/my-branch bash scripts/railway_preview_env.sh
```

---

### 6. Tests Failing

**Backend tests**:
```bash
# In Docker
docker-compose exec backend pytest -v

# Local (requires venv)
make py-test
```

**Frontend tests**:
```bash
cd frontend-nextjs
npm run test:run
```

**Common fixes**:
- Missing fixtures: Check test imports
- Database state: Tests should be isolated, check cleanup
- Environment: Ensure `.env.test` has required variables

---

### 7. Docker Issues

**Container won't start**:
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**Out of disk space**:
```bash
docker system prune -a
```

**Network issues**:
```bash
docker network ls
docker-compose down && docker-compose up -d
```

---

## Quick Reference Commands

```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart everything
docker-compose down && docker-compose up -d

# Check migration status
docker-compose exec backend alembic current

# Check Railway status
railway status
railway logs --service backend
```
