---
name: document-task
description: Generate product documentation for an epic and publish to Plane wiki. Use when opening a PR to staging branch or after completing epic implementation.
---

# /document-task - Generate Epic Documentation

Use this skill to automatically generate comprehensive product documentation for a completed task and publish it to Plane's wiki. This skill should be invoked when:

- A PR is opened to the `staging` branch
- The task implementation is complete

## Usage

```
/document-task <EPIC-ID>
```

Example: `/document-task BETON-75` or `/document-task INSP-42`

---

## Understanding Epics in Plane

Epics are a **distinct entity type** in Plane, separate from regular work items:

- **No dedicated MCP tools**: The Plane MCP server has no epic-specific tools — use `work_item` tools instead
- **Shared identifiers**: `retrieve_work_item_by_identifier` works for epics because they share the identifier scheme (e.g., `BETON-42`)
- **`is_epic` flag**: Work item types have an `is_epic: boolean` field to distinguish epic types
- **Project setting**: Epics must be enabled per-project in Plane settings

If `retrieve_work_item_by_identifier` returns unexpected results for an epic, use `list_work_item_types` to verify the epic type exists (look for `is_epic: true`).

---

## Workflow

### Phase 1: Gather Implementation Details

#### Step 1.1: Identify the Branch

```bash
# Find the feature branch for this epic
git branch -a | grep -i "<EPIC-ID>"

# Get the branch name
BRANCH_NAME=$(git branch -a | grep -i "<EPIC-ID>" | head -1 | xargs)
```

#### Step 1.2: Analyze Commits

```bash
# Get all commits in this epic's branch
git log origin/staging..origin/$BRANCH_NAME --oneline

# Get detailed commit messages for context
git log origin/staging..origin/$BRANCH_NAME --pretty=format:"%h %s"
```

#### Step 1.3: Analyze Changed Files

```bash
# Get summary of all changes
git diff origin/staging..origin/$BRANCH_NAME --stat

# Categorize changes by type
git diff origin/staging..origin/$BRANCH_NAME --stat | grep -E "\.(ts|tsx)$"
```

#### Step 1.4: Read Key Implementation Files

Based on the changed files, read the most important ones:

- **Database migrations**: `supabase/migrations/*.sql`
- **API routes**: `src/app/api/**/*.ts`
- **Services**: `src/lib/**/*.ts`
- **Components**: `src/components/**/*.tsx`
- **Configuration**: `vercel.json`, environment variables

Use the `Read` tool to examine each key file and understand:
- What functionality was added
- How components interact
- Data models and schemas
- API contracts

#### Step 1.5: Fetch task from Plane

```
mcp__plane__retrieve_work_item_by_identifier:
  - project_identifier: <PROJECT> (e.g., "BETON")
  - sequence_id: <NUMBER> (e.g., "75")
```


---

### Phase 2: Structure the Documentation

Create documentation with these sections:

#### Required Sections

1. **Overview**
   - What the feature does (1-2 paragraphs)
   - Key capabilities (bullet list)
   - Target users/use cases

2. **Architecture**
   - System diagram (mermaid chart)
   - Component relationships
   - Data flow

3. **Database Schema** (if applicable)
   - New tables with columns
   - Relationships and constraints
   - RLS policies

4. **User Flows**
   - Step-by-step workflows
   - Decision points
   - Edge cases

5. **API Reference** (if applicable)
   - Endpoints with methods
   - Request/response schemas
   - Authentication requirements

6. **Configuration**
   - Environment variables
   - Feature flags
   - Default values

7. **UI Components** (if applicable)
   - Component descriptions
   - Props and states
   - User interactions

8. **Testing**
   - Test scenarios
   - Test data/fixtures
   - Manual testing steps

9. **Deployment**
   - Required setup steps
   - Environment-specific notes
   - Rollback procedures

10. **Known Limitations**
    - Current constraints
    - Future improvements
    - Edge cases

---

### Phase 3: Generate HTML Content

Format the documentation as HTML for Plane's wiki. Use this structure:

```html
<h1>Feature Name - Product Documentation</h1>

<p><strong>Epic:</strong> BETON-XX | <strong>Status:</strong> Implemented | <strong>Branch:</strong> <code>feature/BETON-XX-name</code></p>

<hr>

<h2>Overview</h2>
<p>Description here...</p>

<h3>Key Features</h3>
<ul>
  <li><strong>Feature 1:</strong> Description</li>
  <li><strong>Feature 2:</strong> Description</li>
</ul>

<!-- Continue with other sections... -->
```

#### HTML Formatting Guidelines

- Use `<h2>` for main sections
- Use `<h3>` for subsections
- Use `<code>` for inline code
- Use `<pre><code>` for code blocks
- Use `<table>` for structured data
- Use `<ul>/<ol>` for lists
- Use `<strong>` for emphasis
- Use `<hr>` between major sections

---

### Phase 4: Publish to Plane Wiki

#### Step 4.1: Create Workspace Page

Use the Plane MCP tool:

```
mcp__plane__create_workspace_page:
  - name: "<EPIC-ID>: <Feature Name> - Product Documentation"
  - description_html: "<full HTML content>"
```

#### Step 4.2: Verify Creation

Check that the page was created successfully and note the page ID.

#### Step 4.3: Report to User

Tell the user:
- Documentation page was created
- Page name, ID and URL
- Summary of sections included

## Checklist

- [ ] Identified feature branch and analyzed commits
- [ ] Read and understood key implementation files
- [ ] Fetched epic details from Plane
- [ ] Created Overview section
- [ ] Created Architecture section (with diagram)
- [ ] Documented Database Schema (if applicable)
- [ ] Documented User Flows
- [ ] Created API Reference (if applicable)
- [ ] Listed Configuration/Environment Variables
- [ ] Documented UI Components (if applicable)
- [ ] Added Testing section
- [ ] Added Deployment notes
- [ ] Listed Known Limitations
- [ ] Generated valid HTML content
- [ ] Published to Plane wiki via MCP
- [ ] Reported success to user

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't find branch | Check `git branch -a` for exact name |
| MCP tool fails | Verify Plane connection with `/mcp` |
| HTML rendering issues | Validate HTML structure, escape special chars |
| Missing files | Use `git diff --stat` to find all changes |
| Epic not found | Verify project identifier and sequence ID |
| Epic fetch returns unexpected data | Verify epics are enabled in project settings; use `list_work_item_types` to check for types with `is_epic: true` |

---

## Notes

- **Always analyze the actual code** - Don't document what you think was built, document what was actually implemented
- **Keep it concise** - Focus on information developers need
- **Include examples** - Code samples and request/response examples help understanding
- **Update when needed** - Documentation should be updated if implementation changes
- **Reference the epic** - Always link back to the original Plane work item
