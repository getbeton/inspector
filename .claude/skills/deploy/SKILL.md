---
name: deploy
description: Commit, push, and verify Vercel deployment. Use when deploying changes, creating commits, or checking deployment status.
---

# /deploy - Commit, Push & Verify Deployment

Use this skill to commit changes, push to the current branch, and verify the Vercel preview deployment succeeded.

## Environment Matrix

| Git Branch | Vercel Environment | Supabase Project |
|------------|-------------------|------------------|
| `main` | Production | `beton-inspector` / `main` branch |
| `staging` | Staging | `beton-inspector` / `staging` branch |
| Feature branches | Preview | `beton-inspector` / `staging` branch |

> **Note**: All feature branch previews use the **staging** Supabase database. Only the `main` branch connects to the production Supabase project.

> **⛔ CRITICAL: DO NOT CREATE SUPABASE DATABASE BRANCHES**
>
> Never use `mcp__supabase__create_branch` or create new database branches for testing.
> Google OAuth clients are configured for specific Supabase projects - creating a new DB branch
> will break authentication entirely. Always use the existing staging database for all preview deployments.

> **IMPORTANT: NO AUTO-MERGE**
>
> This skill creates PRs but **NEVER merges them automatically**.
> All PR reviews and merges are done by Beton engineers manually.
> Claude should only create PRs and report the PR URL.

## Quick Workflow

When the user says `/deploy`, execute this workflow:

### Step 1: Build Locally (MANDATORY)

```bash
cd frontend-nextjs && npm run build
```

**Do NOT proceed if the build fails.** Fix any TypeScript errors first.

### Step 2: Stage Changes

```bash
# Stage all changes except local config
git add -A
git reset HEAD -- .claude/ node_modules/ .env.local

# Show what will be committed
git status --short
```

### Step 3: Create Commit

```bash
# Get recent commit style
git log --oneline -3

# Commit with descriptive message (always include Co-Authored-By)
git commit -m "$(cat <<'EOF'
<type>: <description>

<optional body>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

Commit types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`

### Step 4: Push to Remote

```bash
git push origin <current-branch>
```

### Step 5: Verify Vercel Deployment

```bash
# List recent deployments
npx vercel ls --scope getbeton 2>&1 | head -20

# The most recent "Preview" deployment should show "● Ready"
# If it shows "● Building", wait and check again
```

### Step 6: Inspect Deployment (if needed)

```bash
# Get details on a specific deployment
npx vercel inspect <deployment-url> --scope getbeton
```

---

## Full Deployment Paths

### Feature → Staging

**When**: You've finished a feature and want to create a PR to staging.

```bash
# 1. Ensure build passes
cd frontend-nextjs && npm run build

# 2. Push your branch
git push origin feature/my-feature

# 3. Verify Vercel preview is Ready
npx vercel ls --scope getbeton

# 4. Create PR to staging
gh pr create --base staging --title "feat: My Feature" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Test plan
- [ ] Tested locally with `npm run build`
- [ ] Verified API endpoints work
- [ ] Checked UI in browser

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# 5. Wait for CI to pass
gh pr checks

# 6. Report PR URL to user
# STOP HERE - DO NOT MERGE
# Beton engineers will review and merge manually
```

#### Step 7: Generate Documentation (for epic branches)

**IMPORTANT:** If this is a PR for an epic (branch name contains epic ID like `BETON-XX`), generate product documentation:

```
/document-task <EPIC-ID>
```

This will:
- Analyze all changes in the feature branch
- Generate comprehensive documentation (architecture, API, database, etc.)
- Publish to Plane's wiki for team reference

The documentation helps reviewers understand the full scope of changes and serves as living documentation for the feature.

### Staging → Production

**When**: Staging is tested and ready for production.

```bash
# 1. Create PR from staging to main
gh pr create --base main --head staging --title "Release: <version>" --body "$(cat <<'EOF'
## Changes
- Feature 1
- Feature 2

## Testing
- [x] Tested on staging
- [x] Vercel preview passed

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# 2. Report PR URL to user
# STOP HERE - DO NOT MERGE
# Beton engineers will review and merge manually
```

---

## CI Requirements

| Check | What it does |
|-------|--------------|
| `nextjs-ci` | Type-check, lint, build |

### Pre-push validation (local)

```bash
cd frontend-nextjs
npm run build      # Must pass
npm run lint       # Check for issues
npx tsc --noEmit   # Type check
```

---

## Vercel Deployment Status

| Status | Meaning |
|--------|---------|
| ● Ready | Deployment succeeded |
| ● Building | Still building |
| ● Error | Build failed - check logs |
| ● Queued | Waiting to build |

### Check build logs

```bash
npx vercel logs <deployment-url> --scope getbeton
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build failing | Run `npm run build` locally first |
| Deployment stuck | Check Vercel dashboard |
| Wrong branch deployed | Verify git branch before push |
| Cron not running | Check `vercel.json` cron config |
| TypeScript errors | Run `npx tsc --noEmit` to see all errors |

---

## Quick Commands

```bash
# Check deployment status
npx vercel ls --scope getbeton

# Inspect specific deployment
npx vercel inspect <url> --scope getbeton

# View build logs
npx vercel logs <url> --scope getbeton

# Create PR
gh pr create --base staging --title "feat: description"

# Check PR status
gh pr checks
```

## Related Skills

| Skill | When to Use |
|-------|-------------|
| `/document-task <ID>` | Generate product documentation for an epic when opening PR to staging |
| `/implement-task <ID>` | Implement a complete epic from Plane |
| `/troubleshoot` | Debug deployment or build issues |
