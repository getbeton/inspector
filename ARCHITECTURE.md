# Beton Inspector - Architecture Guide

Quick reference for developers working on this codebase.

---

## Tech Stack

- **Frontend:** Streamlit (Python)
- **Backend:** FastAPI (Python)
- **Database:** PostgreSQL
- **Containerization:** Docker Compose

---

## Running the App

```bash
# Start all services
docker-compose up -d

# Access points
Frontend:  http://localhost:8501
Backend:   http://localhost:8000
API Docs:  http://localhost:8000/docs
Database:  localhost:5432 (postgres/password)

# Logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## Frontend Structure

```
frontend/
├── Home.py                      # Entry point, mock/real mode toggle
├── pages/
│   ├── 01_Signals.py            # Signal table with deals/revenue
│   ├── 02_Signal_Detail.py      # Single signal stats
│   ├── 03_Backtest.py           # Signal testing & performance
│   ├── 04_Playbooks.py          # Rule configuration
│   ├── 05_Settings.py           # Sources + Destinations + Settings
│   └── 06_Identities.py         # User identity table
└── utils/
    └── data_handler.py          # Shared mock data & utilities
```

---

## Key Files to Know

### `utils/data_handler.py`
Central utility file. Contains:
- `is_mock_mode()` - Check if mock data is active
- `render_data_mode_toggle()` - Render the mock/real toggle
- `show_mock_data_banner()` - Show "Using Mock Data" banner
- `get_api_data()` - API calls with mock mode parameter
- `MOCK_SIGNALS` - 5 sample signals
- `MOCK_DATA_SOURCES` - PostHog, Attio, Stripe status

### `01_Signals.py`
Main signal explorer. Key sections:
- Lines 51-80: Filters (status, lift, source, confidence)
- Lines 102-123: Recalculation modal
- Lines 125-194: Create signal modal
- Lines 251-316: Signal table with deals/revenue columns
- Lines 326-336: Click-to-view signal detail buttons

### `05_Settings.py`
Consolidated settings page with 3 expanders:
- Lines 36-139: Data Sources expander
- Lines 144-259: Destinations expander
- Lines 264-381: Revenue & Signal Settings expander

### `04_Playbooks.py`
Rule configuration with tabs:
- Lines 22-57: MOCK_PLAYBOOKS data
- Lines 92-155: Active tab
- Lines 157-207: Paused tab
- Lines 209-276: Create playbook form

---

## Mock Mode System

Every page follows this pattern:

```python
# 1. Import utilities
from utils.data_handler import (
    is_mock_mode,
    render_data_mode_toggle,
    show_mock_data_banner,
    get_mock_signals
)

# 2. Header with toggle
col_title, col_toggle = st.columns([0.85, 0.15])
with col_title:
    st.title("Page Title")
with col_toggle:
    render_data_mode_toggle(location="top")

# 3. Mock banner
if is_mock_mode():
    show_mock_data_banner()

# 4. Data fetching
if is_mock_mode():
    data = MOCK_DATA
else:
    data = fetch_from_api()
```

---

## Navigation Map

```
Home.py
  └→ 01_Signals.py ←→ 02_Signal_Detail.py
       └→ 03_Backtest.py
            └→ 04_Playbooks.py

05_Settings.py ←→ 06_Identities.py
     ↑
     └── 01_Signals.py (from Data Sources)
```

### Navigation Code
```python
# Go to page
st.switch_page("pages/01_Signals.py")

# Pass data via session state
st.session_state.selected_signal_id = signal['id']
st.switch_page("pages/02_Signal_Detail.py")

# Read in target page
signal_id = st.session_state.get('selected_signal_id')
```

---

## Common Patterns

### Table with Editable Column
```python
edited_df = st.data_editor(
    df,
    column_config={
        "Enabled": st.column_config.CheckboxColumn("Enabled")
    },
    disabled=["Name", "Status"]
)
```

### Tabs Instead of Subheaders
```python
tab1, tab2 = st.tabs(["Active", "Paused"])
with tab1:
    # Active content
with tab2:
    # Paused content
```

### Expanders for Sections
```python
with st.expander("Section Name", expanded=True):
    # Content
```

### Loading States
```python
with st.spinner("Loading..."):
    data = fetch_data()
```

### External Links
```python
st.link_button("View Data", "https://app.posthog.com")
```

---

## Session State Variables

| Variable | Purpose |
|----------|---------|
| `use_mock_data` | True = mock mode |
| `selected_signal_id` | For detail page |
| `show_create_signal` | Create modal visibility |
| `creating_playbook` | Create form visibility |
| `integration_status` | {posthog, attio, stripe} |

---

## Backend Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/signals/list` | List all signals |
| `GET /api/signals/{id}` | Signal details |
| `GET /api/sources/status` | Data source health |
| `GET /api/playbooks/list` | List playbooks |
| `GET/POST /api/settings` | Company settings |

---

## Quick Edits

### Add a new filter
In `01_Signals.py`, add column in filter section (~line 51):
```python
with filter_col5:
    new_filter = st.selectbox("New Filter", ["All", "Option1"])
```

### Add a new signal column
In `01_Signals.py`, modify table_data (~line 275):
```python
table_data.append({
    # existing columns...
    "New Column": signal.get('new_field', 0)
})
```

### Add mock data
In `utils/data_handler.py`, add to `MOCK_SIGNALS` (~line 170):
```python
{
    "id": "sig_006",
    "name": "New Signal",
    # ... other fields
}
```

### Add a new page
1. Create `pages/07_NewPage.py`
2. Add mock mode imports
3. Add to navigation in relevant pages
4. Streamlit auto-adds to sidebar

---

## Debugging

```bash
# View logs
docker-compose logs -f streamlit
docker-compose logs -f backend

# Restart single service
docker-compose restart streamlit

# Shell into container
docker exec -it beton-inspector-streamlit-1 bash
```

---

## File Sizes Reference

| File | Lines | Purpose |
|------|-------|---------|
| 01_Signals.py | ~364 | Signal explorer |
| 02_Signal_Detail.py | ~205 | Signal details |
| 03_Backtest.py | ~485 | Backtesting |
| 04_Playbooks.py | ~277 | Playbooks |
| 05_Settings.py | ~418 | Settings |
| 06_Identities.py | ~175 | Identities |
| data_handler.py | ~261 | Utilities |
