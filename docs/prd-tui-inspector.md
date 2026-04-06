# PRD: Inspector TUI (Terminal User Interface)

## Overview

A terminal-based interface for Beton Inspector that brings signal detection, account scoring, and integration management to the command line. The TUI targets power users, developers, and operators who prefer keyboard-driven workflows over browser-based dashboards.

## Problem Statement

Inspector's web dashboard requires a browser, authentication flow, and full page loads to check signals, review accounts, or manage integrations. For operators who live in the terminal -- running deploys, tailing logs, debugging production -- context-switching to a browser breaks flow. A TUI provides instant access to Inspector's core data without leaving the terminal.

Additionally, a TUI enables:
- **Headless environments**: SSH sessions, CI pipelines, remote servers
- **Scriptability**: Pipe Inspector data into other CLI tools (`jq`, `grep`, `awk`)
- **Speed**: No browser overhead, instant startup, keyboard-only navigation
- **Automation**: Compose Inspector operations into shell scripts and cron jobs

## Target Users

1. **RevOps engineers** who manage signal configuration and monitor account health daily
2. **Developers** integrating Inspector into deployment pipelines or debugging signal detection
3. **Founders/operators** who want a quick glance at key metrics without opening a browser

## Design Principles

1. **Terminal-native**: Respect terminal conventions (vim keybindings, piping, exit codes)
2. **Information density**: Show more data per screen than the web UI can
3. **Progressive disclosure**: Summary views first, drill down on demand
4. **Offline-friendly**: Cache last-known state, show stale data with timestamps
5. **Composable**: Every view's data available as JSON via `--json` flag for scripting

---

## Feature Specification

### F1: Dashboard Overview (default view)

The landing screen when launching `beton` with no arguments.

**Layout:**
```
 Inspector v0.1.0                           workspace: acme-corp
 ──────────────────────────────────────────────────────────────────
 SIGNALS          ACCOUNTS         INTEGRATIONS       BILLING
 ┌────────────┐  ┌────────────┐  ┌────────────────┐  ┌──────────┐
 │ Active: 14 │  │ Total: 342 │  │ PostHog    [*] │  │ Pro Plan │
 │ Avg Lift:  │  │ Healthy:   │  │ Attio      [*] │  │ MTU: 847 │
 │   2.4x     │  │   281      │  │ Firecrawl  [ ] │  │ /1000    │
 │ Leads/mo:  │  │ At Risk:   │  │ MCP sess:  2   │  └──────────┘
 │   47       │  │   61       │  └────────────────┘
 │ Est ARR:   │  │ Churned: 0 │
 │   $284K    │  │            │
 └────────────┘  └────────────┘

 RECENT SIGNALS (last 7d)                              [r]efresh
 ──────────────────────────────────────────────────────────────────
  Signal Name              Lift   Conf   Leads   Status
  ─────────────────────────────────────────────────────────────
  heavy-api-usage          3.2x   94%    12      active
  dashboard-power-user     2.8x   89%     8      active
  multi-seat-expansion     2.1x   76%     6      active
  billing-page-visit       1.9x   82%    11      active
  api-key-created          1.7x   71%     5      draft
  ...
 ──────────────────────────────────────────────────────────────────
 [s]ignals  [a]ccounts  [i]ntegrations  [m]emory  mc[p]  [k]eys  se[t]tings  [q]uit
```

**Data source:** `/api/signals`, `/api/billing/status`, dashboard metrics endpoint

**Interactions:**
- `s` / `1` - Navigate to Signals list
- `a` / `2` - Navigate to Accounts list
- `i` / `3` - Navigate to Integrations
- `m` / `4` - Navigate to Memory/Exploration logs
- `p` / `5` - Navigate to MCP sessions
- `k` / `6` - Navigate to API keys
- `t` / `7` - Navigate to Settings
- `r` - Refresh all data
- `q` / `Ctrl+C` - Quit
- `?` - Show help overlay

---

### F2: Signals List & Detail

#### Signals List View

```
 Signals (14 active, 3 draft)                    [/]search [f]ilter
 ──────────────────────────────────────────────────────────────────
  #  Signal Name              Source  Lift   Conf   Leads  Status
  ── ──────────────────────── ────── ────── ────── ────── ────────
  1  heavy-api-usage          auto    3.2x   94%    12    active
  2  dashboard-power-user     auto    2.8x   89%     8    active
  3  multi-seat-expansion     auto    2.1x   76%     6    active
  4  billing-page-visit       custom  1.9x   82%    11    active
  5  api-key-created          custom  1.7x   71%     5    draft
  6  invite-sent              auto    1.5x   68%     4    active
  7  export-csv               auto    1.3x   63%     3    active
  ...

 ──────────────────────────────────────────────────────────────────
 [enter] detail  [n]ew signal  [d]elete  [e]xport CSV  [Esc] back
```

**Filtering (activated by `f`):**
- Status: all / active / inactive / draft
- Source: all / auto / custom
- Min lift threshold (number input)
- Min confidence threshold (number input)

**Sorting:** Arrow keys on column headers or `o` to cycle sort field

#### Signal Detail View

```
 Signal: heavy-api-usage                          [Esc] back
 ──────────────────────────────────────────────────────────────────
 Status: active    Source: auto    Created: 2026-03-15

 METRICS
 ┌──────────────┬──────────────┬──────────────┬──────────────┐
 │ Matches (90d)│ Last 30d     │ Last 7d      │ Lift         │
 │     127      │     42       │     12       │    3.2x      │
 ├──────────────┼──────────────┼──────────────┼──────────────┤
 │ Confidence   │ Leads/mo     │ ARR Impact   │ Trend 30d    │
 │    94%       │     12       │   $72K       │     +8%      │
 └──────────────┴──────────────┴──────────────┴──────────────┘

 CONVERSION COMPARISON
  With Signal:    38.2% (48/127 converted)   ████████████████░░░░
  Without Signal:  11.9% (89/752 converted)  █████░░░░░░░░░░░░░░

 DEFINITION
  Event:     api_request
  Condition: count >= 50 in last 7 days

 TREND (last 6 months)
  Mar ████████████████████████  42
  Feb ██████████████████████    38
  Jan ████████████████████      34
  Dec ██████████████████        31
  Nov ████████████████          28
  Oct ██████████████            25

 [a]ctivate/deactivate  [d]elete  [r]efresh
```

---

### F3: Accounts & Identities

The codebase distinguishes between **accounts** (companies with ARR, plan, health scores) and **identities** (individual users/contacts within an account). The TUI exposes both via sub-commands: `beton accounts` and `beton identities`.

#### Accounts List View

```
 Accounts (342 total)                        [/]search [f]ilter
 ──────────────────────────────────────────────────────────────────
  Account           ARR      Health  Expansion  Churn   Grade  Status
  ───────────────── ──────── ─────── ────────── ─────── ────── ──────
  Acme Corp          $48K      92       78        12     M100  active
  Widgets Inc        $24K      87       65        18     M100  active
  BigCo              $96K      76       42        35     M75   active
  Startup XYZ         $6K      71       81        22     M75   trial
  Legacy Ltd         $12K      34       15        72     M25   active
  ...

 ──────────────────────────────────────────────────────────────────
 Page 1/12  [n]ext page  [p]rev page  [enter] detail  [Esc] back
```

**Stats bar at top:**
```
 Total: 342  |  Active: 281  |  Trial: 18  |  Churned: 43
```

**Filtering (activated by `f`):**
- Status: all / active / trial / churned
- Min health score threshold
- Text search across name, domain

**Sorting:** `o` to cycle: Health / Expansion / Churn Risk / ARR / Name

#### Account Detail View

```
 Account: Acme Corp                                    [Esc] back
 ──────────────────────────────────────────────────────────────────
 Domain: acme.co    ARR: $48K    Plan: Pro    Status: active

 SCORES                                        Grade: M100
 ┌──────────────┬──────────────┬──────────────┐
 │ Health       │ Expansion    │ Churn Risk   │
 │     92       │     78       │     12       │
 │ ████████████ │ █████████░░░ │ ██░░░░░░░░░░ │
 └──────────────┴──────────────┴──────────────┘

 CONTRIBUTING SIGNALS
  Signal                   Category      Weight   Recency
  ──────────────────────── ──────────── ──────── ─────────
  heavy-api-usage          expansion     +12      2d ago
  multi-seat-expansion     expansion      +8      5d ago
  dashboard-power-user     health        +15      1d ago
  invite-sent              expansion      +6      3d ago

 CONTACTS (4)
  jane@acme.co (Admin)    bob@acme.co (Developer)
  sarah@acme.co (Owner)   dev@acme.co (Viewer)

 [r]efresh  [i]dentities (full list)
```

#### Identities List View

```
 Identities (847 total)                      [/]search [f]ilter
 ──────────────────────────────────────────────────────────────────
  Identity              Company          Score  Events  Signals  Status
  ───────────────────── ──────────────── ────── ─────── ──────── ──────
  jane@acme.co          Acme Corp (50)    92    1,247      4    active
  bob@widgets.io        Widgets Inc (12)  87      834      3    active
  sarah@bigco.com       BigCo (200)       76      421      2    active
  dev@startup.xyz       Startup (5)       71      312      2    new
  admin@legacy.net      Legacy Ltd (30)   34       45      1    churned
  ...

 ──────────────────────────────────────────────────────────────────
 Page 1/28  [n]ext  [p]rev  Sort: [S]core [E]vents [L]ast Seen  [Esc] back
```

**Filtering (activated by `f`):**
- Status: all / active / new / churned
- Min score threshold
- Text search across name, email, company

**Pagination:** All list views use cursor-based pagination. 30 rows per page by default, configurable via `--page-size` in CLI mode or `[display] page_size` in config.

---

### F4: Integration Management

```
 Integrations                                          [Esc] back
 ──────────────────────────────────────────────────────────────────

 DATA SOURCES
  PostHog        [connected]    API Key: ****7f2a  Project: 12345
                                Last sync: 2h ago
                                [t]est  [u]pdate  [d]isconnect

 CRM
  Attio          [connected]    API Key: ****3b1c
                                Last sync: 45m ago
                                [t]est  [u]pdate  [d]isconnect

 WEB SCRAPING
  Firecrawl      [not connected]
                                [c]onfigure

 ──────────────────────────────────────────────────────────────────
 Navigate with arrow keys. Press letter keys for actions.
```

**Configure/Update flow:**
- Inline form within the TUI (text inputs for API key, project ID, etc.)
- Self-hosted toggle for PostHog/Firecrawl
- Test connection with spinner and pass/fail result
- Disconnect with confirmation prompt

---

### F5: Memory / Exploration Logs

```
 Memory                                                [Esc] back
 ──────────────────────────────────────────────────────────────────
 [1] Logs  [2] Business Model  [3] DB Structure  [4] Scraping  [5] Queries

 EXPLORATION RUNS
  Status     Session ID    Agent       Tables   Started          Duration
  ────────── ───────────── ─────────── ──────── ──────────────── ────────
  completed  sess_a1b2c3   discovery    12      2026-04-05 14:00  3m 42s
  completed  sess_d4e5f6   enrichment    8      2026-04-05 10:00  2m 15s
  failed     sess_g7h8i9   discovery    --      2026-04-04 22:00  0m 30s
  running    sess_j0k1l2   scraper       3      2026-04-06 09:00  1m 12s
  ...

 [enter] view details  [r]efresh
```

Sub-views (Business Model, DB Structure, Scraping, Queries) follow the same pattern as their web counterparts but rendered as scrollable text panels with syntax highlighting for SQL queries and JSON data.

---

### F6: Signal Creation (Interactive)

```
 New Signal                                            [Esc] cancel
 ──────────────────────────────────────────────────────────────────

 Name:        [________________________________]
 Description: [________________________________]

 Events (type to search, Tab to select):
  > [page_view                    ]
    [x] api_request
    [x] dashboard_viewed
    [ ] feature_flag_called
    [ ] invite_sent

 Condition:
  Operator: [>=]   Value: [5]   Window: [7] days

  Summary: Users who triggered api_request, dashboard_viewed
           >= 5 times in the last 7 days

 ──────────────────────────────────────────────────────────────────
 [Tab] next field  [p]review matches  [Enter] create  [Esc] cancel
```

**Preview matches** shows an inline table of matching users (same as web preview), with option to create PostHog cohort or Attio list via follow-up prompts.

---

### F7: CLI Mode (Non-Interactive)

For scripting and pipelines, every TUI view has a CLI equivalent:

```bash
# List signals as JSON
beton signals --json

# Get single signal detail
beton signals show heavy-api-usage --json

# Filter signals
beton signals --status=active --min-lift=2.0 --json

# List identities
beton identities --status=active --min-score=80 --json

# Check integration status
beton integrations --json

# Dashboard summary
beton dashboard --json

# Create a signal
beton signals create \
  --name "high-api-usage" \
  --event "api_request" \
  --operator ">=" \
  --value 50 \
  --window 7

# Export signals to CSV
beton signals export --output signals.csv

# Preview signal matches
beton signals preview \
  --event "api_request" \
  --operator ">=" \
  --value 50 \
  --window 7

# Trigger signal detection sync
beton sync signals

# Test integration connection
beton integrations test posthog

# Configure integration
beton integrations configure posthog \
  --api-key "phx_..." \
  --project-id "12345"

# Manage API keys
beton keys list
beton keys create --name "ci-pipeline"
beton keys revoke <key-id>

# MCP session status
beton mcp sessions --json
beton mcp logs --session <session-id>
```

**JSON output contract:**
All `--json` output follows a consistent envelope:
```json
{
  "data": [...],
  "meta": { "total": 342, "page": 1, "page_size": 30, "has_next": true }
}
```
Single-resource commands (e.g., `beton signals show <id> --json`) omit `meta` and return `"data": {...}` directly. Error responses use `{"error": {"code": 3, "message": "..."}}` matching the exit code.

**Exit codes:**
- `0` - Success
- `1` - General error
- `2` - Authentication failure
- `3` - Connection error (API unreachable)
- `4` - Resource not found

**Piping support:**
```bash
# Find high-lift active signals and post to Slack
beton signals --json --status=active --min-lift=2.5 \
  | jq '.[] | "\(.name): \(.lift)x lift, \(.leads_per_month) leads/mo"' \
  | slack-notify --channel=#revops

# Export churned identities for outreach
beton identities --json --status=churned --min-score=50 \
  | jq -r '.[] | [.email, .company, .score] | @csv' \
  > outreach-list.csv

# Health check in CI
beton integrations test posthog || echo "PostHog connection failed"

# Per-workspace override without switching default
beton --workspace=other-corp signals --json
```

---

### F8: MCP Sessions

View and monitor Model Context Protocol sessions from AI tools (e.g., Claude Code) connected to Inspector.

```
 MCP Sessions                                          [Esc] back
 ──────────────────────────────────────────────────────────────────

 ACTIVE SESSIONS
  Client App       Session ID     Status    Last Activity   Requests
  ──────────────── ────────────── ───────── ─────────────── ────────
  Claude Code      sess_mcp_a1b2  active    2m ago              47
  Custom Agent     sess_mcp_c3d4  active    15m ago             12

 RECENT SESSIONS
  Client App       Session ID     Status    Duration        Requests
  ──────────────── ────────────── ───────── ─────────────── ────────
  Claude Code      sess_mcp_e5f6  closed    1h 23m              89
  Claude Code      sess_mcp_g7h8  closed    45m                 34

 ──────────────────────────────────────────────────────────────────
 [enter] view logs  [r]efresh  Page 1/3  [n]ext  [p]rev
```

**Session Log Detail:**
```
 Session: sess_mcp_a1b2 (Claude Code)                  [Esc] back
 ──────────────────────────────────────────────────────────────────
 Status: active    Started: 2026-04-06 09:15    Requests: 47

 RECENT REQUESTS
  Time       Tool                    Status  Duration
  ────────── ─────────────────────── ─────── ────────
  09:42:15   list_signals            200     120ms
  09:41:03   get_account_scores      200     85ms
  09:40:22   get_dashboard_metrics   200     210ms
  09:39:15   list_accounts           200     150ms
  09:38:00   get_workspace           200     45ms
  ...

 [enter] view request/response detail  [r]efresh
```

---

### F9: API Key Management

Create and manage API keys used for TUI authentication, CI pipelines, and MCP connections.

```
 API Keys                                              [Esc] back
 ──────────────────────────────────────────────────────────────────

  Name             Key Prefix       Created          Last Used
  ──────────────── ──────────────── ──────────────── ──────────────
  ci-pipeline      beton_a1b2****   2026-03-15       2h ago
  local-dev        beton_c3d4****   2026-03-20       5m ago
  mcp-claude       beton_e5f6****   2026-04-01       12m ago

 ──────────────────────────────────────────────────────────────────
 [c]reate new key  [d]elete key  [Esc] back
```

**Create flow:** Prompts for key name, generates key, displays full key once (never shown again), confirms storage.

---

## Authentication & Configuration

### Config File

`~/.beton/config.toml`:
```toml
[auth]
# API key for headless/CI usage
api_key = "beton_..."

# Or Supabase session token (auto-managed by `beton login`)
# session_token = "..."

[workspace]
# Default workspace slug
default = "acme-corp"

[display]
# Color theme: "dark" | "light" | "auto"
theme = "auto"
# Date format: "relative" | "iso" | "local"
date_format = "relative"
# Refresh interval in seconds (0 = manual only)
auto_refresh = 30

[api]
# Inspector API base URL (for self-hosted)
base_url = "https://app.getbeton.com"

[global]
# Override workspace per-command with --workspace flag
# e.g., beton --workspace=other-corp signals
```

### Login Flow

```bash
# Interactive login (opens browser for OAuth)
beton login

# API key auth (for CI/headless)
beton login --api-key "beton_..."

# Check auth status
beton whoami

# Switch workspace
beton workspace use acme-corp

# Logout
beton logout
```

---

## Technical Architecture

### Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Node.js (same as Inspector backend) | Share types, API clients, and business logic with existing codebase |
| TUI framework | [Ink 4+](https://github.com/vadimdemedes/ink) (React for CLI) | Familiar React paradigm, reuse component patterns from web UI |
| CLI parsing | Commander.js or yargs | Mature, well-documented, supports subcommands |
| Terminal rendering | Ink built-ins + ink-table, ink-spinner | Rich terminal UI components |
| HTTP client | Existing `APIClient` from `lib/api/client.ts` | Reuse typed fetch wrappers |
| Config | cosmiconfig + TOML | Standard config file resolution |
| Credentials | Encrypted file at `~/.beton/credentials` | Portable, no native dependencies (keytar is deprecated) |

> **Note:** Ink 4+ is ESM-only. The CLI entry point must use ESM module resolution. Since the existing Next.js project supports ESM, shared types can be imported directly. The CLI build pipeline (e.g., `tsup` or `esbuild`) should produce an ESM bundle with a `#!/usr/bin/env node` shebang.

### Project Structure

```
src/
├── cli/
│   ├── index.ts              # Entry point, CLI argument parsing
│   ├── commands/
│   │   ├── dashboard.ts      # Default TUI view
│   │   ├── signals.ts        # Signals list/detail/create/export
│   │   ├── accounts.ts       # Accounts list/detail with scoring
│   │   ├── identities.ts     # Identities list
│   │   ├── integrations.ts   # Integration management
│   │   ├── memory.ts         # Exploration logs
│   │   ├── mcp.ts            # MCP session viewer
│   │   ├── keys.ts           # API key management
│   │   ├── sync.ts           # Trigger sync operations
│   │   ├── login.ts          # Authentication
│   │   └── workspace.ts      # Workspace switching
│   ├── components/
│   │   ├── Dashboard.tsx      # Ink component: dashboard layout
│   │   ├── SignalsList.tsx    # Ink component: signals table
│   │   ├── SignalDetail.tsx   # Ink component: signal detail view
│   │   ├── AccountsList.tsx    # Ink component: accounts table
│   │   ├── AccountDetail.tsx   # Ink component: account scoring detail
│   │   ├── IdentitiesList.tsx  # Ink component: identities table
│   │   ├── McpSessions.tsx     # Ink component: MCP session viewer
│   │   ├── ApiKeys.tsx         # Ink component: API key management
│   │   ├── IntegrationCard.tsx
│   │   ├── FilterBar.tsx
│   │   ├── MetricCard.tsx
│   │   ├── Table.tsx          # Generic sortable/filterable table
│   │   ├── Spinner.tsx
│   │   └── StatusBadge.tsx
│   ├── hooks/
│   │   ├── useSignals.ts     # Data fetching (wraps existing API)
│   │   ├── useIdentities.ts
│   │   ├── useIntegrations.ts
│   │   └── useKeyboard.ts    # Keyboard navigation
│   ├── lib/
│   │   ├── api-client.ts     # HTTP client (reuses lib/api/ types)
│   │   ├── config.ts         # Config file management
│   │   ├── auth.ts           # Token management
│   │   └── cache.ts          # Local data cache for offline
│   └── utils/
│       ├── format.ts         # Number/date/currency formatting
│       ├── colors.ts         # Terminal color palette
│       └── json-output.ts    # --json flag handling
```

### Shared Code with Web App

The TUI reuses the following from the existing codebase:
- **TypeScript types** (`Signal`, `Identity`, `Integration`, etc.)
- **API response shapes** (same endpoints, same data contracts)
- **Business logic** (score thresholds, grade mappings, signal definitions)
- **Constants** (integration names, status values, etc.)

### Data Flow

```
CLI args / keyboard input
        │
        ▼
  Command Router (commander.js)
        │
        ├── --json flag? ──► Non-interactive: fetch, format, stdout, exit
        │
        └── Interactive ──► Ink React app
                              │
                              ▼
                         Ink Components
                              │
                              ▼
                         API Client (HTTP)
                              │
                              ▼
                    Inspector API (same as web)
                              │
                              ▼
                      PostgreSQL (Supabase)
```

---

## Milestones

### M1: Foundation (Week 1-2)
- CLI skeleton with commander.js, ESM build pipeline (tsup/esbuild)
- Auth flow (`beton login`, `beton whoami`, encrypted credential storage)
- Config file management (`~/.beton/config.toml`)
- API client with auth header injection and `--workspace` global flag
- `--json` output mode with consistent envelope for all commands
- `beton dashboard` (non-interactive, prints summary)

### M2: Read-Only TUI (Week 3-4)
- Ink-based interactive dashboard
- Signals list with filtering/sorting and pagination
- Signal detail view with metrics and ASCII charts
- Accounts list with health/expansion/churn scores and concrete grades
- Account detail view with score breakdown and contributing signals
- Identities list with filtering
- Keyboard navigation system
- Auto-refresh

### M3: Write Operations & Management (Week 5-6)
- Signal creation wizard (interactive)
- Integration configure/test/disconnect
- Signal activate/deactivate/delete
- API key management (create, list, revoke)
- Export to CSV
- Trigger sync operations

### M4: Advanced Features (Week 7-8)
- MCP session viewer with request logs
- Memory/exploration logs viewer
- Offline cache with stale data indicators
- Watch mode (`beton watch signals` -- live updating view)
- Shell completions (bash, zsh, fish)
- `beton` as an npm global package / standalone binary (via `bun compile` or `pkg`)

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Startup time | < 500ms to first render | Benchmark on M1 MacBook |
| CLI command latency | < 1s for `--json` output | Time from invocation to stdout |
| Adoption | 20% of active users use TUI weekly | Analytics on API key auth usage |
| NPS from power users | > 50 | Survey after 30 days |

## Non-Goals (v1)

- **Mobile terminal support** -- Assumes 80+ column width terminals
- **Real-time streaming** -- Polling-based refresh, not WebSocket
- **Full parity with web UI** -- Setup wizard and billing management stay web-only
- **Plugin system** -- No extensibility API in v1
- **GUI terminal emulator features** -- No mouse support beyond basic click (focus on keyboard)

## Open Questions

1. **Package distribution**: npm global install vs. standalone binary (via `bun compile` or `pkg`)? Standalone is better for non-Node environments but adds build complexity.
2. **API key scoping**: Should TUI API keys have different permission levels (read-only vs. full access)?
3. **Notification support**: Should `beton watch` support desktop notifications (via `node-notifier`) for critical signals?
4. **MCP tool invocation from TUI**: Should the TUI allow directly invoking MCP tools (e.g., `beton mcp call list_signals`), effectively making it an MCP client as well as the web app being an MCP server?
