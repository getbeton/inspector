# Beton MVP PRD — Implementation Specification
## Signal Discovery & Validation Engine — Streamlit Prototype

**Document Purpose:** Complete specification for building the Beton prototype. This document contains everything needed to implement the app from scratch.

**Target:** Claude Code / AI-assisted development

**Tech Stack:** Python 3.11+, Streamlit, Plotly, Pandas

---

## 1. Product Overview

### 1.1 What Is Beton?

Beton is a signal discovery and validation engine for B2B SaaS companies. It automatically finds which user behaviors predict revenue outcomes, validates those signals against historical data (backtesting), and tracks whether predictions continue to work over time.

### 1.2 Core Value Proposition

Competitors (Pocus, Common Room, MadKudu) ask users to define scoring rules based on intuition. Beton inverts this: "Show us your data → we find signals that work → we prove they work with backtesting."

### 1.3 MVP Scope

This prototype demonstrates the value proposition with pre-computed stub data. The ML backend will be added later. For now, we simulate what the discovery engine would produce.

**In scope:**
- Dashboard showing signal performance metrics
- Data source connections (PostHog, Attio) — show connected state
- Discovered signals list with statistics
- Signal detail view with backtest results
- User-defined signal builder (visual + SQL)
- Backtesting simulation for user signals
- Playbook configuration
- CRM field mapping (Attio)

**Out of scope for MVP:**
- Actual ML/statistical discovery engine
- Real API connections (simulate with stub data)
- Authentication
- Multi-tenant support

---

## 2. Technical Decisions

| Aspect | Decision |
|--------|----------|
| Framework | Streamlit |
| Charts | Plotly |
| Data | Pandas DataFrames with stub data |
| CRM | Attio (not Pipedrive) |
| CDP | PostHog |
| Hosting | Local development first, Railway later |
| Style | Clean/minimal (Vercel-inspired) |
| State | Streamlit session_state |

---

## 3. Research-Grounded Requirements

### 3.1 Jobs-to-be-Done (from ODI analysis)

The prototype must address these high-opportunity outcomes from actual customer research:

| Outcome | Opportunity Score | What It Means |
|---------|-------------------|---------------|
| Minimize time to backtest rules against historical data | 18 | Users need to validate signals BEFORE deploying them |
| Maximize visibility into prediction vs. correlation | 15 | Users need to know if a signal actually predicts outcomes |
| Minimize time to detect accuracy degradation | 15 | Users need to know when signals stop working |
| Prove causal lift, not just correlation | 16 | Users need statistical proof, not just "this looks good" |

### 3.2 Voice of Customer Quotes (to inform UX copy)

Use these real quotes to inform microcopy and value messaging:

- "Initial phase of tuning and refinement required to ensure the signal-to-noise ratio is high" → Beton pre-validates signals
- "Predictive scoring can be a black box. Datasets often too small" → Beton shows sample sizes and confidence
- "Most people admitted to struggling to figure out how to build a lead scoring model" → Beton suggests signals automatically

---

## 4. Information Architecture

### 4.1 Navigation Structure

```
Sidebar (persistent)
├── 🏠 Dashboard      ← Main performance overview
├── 🔌 Sources        ← Data source connections  
├── 🎯 Signals        ← Discovered signals list
│   └── Signal Detail ← Full stats for one signal
├── 🧪 Backtest       ← User-defined signal testing
├── 📋 Playbooks      ← Rule configuration
├── 📤 Destinations   ← Output configuration (Attio fields)
└── ⚙️ Settings       ← Company settings (ACV, etc.)
```

### 4.2 User Flows

**Flow A: Review Discovered Signals**
Dashboard → Signals → Signal Detail → Enable Signal → Configure Playbook

**Flow B: Test Custom Signal**
Backtest → Define Signal (Visual or SQL) → Run Backtest → Review Results → Save Signal

**Flow C: Configure Output**
Destinations → Connect Attio → Auto-Match Fields → Verify Mapping → Save

---

## 5. Screen Specifications

### 5.1 Dashboard Page

**Route:** Main page (default)

**Purpose:** Show overall system health and key metrics at a glance.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard                                           [Run Discovery]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Leads    │  │ Conv.    │  │ Pipeline │  │ Accuracy │        │
│  │ 142      │  │ 16.9%    │  │ $648K    │  │ 87%      │        │
│  │ +12%     │  │ +2.3%    │  │ +18%     │  │ +3%      │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                  │
│  Signal Accuracy Over Time                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  [Line chart: 6 months of accuracy data, ~85% avg]      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Signal Health                              Recent Leads         │
│  ┌────────────────────────────┐  ┌────────────────────────────┐ │
│  │ ✅ Onboarding ≤3d    91%  │  │ Acme Corp    Score: 94     │ │
│  │ ✅ Invited team      88%  │  │ TechStart    Score: 87     │ │
│  │ ⚠️ Pricing page     72%  │  │ DataFlow     Score: 82     │ │
│  │ ✅ API key          85%  │  │ CloudNine    Score: 79     │ │
│  └────────────────────────────┘  └────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**
1. **Header** with page title and "Run Discovery" button (simulated)
2. **Metric cards** (4 columns): Leads This Month, Conversion Rate, Pipeline Influenced, Signal Accuracy
3. **Line chart**: Accuracy trend over last 6 months
4. **Two-column section**:
   - Left: Signal Health list (signal name + current accuracy + status icon)
   - Right: Recent Leads table (company, signal, score, status)

**Interactions:**
- "Run Discovery" shows progress simulation then refreshes metrics
- Click signal in health list → navigate to signal detail
- Click lead row → show lead detail in expander

---

### 5.2 Sources Page

**Route:** Sources

**Purpose:** Show connected data sources and their health.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Data Sources                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Connected Sources                                               │
│                                                                  │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐│
│  │  📊 PostHog          ✅    │  │  💼 Attio            ✅    ││
│  │  Type: Behavioral          │  │  Type: CRM                  ││
│  │  Last sync: 2 hours ago    │  │  Last sync: 1 hour ago      ││
│  │  Events: 1,847,293         │  │  Deals: 847                 ││
│  │  Users: 34,521             │  │  Contacts: 12,456           ││
│  │  Range: Jan-Dec 2024       │  │  Range: Jan-Dec 2024        ││
│  │  [Reconnect] [View Data]   │  │  [Reconnect] [View Data]    ││
│  └─────────────────────────────┘  └─────────────────────────────┘│
│                                                                  │
│  Available Sources                                               │
│                                                                  │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐│
│  │  💳 Stripe           ○     │  │  💬 Intercom          ○    ││
│  │  Type: Billing             │  │  Type: Support              ││
│  │  Status: Not connected     │  │  Status: Not connected      ││
│  │                            │  │                             ││
│  │  [Connect]                 │  │  [Connect]                  ││
│  └─────────────────────────────┘  └─────────────────────────────┘│
│                                                                  │
│  Data Quality Summary                                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ✅ Identity resolution: 89% email match rate               ││
│  │  ✅ Outcome data: 847 deals with timestamps                 ││
│  │  ⚠️ Missing: Billing data (connect Stripe for revenue)     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**
1. **Connected Sources**: Cards for PostHog and Attio showing status and stats
2. **Available Sources**: Cards for Stripe and Intercom (not connected state)
3. **Data Quality Summary**: Checklist of data requirements

**Interactions:**
- "Connect" button shows modal with API key input (simulated success)
- "View Data" expands to show sample records
- "Reconnect" simulates re-sync

---

### 5.3 Signals Page

**Route:** Signals

**Purpose:** List all discovered signals with filtering and sorting.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Discovered Signals                                              │
│  Last discovery: 2 hours ago                    [Run Discovery]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Filters: [Status ▼] [Lift ▼] [Source ▼]    Search: [________]  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Signal                    Lift  Conf  Leads/mo  Est ARR  ● ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ Onboarding ≤3 days       4.2x   99%    47      $378K   🟢 ││
│  │ Invited 2+ teammates     3.8x   99%    31      $249K   🟢 ││
│  │ Pricing page 2x+         3.1x   95%    23      $185K   🟡 ││
│  │ API key created          2.9x   98%    19      $153K   🟢 ││
│  │ Dashboard created        2.4x   94%    28      $225K   🟢 ││
│  │ Weekly active 3+ wks     2.1x   91%    34      $273K   🟢 ││
│  │ Company 50-500 emp       1.9x   93%    52      $418K   🟢 ││
│  │ ... more rows ...                                           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Summary: 10 signals discovered │ 7 enabled │ 1 degrading       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Columns:**
| Column | Description | Format |
|--------|-------------|--------|
| Signal | Human-readable name | Text |
| Lift | Conversion multiplier | "X.Xx" |
| Conf | Statistical confidence | "XX%" |
| Leads/mo | Monthly matching users | Number |
| Est ARR | Projected annual impact | "$XXXK" |
| Status | Health indicator | 🟢/🟡/⚪ |

**Calculations:**
```
Est ARR = (Leads/mo × 12) × Lift-Adjusted Conversion × Avg ACV
Where:
- Lift-Adjusted Conversion = baseline_conversion × lift
- Avg ACV = $27,000 (from settings)
```

**Interactions:**
- Click row → navigate to Signal Detail page
- Filter dropdowns filter the table
- "Run Discovery" shows progress simulation
- Status icons: 🟢 healthy, 🟡 degrading, ⚪ disabled

---

### 5.4 Signal Detail Page

**Route:** Signals → Detail (pass signal_id)

**Purpose:** Show full statistical proof for one signal. This is the "money screen" that proves backtesting works.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Signals                                               │
│                                                                  │
│  Onboarding completed within 3 days                    🟢 Healthy│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DEFINITION                                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Users who complete the onboarding checklist within 3 days   ││
│  │ of signup.                                                   ││
│  │                                                              ││
│  │ Source: PostHog                                              ││
│  │ Event: onboarding_completed                                  ││
│  │ Condition: days_since_signup <= 3                            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  BACKTEST RESULTS                                                │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │  With Signal             │  │  Without Signal              │ │
│  │  ─────────────────────── │  │  ─────────────────────────── │ │
│  │  Users: 1,247            │  │  Users: 8,934                │ │
│  │  Converted: 177          │  │  Converted: 304              │ │
│  │  Rate: 14.2%             │  │  Rate: 3.4%                  │ │
│  └──────────────────────────┘  └──────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Lift: 4.2x                                                 ││
│  │  95% Confidence Interval: 3.8x - 4.6x                       ││
│  │  p-value: < 0.001 (highly significant)                      ││
│  │  Statistical confidence: 99.7%                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  REVENUE PROJECTION                                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Users matching this signal: 127/month                      ││
│  │  Expected additional conversions: 14/month                  ││
│  │  Your avg ACV: $27,000                                      ││
│  │  ─────────────────────────────────────────────────────────  ││
│  │  Projected annual impact: $378,000                          ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  HISTORICAL ACCURACY                                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  [Line chart: Monthly accuracy over 6 months]               ││
│  │  Current accuracy: 91% │ 6-month avg: 90%                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ ✓ Enable    │  │ Add to Rule  │  │ Export Users │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Statistics to Display:**
| Metric | Value | Source |
|--------|-------|--------|
| Sample with signal | 1,247 | Stub data |
| Sample without | 8,934 | Stub data |
| Conversion with | 14.2% | Stub data |
| Conversion without | 3.4% | Stub data |
| Lift | 4.2x | conversion_with / conversion_without |
| CI Lower | 3.8x | lift × 0.9 |
| CI Upper | 4.6x | lift × 1.1 |
| p-value | < 0.001 | Stub data |
| Confidence | 99.7% | 1 - p_value |

**Interactions:**
- "← Back" returns to Signals list
- "Enable/Disable" toggles signal status
- "Add to Rule" opens Playbook builder
- "Export Users" downloads CSV (simulated)

---

### 5.5 Backtest Page (User-Defined Signals)

**Route:** Backtest

**Purpose:** Allow users to define their own signals and run simulated backtesting. This is a key differentiator — users can test ANY hypothesis before deploying.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Backtest Your Signals                                           │
│  Test any hypothesis against your historical data                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Define Your Signal                                              │
│                                                                  │
│  [Visual Builder]  [SQL Query]     ← Tab selector               │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│  │                                                              ││
│  │  VISUAL BUILDER (when selected)                              ││
│  │                                                              ││
│  │  Signal Name: [High-intent enterprise accounts_______]       ││
│  │                                                              ││
│  │  Conditions (all must be true):                              ││
│  │                                                              ││
│  │  ┌─────────────────────────────────────────────────────────┐││
│  │  │ [Event ▼]        [Operator ▼]    [Value_______]   [×]  │││
│  │  │ onboarding_done    completed       within 7 days        │││
│  │  └─────────────────────────────────────────────────────────┘││
│  │                                                              ││
│  │  ┌─────────────────────────────────────────────────────────┐││
│  │  │ [Property ▼]     [Operator ▼]    [Value_______]   [×]  │││
│  │  │ company_size       >=              50                   │││
│  │  └─────────────────────────────────────────────────────────┘││
│  │                                                              ││
│  │  ┌─────────────────────────────────────────────────────────┐││
│  │  │ [Property ▼]     [Operator ▼]    [Value_______]   [×]  │││
│  │  │ company_size       <=              500                  │││
│  │  └─────────────────────────────────────────────────────────┘││
│  │                                                              ││
│  │  [+ Add Condition]                                           ││
│  │                                                              ││
│  ═══════════════════════════════════════════════════════════════│
│  │                                                              ││
│  │  SQL QUERY (when selected)                                   ││
│  │                                                              ││
│  │  Signal Name: [Custom SQL signal___________________]         ││
│  │                                                              ││
│  │  ┌─────────────────────────────────────────────────────────┐││
│  │  │ -- Define users who match your signal                   │││
│  │  │ -- Return user_id for users who should be flagged       │││
│  │  │                                                         │││
│  │  │ SELECT DISTINCT user_id                                 │││
│  │  │ FROM events                                             │││
│  │  │ WHERE event = 'onboarding_completed'                    │││
│  │  │   AND days_since_signup <= 3                            │││
│  │  │   AND user_id IN (                                      │││
│  │  │     SELECT user_id FROM users                           │││
│  │  │     WHERE company_size BETWEEN 50 AND 500               │││
│  │  │   )                                                     │││
│  │  │                                                         │││
│  │  └─────────────────────────────────────────────────────────┘││
│  │                                                              ││
│  │  Available tables: events, users, companies, deals           ││
│  │  [Show Schema]                                               ││
│  │                                                              ││
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│                    [🧪 Run Backtest]                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**After clicking "Run Backtest" — Results appear below:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  BACKTEST RESULTS                                    ✅ Complete │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                 │
│  │  📈 LIFT: 3.4x     │  │  ✓ SIGNIFICANT     │                 │
│  │  CI: 2.9x - 3.9x   │  │  p < 0.001         │                 │
│  └────────────────────┘  └────────────────────┘                 │
│                                                                  │
│  Comparison                                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    │  With Signal  │  Without Signal        ││
│  │  ──────────────────┼───────────────┼─────────────────────── ││
│  │  Users             │  1,456        │  8,725                 ││
│  │  Converted         │  165          │  297                   ││
│  │  Conversion Rate   │  11.3%        │  3.4%                  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Revenue Projection                                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Monthly matches: 52 users                                  ││
│  │  Expected conversions: 6/month (vs 2 at baseline)           ││
│  │  Incremental ARR: +$129,600/year                            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Recommendation: ✅ ENABLE — Strong signal with high confidence │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Save Signal  │  │ Add to Rule  │  │ Run Another  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Visual Builder Components:**

| Component | Options |
|-----------|---------|
| Event dropdown | List from POSTHOG_EVENTS |
| Property dropdown | List from POSTHOG_PROPERTIES |
| Operators (events) | "completed", "not completed", "count >=", "count <=", "within X days" |
| Operators (properties) | "=", "!=", ">", ">=", "<", "<=", "contains", "in list" |
| Value input | Text/number based on property type |

**SQL Editor Features:**
- Syntax highlighting (use st.code or ace editor if available)
- Show available tables/schema on expand
- Validate SQL syntax before running (simulated)

**Backtest Simulation Logic:**
```python
def simulate_backtest(signal_definition):
    # Generate realistic-looking results
    base_lift = random.uniform(1.5, 4.5)
    base_confidence = random.uniform(0.85, 0.99)
    
    sample_with = random.randint(200, 2000)
    sample_without = random.randint(5000, 15000)
    
    baseline_conversion = 0.034
    signal_conversion = baseline_conversion * base_lift
    
    is_significant = base_confidence > 0.90 and base_lift > 1.5
    
    return {
        "lift": base_lift,
        "confidence": base_confidence,
        "sample_with": sample_with,
        "sample_without": sample_without,
        "conversion_with": signal_conversion,
        "conversion_without": baseline_conversion,
        "is_significant": is_significant,
        "recommendation": "Enable" if is_significant else "Review"
    }
```

---

### 5.6 Playbooks Page

**Route:** Playbooks

**Purpose:** Configure rules that combine signals and trigger actions.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Playbooks                                        [+ New Playbook]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Active Playbooks                                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  High-Intent PQL Alert                            🟢 Active ││
│  │  ─────────────────────────────────────────────────────────  ││
│  │  IF: Onboarding ≤3 days AND Company 50-500                  ││
│  │  THEN: Slack alert + Attio update                           ││
│  │                                                              ││
│  │  Leads/month: 23  │  Conversion: 18.7%  │  Est ARR: $185K   ││
│  │                                                              ││
│  │  [Edit] [Pause] [Delete]                                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Developer Interest                               🟢 Active ││
│  │  ─────────────────────────────────────────────────────────  ││
│  │  IF: API key created OR Docs visited 5+                     ││
│  │  THEN: Attio update                                         ││
│  │                                                              ││
│  │  Leads/month: 34  │  Conversion: 12.4%  │  Est ARR: $114K   ││
│  │                                                              ││
│  │  [Edit] [Pause] [Delete]                                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Paused Playbooks                                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Expansion Ready                                  ⏸️ Paused ││
│  │  IF: Invited 2+ teammates AND Weekly active 3+ wks          ││
│  │  THEN: Slack + Attio + Email sequence                       ││
│  │                                                              ││
│  │  [Edit] [Activate] [Delete]                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**New Playbook Modal/Expander:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Create Playbook                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Name: [________________________________]                        │
│                                                                  │
│  When these conditions are met:                                  │
│                                                                  │
│  [Signal dropdown ▼]  [AND/OR ▼]                                │
│  [Signal dropdown ▼]  [AND/OR ▼]                                │
│  [+ Add Condition]                                               │
│                                                                  │
│  Perform these actions:                                          │
│                                                                  │
│  ☑ Send Slack alert to [#sales-alerts ▼]                        │
│  ☑ Update Attio fields                                          │
│  ☐ Trigger email sequence                                       │
│  ☐ Send webhook to [URL input]                                  │
│                                                                  │
│  Preview: ~35 leads/month would trigger this playbook           │
│  Historical conversion: 15.2%                                    │
│                                                                  │
│  [Cancel]  [Save Playbook]                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5.7 Destinations Page

**Route:** Destinations

**Purpose:** Configure where signals are sent, specifically Attio CRM field mapping.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Destinations                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Attio CRM                                           ✅ Connected│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                              ││
│  │  Field Mapping                          [🔄 Auto-Match All] ││
│  │                                                              ││
│  │  ┌─────────────────┬──────────────┬─────────────┬─────────┐ ││
│  │  │ Attio Field     │ Type         │ Beton Field │ Status  │ ││
│  │  ├─────────────────┼──────────────┼─────────────┼─────────┤ ││
│  │  │ Lead Score      │ Number       │ signal_score│ ✅      │ ││
│  │  │ Top Signal      │ Text         │ top_signal  │ ✅      │ ││
│  │  │ Signal Count    │ Number       │ signal_cnt  │ ✅      │ ││
│  │  │ Last Signal     │ Date         │ last_signal │ ✅      │ ││
│  │  │ Beton Link      │ URL          │ profile_url │ ✅      │ ││
│  │  │ Conv Probability│ Number       │ conv_prob   │ ⚪      │ ││
│  │  │ Revenue Potential│ Currency    │ rev_potential│ ⚪     │ ││
│  │  └─────────────────┴──────────────┴─────────────┴─────────┘ ││
│  │                                                              ││
│  │  ✅ = Mapped and syncing │ ⚪ = Not mapped                   ││
│  │                                                              ││
│  │  [Test Sync] [Save Mapping]                                  ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Slack                                              ✅ Connected │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Channel: #sales-alerts                                     ││
│  │  Message template:                                           ││
│  │  ┌─────────────────────────────────────────────────────────┐││
│  │  │ 🎯 High-intent lead: {{company_name}}                   │││
│  │  │ Signal: {{signal_name}} ({{lift}}x lift)                │││
│  │  │ Contact: {{contact_email}}                              │││
│  │  │ Attio: {{attio_url}}                                    │││
│  │  └─────────────────────────────────────────────────────────┘││
│  │  [Test Message] [Save]                                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Webhook                                           ⚪ Not Set Up │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  [+ Configure Webhook]                                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Auto-Match Behavior:**
When user clicks "Auto-Match All":
1. Show brief loading spinner (0.5s)
2. All unmapped fields become mapped (✅)
3. Show success toast: "All fields matched successfully"

This simulates the automatic field detection that the real system would do.

---

### 5.8 Settings Page

**Route:** Settings

**Purpose:** Configure company-level settings that affect calculations.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Settings                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Revenue Settings                                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Average Contract Value (ACV)                               ││
│  │  $[27,000___________]                                       ││
│  │  Used for ARR projections                                    ││
│  │                                                              ││
│  │  Baseline Conversion Rate                                    ││
│  │  [3.4__]%                                                    ││
│  │  Your historical free-to-paid conversion                     ││
│  │                                                              ││
│  │  Average Sales Cycle                                         ││
│  │  [45___] days                                                ││
│  │                                                              ││
│  │  Currency                                                    ││
│  │  [USD ▼]                                                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Signal Thresholds                                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Minimum confidence to show signal                          ││
│  │  [90__]%                                                     ││
│  │                                                              ││
│  │  Minimum sample size                                         ││
│  │  [30___] users                                               ││
│  │                                                              ││
│  │  Minimum lift                                                ││
│  │  [1.5__]x                                                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  [Save Settings]                                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Structures

### 6.1 Discovered Signals

```python
DISCOVERED_SIGNALS = [
    {
        "id": "sig_001",
        "name": "Onboarding completed within 3 days",
        "description": "Users who complete the onboarding checklist within 3 days of signup",
        "source": "PostHog",
        "event": "onboarding_completed",
        "condition": "days_since_signup <= 3",
        "lift": 4.2,
        "confidence": 0.997,
        "p_value": 0.001,
        "sample_with": 1247,
        "sample_without": 8934,
        "conversion_with": 0.142,
        "conversion_without": 0.034,
        "leads_per_month": 47,
        "status": "enabled",  # enabled, disabled
        "health": "healthy",  # healthy, degrading
        "accuracy_trend": [0.88, 0.91, 0.89, 0.92, 0.90, 0.91],  # 6 months
    },
    # ... more signals
]
```

### 6.2 Data Sources

```python
DATA_SOURCES = {
    "posthog": {
        "name": "PostHog",
        "type": "Behavioral",
        "status": "connected",  # connected, not_connected
        "last_sync": "2 hours ago",
        "events_count": 1_847_293,
        "users_count": 34_521,
        "date_range": "Jan 2024 - Dec 2024",
        "health": "healthy"
    },
    "attio": {
        "name": "Attio",
        "type": "CRM",
        "status": "connected",
        "last_sync": "1 hour ago",
        "deals_count": 847,
        "contacts_count": 12_456,
        "date_range": "Jan 2024 - Dec 2024",
        "health": "healthy"
    },
    # stripe, intercom - not_connected
}
```

### 6.3 PostHog Events/Properties (for filter builder)

```python
POSTHOG_EVENTS = [
    {"event": "user_signed_up", "count": 34521},
    {"event": "onboarding_started", "count": 31245},
    {"event": "onboarding_completed", "count": 18734},
    {"event": "pageview", "count": 1847293},
    {"event": "feature_used", "count": 892341},
    {"event": "dashboard_created", "count": 12456},
    {"event": "api_key_created", "count": 2341},
    {"event": "teammate_invited", "count": 4532},
    # ... more
]

POSTHOG_PROPERTIES = [
    {"property": "days_since_signup", "type": "number"},
    {"property": "company_name", "type": "string"},
    {"property": "company_size", "type": "number"},
    {"property": "plan", "type": "string"},
    {"property": "page_path", "type": "string"},
    # ... more
]
```

### 6.4 Playbooks

```python
PLAYBOOKS = [
    {
        "id": "pb_001",
        "name": "High-Intent PQL Alert",
        "conditions": [
            {"signal_id": "sig_001", "operator": "AND"},
            {"signal_id": "sig_009", "operator": "AND"},
        ],
        "actions": ["slack_alert", "attio_update"],
        "status": "active",
        "leads_per_month": 23,
        "conversion_rate": 0.187,
    },
    # ... more
]
```

### 6.5 Attio Field Mapping

```python
ATTIO_FIELDS = [
    {"attio_field": "Lead Score", "type": "number", "beton_field": "signal_score", "mapped": True},
    {"attio_field": "Top Signal", "type": "text", "beton_field": "top_signal_name", "mapped": True},
    {"attio_field": "Signal Count", "type": "number", "beton_field": "signal_count", "mapped": True},
    {"attio_field": "Last Signal Date", "type": "date", "beton_field": "last_signal_timestamp", "mapped": True},
    {"attio_field": "Beton Link", "type": "url", "beton_field": "beton_profile_url", "mapped": True},
    {"attio_field": "Conversion Probability", "type": "number", "beton_field": "conversion_prob", "mapped": False},
    {"attio_field": "Revenue Potential", "type": "currency", "beton_field": "revenue_potential", "mapped": False},
]
```

### 6.6 Company Settings

```python
COMPANY_SETTINGS = {
    "avg_acv": 27000,
    "baseline_conversion": 0.034,
    "sales_cycle_days": 45,
    "currency": "USD",
    "min_confidence": 0.90,
    "min_sample_size": 30,
    "min_lift": 1.5,
}
```

---

## 7. Key Calculations

### 7.1 Estimated ARR

```python
def calculate_estimated_arr(signal):
    """
    Calculate projected annual revenue impact from a signal.
    """
    leads_per_month = signal["leads_per_month"]
    lift = signal["lift"]
    baseline_conversion = COMPANY_SETTINGS["baseline_conversion"]
    avg_acv = COMPANY_SETTINGS["avg_acv"]
    
    # Lift-adjusted conversion rate
    adjusted_conversion = baseline_conversion * lift
    
    # Monthly conversions from this signal
    monthly_conversions = leads_per_month * adjusted_conversion
    
    # Incremental conversions (above baseline)
    baseline_conversions = leads_per_month * baseline_conversion
    incremental_conversions = monthly_conversions - baseline_conversions
    
    # Annual impact
    annual_arr = incremental_conversions * 12 * avg_acv
    
    return annual_arr
```

### 7.2 Signal Health

```python
def get_signal_health(accuracy_trend):
    """
    Determine if signal is healthy or degrading based on accuracy trend.
    """
    if len(accuracy_trend) < 3:
        return "healthy"
    
    recent = accuracy_trend[-3:]  # Last 3 data points
    older = accuracy_trend[:-3]   # Older data points
    
    recent_avg = sum(recent) / len(recent)
    older_avg = sum(older) / len(older) if older else recent_avg
    
    # If accuracy dropped more than 10%, it's degrading
    if recent_avg < older_avg - 0.10:
        return "degrading"
    
    return "healthy"
```

---

## 8. UI Components Reference

### 8.1 Streamlit Components to Use

| Need | Component |
|------|-----------|
| Metric cards | `st.metric()` |
| Line charts | `st.line_chart()` or `plotly.express.line()` |
| Tables | `st.dataframe()` with column_config |
| Forms | `st.form()` |
| Tabs | `st.tabs()` |
| Expanders | `st.expander()` |
| Selectbox | `st.selectbox()` |
| Multi-select | `st.multiselect()` |
| Text input | `st.text_input()` |
| Number input | `st.number_input()` |
| Text area (SQL) | `st.text_area()` with height |
| Buttons | `st.button()` |
| Progress | `st.progress()` + `st.spinner()` |
| Success/Error | `st.success()`, `st.error()`, `st.warning()`, `st.info()` |
| Columns | `st.columns()` |
| Container | `st.container()` |

### 8.2 Color Palette (Vercel-inspired)

| Use | Color |
|-----|-------|
| Background | #fafafa |
| Card background | #ffffff |
| Border | #eaeaea |
| Text primary | #111111 |
| Text secondary | #666666 |
| Success | #10b981 (green) |
| Warning | #f59e0b (amber) |
| Error | #ef4444 (red) |
| Primary button | #000000 |

### 8.3 Status Indicators

| Status | Icon | Color |
|--------|------|-------|
| Healthy/Active | 🟢 or ✅ | Green |
| Degrading/Warning | 🟡 or ⚠️ | Amber |
| Disabled/Error | ⚪ or ❌ | Gray/Red |
| Connected | ✅ | Green |
| Not connected | ○ | Gray |

---

## 9. File Structure

```
beton-prototype/
├── app.py                    # Main Streamlit app
├── requirements.txt          # Dependencies
├── data/
│   └── stub_data.py         # All mock data and simulation functions
├── components/
│   ├── dashboard.py         # Dashboard page
│   ├── sources.py           # Sources page
│   ├── signals.py           # Signals list page
│   ├── signal_detail.py     # Signal detail page
│   ├── backtest.py          # Backtest page with filter builder
│   ├── playbooks.py         # Playbooks page
│   ├── destinations.py      # Destinations page
│   └── settings.py          # Settings page
├── utils/
│   ├── calculations.py      # ARR calculations, health checks
│   └── charts.py            # Plotly chart helpers
└── README.md
```

---

## 10. Implementation Notes

### 10.1 Navigation Pattern

Use `st.session_state` to track current page:

```python
if 'page' not in st.session_state:
    st.session_state.page = 'dashboard'

# In sidebar
if st.button("🏠 Dashboard"):
    st.session_state.page = 'dashboard'
    st.rerun()

# In main area
if st.session_state.page == 'dashboard':
    render_dashboard()
elif st.session_state.page == 'signals':
    render_signals()
# ... etc
```

### 10.2 Simulating Loading States

```python
def simulate_discovery():
    """Simulate running discovery with progress."""
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    for i in range(100):
        time.sleep(0.03)
        progress_bar.progress(i + 1)
        status_text.text(f"Analyzing... {i+1}%")
    
    status_text.text("Discovery complete!")
    time.sleep(0.5)
    progress_bar.empty()
    status_text.empty()
```

### 10.3 Auto-Match Simulation

```python
def auto_match_fields():
    """Simulate automatic field matching."""
    with st.spinner("Matching fields..."):
        time.sleep(0.5)
    
    # Update all fields to mapped=True
    for field in ATTIO_FIELDS:
        field["mapped"] = True
    
    st.success("All fields matched successfully!")
```

---

## 11. Requirements

```
streamlit>=1.28.0
pandas>=2.0.0
plotly>=5.18.0
numpy>=1.24.0
```

---

## 12. Getting Started Command

```bash
# Create project
mkdir beton-prototype && cd beton-prototype

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install streamlit pandas plotly numpy

# Run the app
streamlit run app.py
```

---

## Summary

This PRD provides everything needed to build the Beton prototype:

1. **Complete screen specifications** with ASCII layouts
2. **Data structures** with example values
3. **Calculations** for ARR projections and signal health
4. **UI component mapping** to Streamlit components
5. **File structure** for clean code organization
6. **Simulation logic** for backtest and discovery

The key screens are:
- **Dashboard**: Overall health metrics
- **Signals**: List of discovered signals with stats
- **Signal Detail**: Full backtest proof for one signal
- **Backtest**: User-defined signal testing (visual + SQL)
- **Destinations**: Attio field mapping with auto-match

The app uses stub data throughout, with simulation functions that produce realistic-looking results. This allows demonstrating the value proposition without needing the ML backend.
