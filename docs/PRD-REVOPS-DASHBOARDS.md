# PRD: Beton RevOps Dashboard Intelligence Platform

**Document Status**: Ready for Implementation
**Version**: 1.0
**Last Updated**: 2025-12-25
**Author**: Beton Product Team

---

## Executive Summary

Beton is building a **native PostHog dashboard suite** that delivers PQL (Product-Qualified Lead) intelligence to Series A/B RevOps teams (Manager–Director level). This feature proves Beton's core value: **automatically detecting product-qualified signals and routing them to CRM for immediate sales action**.

The platform detects **8 signal types** via daily cron jobs, calculates composite PQL scores (0-100), and automatically creates high-value deals in Attio. The system includes **4 interactive dashboards** for signal overview, account health, PQL performance comparison, and backtesting validation.

**Primary Goal**: Enable RevOps teams to prove that product signals drive measurable improvements in:
- Win rate (28% vs 15% baseline)
- Sales cycle (35 days vs 75 days)
- Pipeline coverage (4.5:1 vs 3:1)
- CAC (Customer Acquisition Cost) reduction

---

## Problem Statement

### Current State
RevOps teams struggle to prove the value of PQL systems because:
1. **No visibility** into which product signals actually convert
2. **No benchmarking** against other lead sources (inbound, outbound, partners)
3. **No quantified ROI** - can't show CFO the impact
4. **Manual processes** - signals detected separately from CRM workflows
5. **Limited enrichment** - product signals aren't connected to firmographic data

### Why This Matters
Series A/B companies allocate 30-40% of sales budget to SDRs. If PQL signals don't demonstrably outperform traditional lead sources, leadership will reallocate that budget elsewhere. **This is the make-or-break feature for Beton.**

---

## Solution Overview

### What We're Building

#### 4 Native PostHog Dashboards
| Dashboard | Purpose | Key Metrics | Refresh |
|-----------|---------|------------|---------|
| **Signal Overview** | At-a-glance view of all product signals | Signals fired, distribution by type, high-priority queue | 15 min |
| **Account Health** | Usage trends and expansion/churn signals | MAU, growth leaders, at-risk accounts, feature adoption | Hourly |
| **PQL Performance** | Prove PQL > other lead sources | Win rate, sales cycle, pipeline by source, conversion funnel | Daily |
| **Backtesting** | Validate signal accuracy historically | Precision, recall, conversion by score, ROI calculator | Daily |

#### 8 Automatically Detected Signal Types
| Signal | Logic | Base Score | When Fired |
|--------|-------|-----------|------------|
| Usage Spike | >50% week-over-week activity growth | 25 | Weekly |
| Pricing Intent | 2+ visits to pricing pages in 7 days | 30 | Daily check |
| Feature Adoption | 3+ new features adopted this week | 20 | Weekly |
| Limit Approaching | Account at >80% of plan usage | 35 | Daily check |
| Trial Expiring | <7 days remaining + active usage | 30 | Daily check |
| Team Growth | 2+ new users added this week | 25 | Weekly |
| Support Engagement | 3+ Intercom interactions (complex product buying signal) | 15 | Daily check |
| Billing Intent | Checkout/upgrade events via Stripe | 40 | Daily check |

#### Composite Scoring Algorithm
```
Final PQL Score = min(
    sum(individual_signal_scores),  # Capped at 80
    80
) + min(
    unique_signal_types * 5,  # Diversity bonus (max 20 points)
    20
)

Range: 0–100
Routing Threshold: 60+ = Push to Attio as deal
```

---

## User Journeys

### Journey 1: RevOps Manager Discovers High-Value Signals

**Actor**: Sarah, VP of RevOps at Acme Corp
**Trigger**: Uses Beton to connect PostHog account

1. Sarah logs into Beton and clicks "Connect to PostHog"
2. Provides API key; Beton validates and discovers project
3. Beton immediately provisions 4 dashboards in PostHog (no delay)
4. **Signal Overview dashboard** auto-populates with:
   - "287 signals fired this week"
   - Pie chart: 35% pricing intent, 25% usage spike, 20% team growth, 20% other
   - Hot queue: 23 signals with score > 70, sorted by recency
5. Sarah clicks into highest-score signal (Acme Inc, score 92)
6. Sees: "2 new users + 4 new features + pricing page visits detected"
7. Clicks "View in Attio" → sees deal already created with `lead_source: 'pql'`
8. Sales rep calls Acme Inc, closes $150K deal 3 weeks later
9. Beton automatically marked the outcome in backtesting dashboard

---

### Journey 2: Sales Leader Proves PQL ROI to CFO

**Actor**: Tom, VP of Sales
**Trigger**: Board meeting next week, needs to justify SDR investment

1. Tom opens "PQL Performance" dashboard
2. Sees comparison table:
   - **PQL**: 145 leads → 32 SQL (22%) → 28 closed won → **19% win rate**, avg $150K deal
   - **Inbound**: 89 leads → 12 SQL (13%) → 8 closed won → **12% win rate**, avg $95K deal
   - **Outbound**: 234 leads → 28 SQL (12%) → 12 closed won → **8% win rate**, avg $78K deal
3. Line chart shows PQL win rate trending up (now 19%, was 16% last quarter)
4. Backtesting dashboard shows:
   - Signal precision: 68% (2 of 3 signals = deal win)
   - Signal recall: 71% (captured 71% of customers who would have bought)
   - ROI: "$2.1M pipeline generated from $50K annual Beton spend" = **42x ROI**
5. Tom uses this in board meeting; board approves $400K additional sales hiring budget

---

### Journey 3: Data Analyst Tunes Signal Weights

**Actor**: Alex, Data Analyst
**Trigger**: Pricing intent signal has low accuracy, needs tuning

1. Alex opens Backtesting dashboard
2. Views "Accuracy by Signal Type" table
3. Sees pricing intent = only 35% precision (too many false positives)
4. Clicks "Explain this signal" → gets query and adjustment tips
5. Modifies signal definition (increase threshold to 4 visits instead of 2)
6. Manually triggers signal detection job
7. Backtesting automatically recalculates on next run
8. Precision improves to 52% after 2 weeks of data

---

## Technical Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     CUSTOMER'S POSTHOG CDP                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Events Table              Groups Table       Data Warehouse     │
│  ─────────────────         ──────────────     ─────────────────  │
│  • $pageview               • company_id       • attio_deals       │
│  • $identify               • company_name     • company enrichment│
│  • feature_used            • domain           • conversion data   │
│  • custom CDP events       • properties       • sales metrics     │
│  • Stripe events                                                  │
│  • Intercom events                                                │
│                                                                   │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   │ HogQL Queries
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│              BETON BACKEND SIGNAL DETECTION ENGINE                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Daily Cron (6 AM UTC) ──────────────────────────────────┐  │
│  │                                                             │  │
│  │  For each signal type (8 total):                          │  │
│  │  1. Run detection query                                  │  │
│  │  2. Calculate base score                                 │  │
│  │  3. Store intermediate results                           │  │
│  │                                                             │  │
│  │  Composite scoring:                                       │  │
│  │  - Sum individual scores (cap at 80)                    │  │
│  │  - Add diversity bonus (5 pts per signal type, max 20)  │  │
│  │  - Final score range: 0-100                             │  │
│  │                                                             │  │
│  │  Store as PostHog events:                                │  │
│  │  {                                                         │  │
│  │    "event": "beton_signal_fired",                        │  │
│  │    "properties": {                                        │  │
│  │      "$group_0": "company_id",                           │  │
│  │      "signal_score": 75,                                 │  │
│  │      "signal_types": ["usage_spike", "pricing_intent"],  │  │
│  │      "detected_at": "2025-12-25T06:00:00Z"             │  │
│  │    }                                                       │  │
│  │  }                                                         │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                       │
│                          ▼                                       │
│         ┌─ Filter score >= 60 ────────────────┐               │
│         │                                       │               │
│         ▼                                       ▼               │
│    Sync to Attio                         Log to PostHog       │
│    Create deals with:                    (for dashboards)     │
│    • lead_source: 'pql'                                       │
│    • pql_score                                                │
│    • pql_signals                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                   │
                   │ Reverse Sync
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│           POSTHOG NATIVE DASHBOARDS (4 TOTAL)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Signal Overview       2. Account Health                     │
│     • Total signals          • Active accounts                  │
│     • By type distribution   • Usage trends                    │
│     • Trend chart            • Growth leaders                   │
│     • Hot queue (>70)        • At-risk accounts                │
│     • Score distribution     • Feature adoption                │
│                                                                   │
│  3. PQL Performance       4. Backtesting Results                │
│     • Win rate vs sources    • Signal precision                 │
│     • Sales cycle compare    • Signal recall                    │
│     • Pipeline by source     • Conversion by score              │
│     • Lead source funnel     • Accuracy by type                 │
│     • Pipeline value         • ROI calculator                   │
│                              • Time-to-close analysis          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Architecture

```
backend/app/
│
├── core/
│   ├── query_builder.py          # QueryBuilder with reusable CTEs
│   ├── query_library.py          # Versioned query registry
│   ├── tenant_config.py          # Per-tenant configuration
│   └── data_source_check.py      # CDP availability detection
│
├── signals/
│   ├── detector.py               # SignalDetector orchestration
│   ├── scorer.py                 # Composite scoring logic
│   ├── debouncer.py              # Signal deduplication (cooldown)
│   └── definitions.py            # 8 signal type configs
│
├── dashboards/
│   ├── builder.py                # DashboardBuilder
│   ├── tiles.py                  # Tile factory + definitions
│   ├── provisioner.py            # PostHog API wrapper
│   └── migrator.py               # Query version migration
│
├── backtesting/
│   ├── engine.py                 # BacktestEngine
│   ├── metrics.py                # Precision/Recall/F1 calculation
│   └── explainer.py              # Human-readable explanations
│
├── integrations/
│   ├── posthog/
│   │   ├── client.py
│   │   └── hogql.py
│   └── attio/
│       ├── client.py
│       └── resolver.py           # Company ID resolution
│
└── jobs/
    ├── daily_signal_detection.py # Cron entry point
    └── daily_attio_sync.py       # Cron entry point
```

---

## Success Criteria

### Phase 1 (Week 1) - Dashboard Provisioning
- [ ] All 4 dashboards created in PostHog via API
- [ ] Dashboard registry persisted in Supabase
- [ ] Tiles render (even if empty data)
- [ ] Tags applied for version tracking
- [ ] Error handling for invalid API keys

### Phase 2 (Week 2) - Signal Detection
- [ ] 8 signal detection queries working with real data
- [ ] `beton_signal_fired` events appearing in PostHog
- [ ] Composite scoring algorithm implemented
- [ ] Signal Overview dashboard populated with real signals
- [ ] Deduplication (cooldown) working
- [ ] Manual trigger available in UI

### Phase 3 (Week 2-3) - Attio Integration
- [ ] High-score signals (>= 60) creating Attio deals
- [ ] `lead_source: 'pql'` attribute set correctly
- [ ] Company ID resolution working (PostHog ↔ Attio)
- [ ] PQL Performance dashboard showing real comparisons

### Phase 4 (Week 3) - Backtesting Infrastructure
- [ ] Historical signal replay working
- [ ] Precision > 60%, Recall > 65%
- [ ] ROI calculator showing positive value
- [ ] Backtesting dashboard fully populated

### Phase 5 (Week 4) - Polish & Documentation
- [ ] All integration tests passing
- [ ] Unit tests for scoring, detection, provisioning
- [ ] RevOps user guide created
- [ ] Demo video recorded
- [ ] All queries cache-optimized

---

## Implementation Plan

### Phase 1: Query Infrastructure (3 days)

**Deliverable**: QueryBuilder + reusable query components

**Tasks**:
1. Create `QueryBuilder` class with:
   - Time window abstraction (`TimeWindow` enum)
   - Reusable CTEs (company_context, outcomes, period_comparison)
   - Score bucketing logic
2. Create `QueryDefinition` dataclass with versioning
3. Build `QueryLibrary` registry with all 24+ queries
4. Create `TenantConfig` for per-customer customization

**Files to Create**:
- `backend/app/core/query_builder.py`
- `backend/app/core/query_library.py`
- `backend/app/core/tenant_config.py`

**Testing**:
- Unit tests for each query template
- Validation against PostHog API docs

---

### Phase 2: Signal Detection (5 days)

**Deliverable**: Full signal detection pipeline with 8 signal types

**Tasks**:
1. Create `SignalDefinition` dataclass for each of 8 signals
2. Implement `SignalDetector` class:
   - Execute detection queries
   - Calculate composite scores
   - Handle partial failures gracefully
3. Implement `Scorer` for composite scoring algorithm
4. Implement `Debouncer` for cooldown per company/signal type
5. Create cron job entry point (`daily_signal_detection.py`)
6. Add manual trigger to Streamlit UI

**Files to Create**:
- `backend/app/signals/definitions.py`
- `backend/app/signals/detector.py`
- `backend/app/signals/scorer.py`
- `backend/app/signals/debouncer.py`
- `backend/app/jobs/daily_signal_detection.py`

**Testing**:
- Integration tests for each signal type
- Mock PostHog client for reproducible testing
- Scoring algorithm validation

---

### Phase 3: Dashboard Provisioning (4 days)

**Deliverable**: Automated PostHog dashboard creation

**Tasks**:
1. Create `DashboardTile` dataclass + factory
2. Implement `DashboardProvisioner`:
   - Create PostHog folder "Beton Signals"
   - Idempotent dashboard creation (check for existing via tags)
   - Tile provisioning with query binding
3. Create dashboard registry in Supabase
4. Implement `DashboardMigrator` for query updates
5. Create data source availability checks
6. Wire up to "Connect PostHog" flow

**Files to Create**:
- `backend/app/dashboards/tiles.py`
- `backend/app/dashboards/provisioner.py`
- `backend/app/dashboards/builder.py`
- `backend/app/dashboards/migrator.py`
- `backend/app/core/data_source_check.py`

**Testing**:
- Mock PostHog API for dashboard creation
- Registry persistence tests
- Migration tests

---

### Phase 4: Attio Integration (3 days)

**Deliverable**: High-score signals syncing to Attio as deals

**Tasks**:
1. Implement `CompanyResolver` for PostHog ↔ Attio ID mapping
2. Create Attio deal upsert logic
3. Set `lead_source: 'pql'`, `pql_score`, `pql_signals` attributes
4. Create daily sync cron job
5. Error handling for unresolved companies
6. Logging for audit trail

**Files to Create**:
- `backend/app/integrations/attio/resolver.py`
- `backend/app/integrations/attio/deal_sync.py`
- `backend/app/jobs/daily_attio_sync.py`

**Testing**:
- Integration tests with mock Attio API
- ID resolution edge cases
- Duplicate prevention

---

### Phase 5: Backtesting Engine (4 days)

**Deliverable**: Historical validation of signal accuracy

**Tasks**:
1. Create `BacktestEngine`:
   - Join signals with deal outcomes
   - Calculate precision/recall/F1
   - Calculate conversion by score bucket
2. Implement `MetricsCalculator` for all backtesting metrics
3. Create `SignalExplainer` for human-readable explanations
4. Backfill historical data (past 180 days)
5. Add backtesting dashboard integration

**Files to Create**:
- `backend/app/backtesting/engine.py`
- `backend/app/backtesting/metrics.py`
- `backend/app/backtesting/explainer.py`

**Testing**:
- Backtesting logic with synthetic data
- Metric calculation validation
- Edge cases (zero signals, zero conversions, etc.)

---

### Phase 6: Documentation & Polish (3 days)

**Deliverable**: User docs, demo, tests, deployment guide

**Tasks**:
1. Write RevOps user guide
2. Create demo video (5 min)
3. Add comprehensive docstrings
4. Ensure all queries are optimized/cached
5. Final integration tests
6. Deployment checklist

**Files to Create**:
- `docs/REVOPS-USER-GUIDE.md`
- `docs/SIGNAL-DEFINITIONS.md`
- `backend/tests/test_signal_detection.py`
- `backend/tests/test_dashboard_provisioning.py`
- `backend/tests/test_backtesting.py`

---

## Query Budget Analysis

| Activity | Queries/Day | Notes |
|----------|------------|-------|
| Signal detection (8 types) | 8 | Once daily at 6 AM UTC |
| Dashboard refresh (24 tiles) | 24 | 15-min intervals = 96/day, but cached |
| Backtesting (6 tiles) | 6 | Daily calculation |
| Ad-hoc user exploration | ~50 | Conservative estimate |
| **Total** | **~180/day** | Well under 2,400/hour limit |

**Caching Strategy**:
- `beton_signal_fired` events: 60-second cache (prevents duplicate storage)
- Aggregate dashboards (Signal Overview): 5-minute TTL
- Backtesting queries: 60-minute TTL (only changes daily)
- PQL Performance: 15-minute TTL (syncs with Attio)

---

## Critical Assumptions & Risks

### Assumptions
1. **PostHog Group Identification**: Customer has `$group_identify` events with company context
2. **Event Schema**: Standard events like `$pageview`, `$identify` are present
3. **CDP Integration**: At least 1 of {Stripe, Intercom, custom} is connected for signal detection
4. **Attio Integration**: Customer is using Attio CRM (or we provide mapping)
5. **Backtest Window**: Data exists for 90+ days for backtesting (or we gracefully degrade)

### Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| PostHog query rate limits exceeded | Signals stop firing | Budget queries conservatively, implement backoff |
| Attio company ID mismatch | Deals not created | Build resolver with fallback mapping logic |
| Signal precision low on new customer | No ROI proof | Graceful degradation, "collecting data" state |
| Missing CDP data sources | Dashboard tiles show zeros | Data source availability checks, conditional tiles |
| Query syntax breaks in PostHog update | Dashboards fail | Version queries, automated migration logic |

---

## Success Metrics

### For Beton
- **Adoption**: 80%+ of signups connect PostHog within 30 days
- **Daily Active**: 40%+ of connected customers use dashboards weekly
- **Conversion**: 35%+ of customers sign up for pilot after seeing dashboards
- **Retention**: 90%+ retention of customers using feature

### For Customer (RevOps)
- **Win Rate Improvement**: PQL leads close at 28% vs 15% baseline
- **Sales Cycle**: PQL opportunities close in 35 days vs 75 days
- **Pipeline Coverage**: 4.5:1 coverage ratio vs 3:1 baseline
- **CAC Reduction**: PQL CAC $2.1K vs $8K traditional leads

---

## Timeline

| Phase | Duration | Dependency | Completion |
|-------|----------|-----------|-----------|
| Query Infrastructure | 3 days | None | Week 1 Friday |
| Signal Detection | 5 days | Phase 1 | Week 2 Wednesday |
| Dashboard Provisioning | 4 days | Phase 1 | Week 2 Saturday |
| Attio Integration | 3 days | Phase 2 | Week 2 Tuesday |
| Backtesting Engine | 4 days | Phase 2 | Week 3 Wednesday |
| Documentation & Polish | 3 days | All Phases | Week 4 Monday |

**Total**: 22 days of development
**With Testing/QA**: 4 weeks
**Launch Target**: Mid-January 2026

---

## Out of Scope (Phase 2+)

- Custom signal type builder (first release: 8 fixed types only)
- ML-based signal weighting (first release: manual tuning)
- Multi-tenant signal isolation (first release: single-tenant per API key)
- Real-time signal detection (first release: daily batch)
- Native Beton dashboards (first release: PostHog-only)
- Integration with Slack/email alerts (first release: manual check)

---

## Questions for Stakeholders

1. **Attio Integration**: Should we auto-create prospects if company ID can't be resolved, or skip with warning?
2. **Signal Weights**: Which team owns tuning signal base scores after launch? Data science or RevOps?
3. **Score Threshold**: Is 60 the right routing threshold for Attio, or should it be configurable per customer?
4. **Backtest Data**: Do we offer data backfill service for customers with < 90 days history?
5. **Signal Storage**: How long to retain `beton_signal_fired` events? 1 year? Forever?

---

## Appendix: Related Documentation

- See `beton-build-plan.md` for detailed architecture overview
- See `beton-hogql-queries.md` for all 25+ HogQL queries
- See `beton-posthog-dashboards-spec.md` for dashboard specifications
- See `beton-spec-review.md` for critical implementation notes and reusable patterns

---

**Document Approval**:
- [ ] Product Lead
- [ ] Engineering Lead
- [ ] RevOps Advisor (pilot customer)
