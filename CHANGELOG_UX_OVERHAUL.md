# Beton Inspector - UX Overhaul Changelog

**Date:** December 24, 2024
**Version:** 2.0.0

---

## Summary

Major UX overhaul covering navigation restructuring, mock mode standardization, table enhancements, and page consolidation. The app now has a cleaner navigation flow with fewer pages and better mock data support throughout.

---

## Architecture Overview

### Page Structure (After Changes)

```
frontend/
├── Home.py                    # Entry point - Setup & Data Mode toggle
├── pages/
│   ├── 01_Signals.py          # Signal Explorer with deals/revenue columns
│   ├── 02_Signal_Detail.py    # Individual signal statistics & backtest
│   ├── 03_Backtest.py         # Builder (custom signals) & Viewer (performance)
│   ├── 04_Playbooks.py        # Rule configuration (signal → action)
│   ├── 05_Settings.py         # Data Sources + Destinations + Company Settings
│   └── 06_Identities.py       # NEW - User identity resolution table
└── utils/
    └── data_handler.py        # Mock mode utilities, API calls, mock data
```

### Navigation Flow

```
Home.py (Setup)
    ↓
01_Signals.py (Signal Explorer)
    ↓ [Click signal → Detail]
02_Signal_Detail.py
    ↓
03_Backtest.py (Test & View Performance)
    ↓
04_Playbooks.py (Configure Rules)
    ↓
05_Settings.py (Sources, Destinations, Settings)
    ↓
06_Identities.py (View Resolved Users)
```

---

## Changes Made

### 1. Files Deleted

| File | Reason |
|------|--------|
| `01_Connections.py` | Redundant - functionality exists in Home.py |
| `02_Sources.py` | Merged into 05_Settings.py as expander |
| `07_Destinations.py` | Merged into 05_Settings.py as expander |

### 2. Files Renamed

| Old Name | New Name |
|----------|----------|
| `03_Signals.py` | `01_Signals.py` |
| `04_Signal_Detail.py` | `02_Signal_Detail.py` |
| `05_Backtest.py` | `03_Backtest.py` |
| `06_Playbooks.py` | `04_Playbooks.py` |
| `08_Settings.py` | `05_Settings.py` |

### 3. New Files Created

| File | Purpose |
|------|---------|
| `06_Identities.py` | Table view of resolved user identities with filters and stats |

---

## Feature Changes by Page

### Home.py
- Navigation updated to point to `pages/01_Signals.py`
- No structural changes

### 01_Signals.py (Signal Explorer)

**Table Columns Changed:**
- REMOVED: `Lift`, `Leads/mo`, `30d Trend`
- ADDED: `Proj. Deals`, `Actual Deals`, `Proj. Revenue`, `Actual Revenue`, `Enabled`

**New Features:**
- In-table enable/disable toggle (checkbox column)
- Click-to-view buttons for each signal
- Loading spinner on data fetch
- Removed separate section headers ("Filter & Manage Signals", "Signals")

**Calculations:**
```python
BASELINE_CONVERSION = 0.034
ACV = 27000

projected_deals = int(leads * BASELINE_CONVERSION * lift)
actual_deals = int(leads * actual_conversion)
projected_revenue = projected_deals * ACV
actual_revenue = actual_deals * ACV
```

### 02_Signal_Detail.py

**New Features:**
- Mock mode toggle in header
- Full mock data support (doesn't require backend)
- Enriched mock signal data with:
  - `sample_with`, `sample_without`
  - `conversion_with`, `conversion_without`
  - `ci_lower`, `ci_upper`, `p_value`
  - `accuracy_trend` array

**Fixed Bugs:**
- "Back to Signals" button now uses `st.switch_page()` instead of session state
- "Add to Rule" button navigation fixed

### 03_Backtest.py

**Changes:**
- Navigation references updated to new page numbers
- Progress indicator still shows old structure (cosmetic only)

### 04_Playbooks.py

**Major Changes:**
- Separate "Active Playbooks" / "Paused Playbooks" headers → **Tabs**
- Added inline enable/disable toggle per playbook card
- Full mock data support with `MOCK_PLAYBOOKS` constant
- Mock mode toggle in header

**Mock Playbooks Data Structure:**
```python
{
    "id": "pb_001",
    "name": "High-Intent PQL Alert",
    "status": "active",  # or "paused"
    "conditions": [
        {"signal_id": "sig_001", "signal_name": "...", "operator": "AND"}
    ],
    "actions": ["slack_alert", "attio_update"],
    "leads_per_month": 35,
    "conversion_rate": 0.152
}
```

### 05_Settings.py (Major Restructure)

**Structure:**
```
Settings Page
├── Data Sources (expander, expanded=True)
│   ├── Connected Sources (PostHog, Attio cards)
│   ├── Missing Sources bubble (grouped)
│   ├── Quick Navigation (→ Identities, → Signals)
│   └── Data Quality Summary
├── Destinations (expander, expanded=False)
│   ├── Attio CRM field mapping table
│   ├── Slack configuration
│   └── Webhook setup
├── Revenue & Signal Settings (expander, expanded=False)
│   ├── ACV, Baseline Conversion, Sales Cycle
│   └── Min Confidence, Min Sample Size, Min Lift
└── About These Settings (expander)
```

**Data Sources Features:**
- External URL links ("View Data" → opens PostHog/Attio workspace)
- Mock mode indicator on each source card
- Grouped missing sources in single warning bubble
- Navigation buttons to Identities and Signals pages

### 06_Identities.py (NEW)

**Features:**
- Table view with columns: Email, Company, User ID, Status, Sources, Signals, Last Seen
- Filters: Resolution Status, Source, Has Signals, Search
- Stats: Total Identities, Resolution Rate, Email Match Rate, With Signals %
- Export to CSV button
- Sync Identities button

**Mock Data:** 12 sample identities with various statuses

---

## Mock Mode System

### How It Works

All pages use the shared utilities from `utils/data_handler.py`:

```python
from utils.data_handler import (
    is_mock_mode,           # Check if mock mode is active
    render_data_mode_toggle, # Render the toggle widget
    show_mock_data_banner,   # Show "Using Mock Data" banner
    get_mock_signals,        # Get MOCK_SIGNALS list
    get_mock_data_sources,   # Get MOCK_DATA_SOURCES dict
    get_api_data             # API call with mock fallback
)
```

### Mock Mode Toggle Pattern

Every page should have this at the top:
```python
# Header with mock mode toggle
col_title, col_toggle = st.columns([0.85, 0.15])
with col_title:
    st.title("Page Title")
with col_toggle:
    render_data_mode_toggle(location="top")

if is_mock_mode():
    show_mock_data_banner()
```

### Mock Data Sources

| Constant | Location | Contents |
|----------|----------|----------|
| `MOCK_SIGNALS` | `data_handler.py` | 5 signals with lift, confidence, leads, etc. |
| `MOCK_DATA_SOURCES` | `data_handler.py` | PostHog, Attio, Stripe connection status |
| `MOCK_PLAYBOOKS` | `04_Playbooks.py` | 3 playbooks (2 active, 1 paused) |
| `MOCK_IDENTITIES` | `06_Identities.py` | 12 user identities |

---

## Navigation References

All `st.switch_page()` calls in the codebase:

| From | To | Button/Trigger |
|------|----|----|
| Home.py | pages/01_Signals.py | "Next: Signal Explorer" |
| 01_Signals.py | Home.py | "Back: Setup" |
| 01_Signals.py | pages/03_Backtest.py | "Next: Backtest" |
| 01_Signals.py | pages/02_Signal_Detail.py | "View: [signal]" buttons |
| 02_Signal_Detail.py | pages/01_Signals.py | "Back to Signals" |
| 02_Signal_Detail.py | pages/04_Playbooks.py | "Add to Rule" |
| 03_Backtest.py | pages/01_Signals.py | "Back: Signals" |
| 03_Backtest.py | pages/04_Playbooks.py | "Next: Playbooks" |
| 05_Settings.py | pages/06_Identities.py | "View Identities" |
| 05_Settings.py | pages/01_Signals.py | "View Signals" |
| 06_Identities.py | pages/05_Settings.py | "Back to Settings" |
| 06_Identities.py | pages/01_Signals.py | "View Signals" |

---

## Session State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `use_mock_data` | bool | Toggle between mock/real data |
| `selected_signal_id` | str | Signal ID for detail page |
| `show_create_signal` | bool | Show create signal modal |
| `show_recalc_modal` | bool | Show recalculation modal |
| `creating_playbook` | bool | Show create playbook form |
| `show_webhook_form` | bool | Show webhook config in Settings |
| `integration_status` | dict | {posthog, attio, stripe} connection status |

---

## API Endpoints Used

| Endpoint | Method | Used In |
|----------|--------|---------|
| `/api/signals/list` | GET | 01_Signals.py, 03_Backtest.py |
| `/api/signals/{id}` | GET | 02_Signal_Detail.py |
| `/api/sources/status` | GET | 05_Settings.py |
| `/api/playbooks/list` | GET | 04_Playbooks.py |
| `/api/settings` | GET/POST | 05_Settings.py |
| `/api/destinations/attio/fields` | GET | 05_Settings.py |
| `/api/integrations/test` | POST | Home.py |

---

## Key Code Patterns

### 1. Data Fetching with Mock Fallback
```python
def fetch_data():
    if is_mock_mode():
        return MOCK_DATA
    else:
        response = get_api_data("/api/endpoint")
        if response:
            return response.get('data', [])
        return []
```

### 2. Table with Editable Column
```python
edited_df = st.data_editor(
    df,
    column_config={
        "Enabled": st.column_config.CheckboxColumn("Enabled")
    },
    disabled=["Name", "Status", ...]  # Non-editable columns
)
```

### 3. Tabs Instead of Subheaders
```python
tab_active, tab_paused = st.tabs(["Active", "Paused"])
with tab_active:
    # Active items...
with tab_paused:
    # Paused items...
```

### 4. Expanders for Nested Sections
```python
with st.expander("Section Name", expanded=True):
    # Section content...
```

---

## Testing Checklist

- [ ] Mock mode toggle works on all pages
- [ ] Signal → Detail navigation works
- [ ] Back buttons work on all pages
- [ ] Settings expanders show Sources, Destinations, Settings
- [ ] Identities page shows table and stats
- [ ] Playbooks tabs show Active/Paused correctly
- [ ] Signals table shows deal/revenue columns
- [ ] External "View Data" links open correct URLs

---

## Future Improvements

1. **Backend sync for mock data changes** - Currently toggles don't persist
2. **Real identity resolution** - 06_Identities.py uses hardcoded mock data
3. **Progress indicator update** - 03_Backtest.py still shows old step names
4. **Actual vs Projected calculation** - Currently simulated, needs real data
5. **Webhook testing** - Settings webhook form doesn't actually test
