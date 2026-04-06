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

The landing screen when launching `inspector` with no arguments.

**Layout:**
```
 Inspector v0.1.0                           workspace: acme-corp
 ──────────────────────────────────────────────────────────────────
 SIGNALS          ACCOUNTS         INTEGRATIONS       BILLING
 ┌────────────┐  ┌────────────┐  ┌────────────────┐  ┌──────────┐
 │ Active: 14 │  │ Total: 342 │  │ PostHog    [*] │  │ Pro Plan │
 │ Avg Lift:  │  │ Healthy:   │  │ Attio      [*] │  │ MTU: 847 │
 │   2.4x     │  │   281      │  │ Firecrawl  [ ] │  │ /1000    │
 │ Leads/mo:  │  │ At Risk:   │  └────────────────┘  └──────────┘
 │   47       │  │   61       │
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
 [s]ignals  [a]ccounts  [i]ntegrations  [m]emory  se[t]tings  [q]uit
```

**Data source:** `/api/signals`, `/api/billing/status`, dashboard metrics endpoint

**Interactions:**
- `s` / `1` - Navigate to Signals list
- `a` / `2` - Navigate to Accounts/Identities list
- `i` / `3` - Navigate to Integrations
- `m` / `4` - Navigate to Memory/Exploration logs
- `t` / `5` - Navigate to Settings
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
- Status: all / active / draft
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

### F3: Identities / Accounts View

```
 Identities (342 total)                      [/]search [f]ilter
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
 Sort: [S]core  [E]vents  [L]ast Seen         [Esc] back
```

**Filtering (activated by `f`):**
- Status: all / active / new / churned
- Min score threshold
- Text search across name, email, company

**Stats bar at top:**
```
 Total: 342  |  Active: 281  |  New (7d): 18  |  Churned: 43
```

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
inspector signals --json

# Get single signal detail
inspector signals show heavy-api-usage --json

# Filter signals
inspector signals --status=active --min-lift=2.0 --json

# List identities
inspector identities --status=active --min-score=80 --json

# Check integration status
inspector integrations --json

# Dashboard summary
inspector dashboard --json

# Create a signal
inspector signals create \
  --name "high-api-usage" \
  --event "api_request" \
  --operator ">=" \
  --value 50 \
  --window 7

# Export signals to CSV
inspector signals export --output signals.csv

# Preview signal matches
inspector signals preview \
  --event "api_request" \
  --operator ">=" \
  --value 50 \
  --window 7

# Trigger signal detection sync
inspector sync signals

# Test integration connection
inspector integrations test posthog

# Configure integration
inspector integrations configure posthog \
  --api-key "phx_..." \
  --project-id "12345"
```

**Exit codes:**
- `0` - Success
- `1` - General error
- `2` - Authentication failure
- `3` - Connection error (API unreachable)
- `4` - Resource not found

**Piping support:**
```bash
# Find high-lift active signals and post to Slack
inspector signals --json --status=active --min-lift=2.5 \
  | jq '.[] | "\(.name): \(.lift)x lift, \(.leads_per_month) leads/mo"' \
  | slack-notify --channel=#revops

# Export churned identities for outreach
inspector identities --json --status=churned --min-score=50 \
  | jq -r '.[] | [.email, .company, .score] | @csv' \
  > outreach-list.csv

# Health check in CI
inspector integrations test posthog || echo "PostHog connection failed"
```

---

## Authentication & Configuration

### Config File

`~/.inspector/config.toml`:
```toml
[auth]
# API key for headless/CI usage
api_key = "insp_..."

# Or Supabase session token (auto-managed by `inspector login`)
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
```

### Login Flow

```bash
# Interactive login (opens browser for OAuth)
inspector login

# API key auth (for CI/headless)
inspector login --api-key "insp_..."

# Check auth status
inspector whoami

# Switch workspace
inspector workspace use acme-corp

# Logout
inspector logout
```

---

## Technical Architecture

### Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Node.js (same as Inspector backend) | Share types, API clients, and business logic with existing codebase |
| TUI framework | [Ink](https://github.com/vadimdemedes/ink) (React for CLI) | Familiar React paradigm, reuse component patterns from web UI |
| CLI parsing | Commander.js or yargs | Mature, well-documented, supports subcommands |
| Terminal rendering | Ink built-ins + ink-table, ink-spinner | Rich terminal UI components |
| HTTP client | Existing fetch wrappers from `lib/api/` | Reuse API hooks logic |
| Config | cosmiconfig + TOML | Standard config file resolution |
| Keychain | keytar | Secure credential storage |

### Project Structure

```
src/
├── cli/
│   ├── index.ts              # Entry point, CLI argument parsing
│   ├── commands/
│   │   ├── dashboard.ts      # Default TUI view
│   │   ├── signals.ts        # Signals list/detail/create/export
│   │   ├── identities.ts     # Identities list
│   │   ├── integrations.ts   # Integration management
│   │   ├── memory.ts         # Exploration logs
│   │   ├── sync.ts           # Trigger sync operations
│   │   ├── login.ts          # Authentication
│   │   └── workspace.ts      # Workspace switching
│   ├── components/
│   │   ├── Dashboard.tsx      # Ink component: dashboard layout
│   │   ├── SignalsList.tsx    # Ink component: signals table
│   │   ├── SignalDetail.tsx   # Ink component: signal detail view
│   │   ├── IdentitiesList.tsx # Ink component: identities table
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
- CLI skeleton with commander.js
- Auth flow (`inspector login`, `inspector whoami`)
- Config file management
- API client with auth header injection
- `--json` output mode for all commands
- `inspector dashboard` (non-interactive, prints summary)

### M2: Read-Only TUI (Week 3-4)
- Ink-based interactive dashboard
- Signals list with filtering/sorting
- Signal detail view with metrics and charts
- Identities list with filtering
- Keyboard navigation system
- Auto-refresh

### M3: Write Operations (Week 5-6)
- Signal creation wizard (interactive)
- Integration configure/test/disconnect
- Signal activate/deactivate/delete
- Export to CSV
- Trigger sync operations

### M4: Advanced Features (Week 7-8)
- Memory/exploration logs viewer
- Offline cache with stale data indicators
- Watch mode (`inspector watch signals` -- live updating view)
- Shell completions (bash, zsh, fish)
- `inspector` as an npm global package / standalone binary (pkg)

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

1. **Package distribution**: npm global install vs. standalone binary (via `pkg` or `bun compile`)? Standalone is better for non-Node environments but adds build complexity.
2. **API key scoping**: Should TUI API keys have different permission levels (read-only vs. full access)?
3. **Workspace switching**: Support multiple workspaces in a single session, or require explicit switch?
4. **Notification support**: Should `inspector watch` support desktop notifications (via `node-notifier`) for critical signals?
