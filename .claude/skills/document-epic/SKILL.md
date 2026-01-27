---
name: document-epic
description: Generate product documentation for an epic and publish to Plane wiki. Use when opening a PR to staging branch or after completing epic implementation.
---

# /document-epic - Generate Epic Documentation

Use this skill to automatically generate comprehensive product documentation for a completed epic and publish it to Plane's wiki. This skill should be invoked when:

- A PR is opened to the `staging` branch
- An epic implementation is complete
- You want to document a feature branch before review

## Usage

```
/document-epic <EPIC-ID>
```

Example: `/document-epic BETON-75` or `/document-epic INSP-42`

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

#### Step 1.5: Fetch Epic from Plane

```
mcp__plane__retrieve_work_item_by_identifier:
  - project_identifier: <PROJECT> (e.g., "BETON")
  - sequence_id: <NUMBER> (e.g., "75")
```

Note the epic's:
- Title and description
- Subtasks and their descriptions
- Acceptance criteria
- Any linked resources

> **Note:** Epics are a separate entity type in Plane, but `retrieve_work_item_by_identifier` works for them because they share the identifier scheme. Additionally:
> - Check the work item type's `is_epic` flag to confirm this is an epic (use `list_work_item_types` if needed)
> - Use `list_work_items` with `parent_id` set to the epic's UUID to find all child work items for comprehensive documentation

---

### Phase 2: Structure the Documentation

Create documentation with these sections:

#### Required Sections

1. **Overview**
   - What the feature does (1-2 paragraphs)
   - Key capabilities (bullet list)
   - Target users/use cases

2. **Architecture**
   - System diagram (ASCII art)
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
- Page name and ID
- Summary of sections included
- Link to view in Plane (if available)

---

## Documentation Templates

### For API Features

Focus on:
- Endpoint specifications
- Authentication flow
- Request/response examples
- Error handling

### For UI Features

Focus on:
- Component hierarchy
- User interactions
- State management
- Accessibility

### For Infrastructure/Backend

Focus on:
- Service architecture
- Data models
- Cron jobs/background tasks
- Monitoring/logging

### For Integrations

Focus on:
- Third-party API usage
- Configuration requirements
- Webhook handling
- Error scenarios

---

## Example Documentation Sections

### Architecture Diagram (ASCII)

```
<pre><code>
┌─────────────────────────────────────────┐
│              Frontend                    │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ Component A │  │ Component B      │  │
│  └─────────────┘  └──────────────────┘  │
└───────────────────────┬─────────────────┘
                        │
┌───────────────────────▼─────────────────┐
│              API Layer                   │
│  /api/endpoint-a    /api/endpoint-b     │
└───────────────────────┬─────────────────┘
                        │
┌───────────────────────▼─────────────────┐
│              Database                    │
│  table_a    table_b    table_c          │
└─────────────────────────────────────────┘
</code></pre>
```

### Database Table

```html
<table>
  <thead>
    <tr><th>Column</th><th>Type</th><th>Description</th></tr>
  </thead>
  <tbody>
    <tr><td><code>id</code></td><td>uuid</td><td>Primary key</td></tr>
    <tr><td><code>name</code></td><td>varchar</td><td>Display name</td></tr>
  </tbody>
</table>
```

### API Endpoint

```html
<h3>POST /api/resource</h3>
<p>Creates a new resource.</p>
<pre><code>Request: { "name": "string", "value": number }
Response: { "id": "uuid", "created_at": "timestamp" }
</code></pre>
```

---

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
- **Reference the epic** - Always link back to the original Plane epic
