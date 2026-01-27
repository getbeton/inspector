---
name: implement-epic
description: Implement a complete Plane epic by reading tasks, understanding dependencies, and coding sequentially. Use when working on a full epic or multi-task feature.
---

# /implement-epic - Implement Plane Epic End-to-End

Use this skill to implement a complete epic from Plane. This workflow reads the epic, analyzes dependencies between subtasks, implements them sequentially, and opens a PR when done.

## Usage

```
/implement-epic <EPIC-ID>
```

Example: `/implement-epic BETON-42` or `/implement-epic INSP-15`

---

## Understanding Epics in Plane

Epics are a **distinct entity type** in Plane, separate from regular work items. This has important implications when using MCP tools:

- **Separate API**: Epics use `/workspaces/{slug}/projects/{id}/epics/`, not the work items endpoint
- **`is_epic` flag**: Work item types have an `is_epic: boolean` field — types with `is_epic: true` are epic types
- **No dedicated MCP tools**: The Plane MCP server exposes NO epic-specific tools (no `list_epics`, `retrieve_epic`, etc.)
- **Shared identifier scheme**: Epics share the same identifier format (e.g., `BETON-42`), so `retrieve_work_item_by_identifier` works for fetching them
- **Parent-child via `parent` field**: Work items belong to an epic by setting their `parent` field to the epic's UUID
- **Project setting**: Epics must be enabled per-project in Plane settings

### Working with Epics via MCP Tools

Since there are no dedicated epic MCP tools, use these workarounds:

| Action | MCP Tool to Use | Notes |
|--------|----------------|-------|
| Fetch an epic | `retrieve_work_item_by_identifier` | Works because epics share the identifier scheme |
| Update an epic | `update_work_item` | Works for updating description, status, etc. |
| List epic subtasks | `list_work_items` with `parent_id` | Pass the epic's UUID as `parent_id` |
| Verify epic type | `list_work_item_types` | Look for types where `is_epic: true` |

If `retrieve_work_item_by_identifier` fails for an epic, verify that epics are enabled in the project settings and use `list_work_item_types` to confirm the epic type exists.

---

## Workflow

### Phase 1: Epic Discovery

#### Step 1.1: Fetch the Epic

Use the Plane MCP tools to read the epic:

```
mcp__plane__retrieve_work_item_by_identifier:
  - project_identifier: <PROJECT> (e.g., "BETON", "INSP")
  - sequence_id: <NUMBER> (e.g., "42")
```

Read and note:
- Epic title and description
- Acceptance criteria
- Any attachments or linked resources

> **Note:** Epics are a separate entity type in Plane, but `retrieve_work_item_by_identifier` works for them because they share the identifier scheme. If this call returns unexpected results or fails, see the [Understanding Epics in Plane](#understanding-epics-in-plane) section for fallback approaches.

#### Step 1.2: Get All Subtasks

List subtasks that belong to this epic using the `parent_id` filter (primary approach):

```
mcp__plane__list_work_items:
  - project_id: <uuid from epic>
  - parent_id: <epic uuid>
```

If `list_work_items` with `parent_id` doesn't return results, fall back to searching:

```
mcp__plane__search_work_items:
  - project_id: <uuid from epic>
  - search: <epic name or related keywords>
```

Or if the epic has linked issues, fetch each one:

```
mcp__plane__retrieve_work_item_by_identifier for each subtask
```

#### Step 1.3: Read Attachments

If the epic or subtasks have descriptions with links, requirements docs, or Figma designs:
- Use WebFetch to read linked documents
- Note key requirements, API specs, or design decisions

#### Step 1.4: Identify Dependencies

Analyze the subtasks for:
- **Blockers**: Tasks that must complete before others can start
- **Shared code**: Tasks that modify the same files
- **Data dependencies**: Tasks where output feeds into another

Create a dependency order. Example:
```
1. BETON-43: Add database migration (no deps)
2. BETON-44: Create API endpoint (depends on migration)
3. BETON-45: Add frontend form (depends on API)
4. BETON-46: Add tests (depends on all above)
```

---

### Phase 2: Branch Setup

> **⛔ CRITICAL: DO NOT CREATE SUPABASE DATABASE BRANCHES**
>
> Never use `mcp__supabase__create_branch` or create new database branches.
> Google OAuth clients are configured for specific Supabase projects - creating a new DB branch
> will break authentication entirely. All feature branches use the existing **staging** database.

#### Step 2.1: Fetch Latest Staging

```bash
git fetch origin staging
```

#### Step 2.2: Create Feature Branch (Git Only)

Branch naming: `feature/<task-id>-<short-name>`

```bash
git checkout -b feature/<EPIC-ID>-<epic-short-name> origin/staging
```

Example:
```bash
git checkout -b feature/BETON-42-user-dashboard origin/staging
```

Then, publish the branch

```bash
git push origin feature/<EPIC-ID>-<epic-short-name>
```

---

### Phase 3: Sequential Implementation

For EACH task in dependency order:

#### Step 3.1: Read the Task

Fetch full task details:
```
mcp__plane__retrieve_work_item_by_identifier
```

Understand:
- What exactly needs to be built
- Acceptance criteria
- Edge cases mentioned

#### Step 3.2: Ask Clarifying Questions

If anything is unclear, use AskUserQuestion to clarify:
- Architecture decisions
- UI/UX specifics not in the task
- Error handling requirements
- Integration points

**Do NOT proceed with assumptions if the task is ambiguous.**

#### Step 3.3: Implement the Code

Change task status to "In progress" in Plane.

Write the code following Beton's patterns:

- **API Routes**: Place in `frontend-nextjs/src/app/api/`
- **Pages**: Place in `frontend-nextjs/src/app/(dashboard)/`
- **Components**: Place in `frontend-nextjs/src/components/`
- **Business Logic**: Place in `frontend-nextjs/src/lib/`
- **Signal Detectors**: Place in `frontend-nextjs/src/lib/heuristics/signals/detectors/`
- **Integration Clients**: Place in `frontend-nextjs/src/lib/integrations/`
- **Supabase Migrations**: Place in `supabase/migrations/`

Follow existing patterns in the codebase.

#### Step 3.4: Test the Implementation

**For API endpoints:**

Test with curl to verify the endpoint works:

```bash
# Example: Test a GET endpoint
curl -s http://localhost:3000/api/<endpoint> | jq

# Example: Test a POST endpoint
curl -X POST http://localhost:3000/api/<endpoint> \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}' | jq
```

Verify:
- Response status is correct (200, 201, etc.)
- Response body matches expected schema
- Error cases return proper error responses

**For UI components:**

- Verify the page loads without errors in browser
- Check browser console for errors
- Test key user interactions

#### Step 3.5: Build Locally

**MANDATORY before committing:**

```bash
cd frontend-nextjs && npm run build
```

If build fails:
1. Read the error messages carefully
2. Fix TypeScript errors
3. Fix import issues
4. Re-run build until it passes

**Do NOT commit code that fails the build.**

#### Step 3.6: Commit

Use the `/deploy` skill workflow to:
- Stage and commit the changes for this task

Commit message should reference the task ID and provide a URL:
```
feat(<scope>): <task description>

Implements [<TASK-ID>: <task title>](task_url)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

#### Step 3.7: Repeat for Next Task

Move to the next task in dependency order and repeat Steps 3.1-3.6.

---

### Phase 4: Pull Request

Once ALL tasks are complete, push the branch to origin. Then:

#### Step 4.1: Final Build Check

```bash
cd frontend-nextjs && npm run build
```

Ensure entire branch builds cleanly.

#### Step 4.2: Create Pull Request

Use the `/deploy` skill's "Feature → Staging" workflow to:
- Verify Vercel preview deployment
- Create PR to staging branch
- Include all completed task IDs in the PR body

PR body should include:
```markdown
## Summary
Implements epic <EPIC-ID>: <Epic title>

### Tasks Completed
- [x] <TASK-1>: <description>
- [x] <TASK-2>: <description>
- [x] <TASK-3>: <description>

## Test Plan
- [ ] Verified locally with `npm run build`
- [ ] Tested API endpoints with curl
- [ ] Checked UI in browser

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

#### Step 4.3: Generate Product Documentation

**IMPORTANT:** After creating the PR, use the `/document-epic` skill to generate comprehensive product documentation:

```
/document-epic <EPIC-ID>
```

This will:
- Analyze all code changes in the feature branch
- Generate structured documentation with architecture, API reference, etc.
- Publish the documentation to Plane's wiki

The documentation helps reviewers understand the implementation and serves as a reference for future development.

#### Step 4.4: Report Completion

Tell the user:
- PR URL
- Summary of what was implemented
- Documentation page created in Plane wiki
- Any follow-up items or notes for review

> **STOP HERE** - Do NOT merge the PR.
> Beton engineers will review and merge manually.

---

## Checklist

- [ ] Read epic and all subtasks from Plane
- [ ] Identified dependency order
- [ ] Created feature branch from origin/staging
- [ ] For each task:
  - [ ] Read task details
  - [ ] Asked clarifying questions if needed
  - [ ] Implemented code
  - [ ] Tested with curl (if API)
  - [ ] Built locally (must pass)
  - [ ] Used /deploy to commit and push
- [ ] Created PR to staging (via /deploy)
- [ ] Generated documentation (via /document-epic)
- [ ] Reported PR URL and documentation link to user
- [ ] **Did NOT merge** - left for human review

---

## Common Patterns

### Multi-tenant data access

Always filter by workspace:

```typescript
const membership = await getWorkspaceMembership()
const { data } = await supabase
  .from('table')
  .select('*')
  .eq('workspace_id', membership.workspaceId)
```

### API Route Authentication

```typescript
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const membership = await getWorkspaceMembership()
  if (!membership) {
    return NextResponse.json({ error: 'No workspace' }, { status: 404 })
  }

  // ... rest of handler
}
```

### Error Handling

```typescript
try {
  // operation
} catch (error) {
  console.error('Operation failed:', error)
  return NextResponse.json(
    { error: 'Operation failed' },
    { status: 500 }
  )
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Read error, fix TypeScript issues |
| API returns 401 | Check auth headers and Supabase client |
| Curl connection refused | Ensure `npm run dev` is running |
| Push rejected | Pull latest staging, resolve conflicts |
| Task unclear | Ask user with AskUserQuestion |
| RLS violation | Add `.eq('workspace_id', ...)` filter |
| Epic not found via MCP | Verify epics are enabled in project settings; use `list_work_item_types` to check for types with `is_epic: true` |

---

## Notes

- **Do NOT skip the build step** - CI will fail anyway
- **Do NOT batch commits** - commit after each task
- **Do NOT proceed with assumptions** - ask if unclear
- **Do push frequently** - saves progress, enables early feedback
- **Do NOT merge PRs** - only create them, leave merging to humans
