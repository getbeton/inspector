# 🏗️ Beton Inspector

**Beton Inspector** is your construction inspector for product and revenue data. Get instant insights with built-in mock data, CRM enrichment simulation, and AI-powered sales play recommendations. No database setup required to get started!

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
- [Usage](#usage)
- [Database Schema](#database-schema)
- [Inspection Rules](#inspection-rules)
- [Limitations & Assumptions](#limitations--assumptions)
- [Development](#development)

---

## 🎯 Overview

Beton Inspector helps GTM (Go-To-Market) and RevOps teams identify and prioritize high-value users and accounts based on product usage patterns, intent signals, and AI-powered insights.

**Key Concept:** Just like a construction inspector checks buildings against building codes, Beton Inspector checks your product data against "inspection rules" (PQL/PQA criteria) and produces findings – a punch list of accounts and users that match your targeting criteria.

**🆕 NEW: Mock Data First Approach**
- Start immediately with built-in mock data (15 accounts, 15 users, 31 event types)
- Simulate CRM enrichment with one click
- Generate AI-powered sales play recommendations
- No ClickHouse required for evaluation

**Data Sources:**
- **Mock Data** - Built-in sample data for immediate evaluation
- **PostHog Cloud** - Connect to your PostHog account via API
- **ClickHouse** - Connect to PostHog-style CDP data in ClickHouse

Supported data types:
- Events (user actions)
- Persons (users)
- Accounts (companies/organizations)

---

## ✨ Features

### 🆕 New Mock Data & AI Features
- **📊 Instant Mock Data** - Load 15 accounts with realistic usage patterns immediately
- **✨ CRM Enrichment Simulation** - One-click enrichment with company intel, intent signals, tech stack
- **🤖 AI Sales Plays** - Generate downloadable, account-specific sales recommendations
- **📋 Standard Events Library** - 31 pre-loaded PLG signal events from industry best practices
- **📈 Data Explorer** - View all enriched data in sortable, filterable tables
- **💾 Export Everything** - Download enriched data (CSV) and recommendations (Markdown)

### 🔗 PostHog Integration (New!)
- **PostHog Cloud API** - Connect directly to your PostHog account (US/EU cloud)
- **Real-Time Data Sync** - Fetch events, persons, and analytics from PostHog
- **No Database Required** - Access your PostHog data without ClickHouse setup
- **Account Extraction** - Automatically extract account data from event properties
- **Seamless Integration** - Use all Beton Inspector features with PostHog data

### 🔧 ClickHouse Features (Optional)
- **ClickHouse Integration** - Connect to your ClickHouse database with PostHog-style CDP data
- **Schema Mapping** - Flexible schema configuration to adapt to your specific table/column names
- **Exploratory Views** - Visualize and explore your events, users, and accounts
- **Inspection Rules** - Define PQL/PQA-like rules with intuitive conditions
- **Punch List** - Execute rules and get prioritized, scorable findings

### 🎯 General
- **Local-First** - No authentication required, runs entirely locally
- **Fast Setup** - Get started in under 2 minutes with mock data

---

## 🛠️ Tech Stack

- **Streamlit** - Web UI framework
- **PostHog API** - Analytics data integration (via `requests`)
- **ClickHouse** - Optional database (via `clickhouse-connect`)
- **Pandas** - Data manipulation
- **Pydantic** - Data validation and configuration
- **Plotly** - Interactive charts

---

## 🚀 Quickstart

### Prerequisites

- Python 3.10+ (Python 3.9 may work)
- No database required for evaluation!
- **Optional:** ClickHouse instance if you want to connect your own data

### Installation

1. **Clone or download this repository:**

```bash
cd beton-inspector
```

2. **Create a virtual environment:**

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies:**

```bash
pip install -r requirements.txt
```

4. **Run the application:**

```bash
streamlit run app.py
```

The app will open in your browser at `http://localhost:8501`

5. **Load mock data and start exploring:**

- Go to **📊 Data Explorer**
- Click **"📥 Load Mock Data"**  
- Click **"✨ Enrich with CRM Data"**
- Explore enriched accounts and users!

6. **Generate AI sales plays:**

- Go to **🤖 AI Sales Plays**
- Select an account
- Click **"Generate AI Sales Plays"**
- Download recommendations as Markdown

---

## ⚙️ Configuration

### PostHog Connection (New!)

Connect to PostHog Cloud directly via API:

1. Navigate to **🔗 PostHog Connection** page
2. Get your credentials from PostHog:
   - **Personal API Key**: Settings → Personal API Keys (starts with `phx_`)
   - **Project ID**: Found in your project URL or Settings
3. Select your cloud region:
   - US Cloud: `https://us.i.posthog.com` (default)
   - EU Cloud: `https://eu.i.posthog.com`
   - Custom: Your self-hosted PostHog URL
4. Click **Save & Test Connection**
5. Click **Load Data from PostHog** to fetch your analytics data

**Features:**
- Fetches events from configurable time range (1-90 days)
- Loads person (user) data
- Extracts account information from event properties (`company_domain`)
- Configurable data limits to respect API rate limits

### ClickHouse Connection (Optional)

Configure in the app UI (`Connection & Schema Config` page) or via environment variables:

```bash
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default
```

### Schema Mapping

Beton Inspector needs to know where to find your events, persons, and accounts. Configure this in the `Connection & Schema Config` page.

**Default PostHog-Style Schema:**

#### Events Table (`events`)
- `event` (String) - Event name
- `distinct_id` (String) - User identifier
- `timestamp` (DateTime) - Event timestamp
- `properties` (String) - JSON-encoded event properties
- `person_id` (Nullable String) - Person ID

#### Persons Table (`persons`)
- `id` (String) - Person ID
- `created_at` (DateTime) - Person creation timestamp
- `properties` (String) - JSON-encoded person properties (email, name, etc.)
- `is_identified` (UInt8) - Whether person is identified

#### Accounts Table (`accounts`)
- `account_id` (String) - Account ID
- `name` (String) - Account name
- `domain` (String) - Account domain (used for linking)
- `arr` (Nullable Float64) - Annual Recurring Revenue
- `segment` (Nullable String) - Customer segment
- `owner_email` (Nullable String) - Account owner
- `properties` (String) - JSON-encoded account properties

#### Person-DistinctID Mapping (`person_distinct_id`)
- `person_id` (String) - Person ID
- `distinct_id` (String) - Distinct ID
- `team_id` (Nullable Int64) - Team/project ID

**Account Linking:**
- Events link to accounts via `properties.company_domain` matching `accounts.domain`
- Configurable in Schema Mapping section

---

## 📖 Usage

### Quick Start with PostHog (Recommended)

1. Navigate to **🔗 PostHog Connection**
2. Enter your PostHog API credentials
3. Click **Save & Test Connection**
4. Click **Load Data from PostHog**
5. Go to **📊 Data Explorer** and select "PostHog" as data source
6. Explore your events, persons, and accounts!

### Alternative: Configure ClickHouse Connection

1. Navigate to **Connection & Schema Config**
2. Enter your ClickHouse credentials
3. Click **Save & Test Connection**
4. Map your schema (table and column names)
5. Click **Save Schema Mapping**

### Step 2: Explore Your Data

1. Navigate to **Exploratory Views**
2. Select a time range (e.g., Last 30 days)
3. Explore:
   - Event volume over time
   - Top events by count
   - Top users by activity
   - Top accounts by usage

This validates that your data is wired correctly.

### Step 3: Create Inspection Rules

1. Navigate to **Inspection Rules**
2. Go to **Create New Rule** tab
3. Define your rule:
   - **Name**: e.g., "PQL: High Intent Trial Users"
   - **Level**: User or Account
   - **Time Window**: e.g., 30 days
   - **Conditions**: 
     - Event names (e.g., "signed_up", "created_project")
     - Minimum event count
     - Minimum active days
     - For accounts: minimum active users
   - **Scoring Weights**: Adjust to prioritize different factors
4. Click **Create Rule**

**Example Rules:**

**PQL - High Intent Trial Users**
- Level: User
- Time Window: 7 days
- Conditions:
  - Events: signed_up, completed_onboarding, created_project
  - Min event count: 10
  - Min active days: 3
  - Max days since last event: 3

**PQA - Active Accounts with Multiple Users**
- Level: Account
- Time Window: 30 days
- Conditions:
  - Min active users: 3
  - Min account events: 50
  - Max days since last event: 7

**Churn Risk - Previously Active, Now Disengaged**
- Level: Account
- Time Window: 90 days
- Conditions:
  - Min account events: 100 (historically active)
  - Max days since last event: 30 (but no recent activity in last 30 days)

### Step 4: Run Punch List

1. Navigate to **Punch List**
2. Select an inspection rule
3. Click **Run Inspection**
4. Review findings:
   - View generated SQL
   - See summary metrics
   - Filter and sort results
5. Export to CSV for further action

**Punch List Columns:**

For **user-level** findings:
- Score (computed based on weights)
- User ID
- Email
- Name
- Event count
- Distinct events
- Active days
- Days since last event
- Last seen

For **account-level** findings:
- Score
- Account ID
- Name
- Domain
- Segment
- ARR
- Event count
- Active users
- Active days
- Days since last event
- Last seen

---

## 🗄️ Database Schema

### Complete Schema Reference

#### Events Table
```sql
CREATE TABLE events (
    event String,
    distinct_id String,
    timestamp DateTime,
    properties String,  -- JSON: company_domain, $current_url, plan, etc.
    person_id Nullable(String)
) ENGINE = MergeTree()
ORDER BY (timestamp, distinct_id);
```

#### Persons Table
```sql
CREATE TABLE persons (
    id String,
    created_at DateTime,
    properties String,  -- JSON: email, name, job_title, company_domain, etc.
    is_identified UInt8
) ENGINE = MergeTree()
ORDER BY id;
```

#### Person-DistinctID Mapping
```sql
CREATE TABLE person_distinct_id (
    person_id String,
    distinct_id String,
    team_id Nullable(Int64)
) ENGINE = MergeTree()
ORDER BY (person_id, distinct_id);
```

#### Accounts Table
```sql
CREATE TABLE accounts (
    account_id String,
    name String,
    domain String,
    arr Nullable(Float64),
    segment Nullable(String),
    owner_email Nullable(String),
    properties String  -- JSON: industry, employees, country, etc.
) ENGINE = MergeTree()
ORDER BY account_id;
```

---

## 📏 Inspection Rules

### Rule Structure

```python
{
  "name": "Rule Name",
  "description": "What this rule identifies",
  "level": "user" | "account",
  "time_window_days": 30,
  "conditions": {
    "event_names": ["event1", "event2"],  # OR logic
    "min_event_count": 10,
    "min_distinct_events": 3,
    "min_active_days": 5,
    "max_days_since_last_event": 7,
    "event_property_filters": {"key": "value"},  # AND logic
    # Account-level only:
    "min_active_users": 3,
    "min_account_events": 50
  },
  "scoring_weights": {
    "event_count_weight": 1.0,
    "active_days_weight": 2.0,
    "recency_weight": -0.5
  }
}
```

### Scoring Formula

```python
score = (
    w1 * log(1 + event_count) +
    w2 * active_days +
    w3 * days_since_last_event
)
```

Where:
- `w1` = event_count_weight (typically positive)
- `w2` = active_days_weight (typically positive)
- `w3` = recency_weight (typically negative, penalizes stale users)

Higher scores = higher priority findings.

### SQL Generation

Rules are automatically translated into ClickHouse SQL. Example:

**User-Level Rule:**
```sql
SELECT 
    e.distinct_id as entity_id,
    any(JSONExtractString(p.properties, 'email')) as email,
    any(JSONExtractString(p.properties, 'name')) as name,
    count() as event_count,
    count(DISTINCT e.event) as distinct_event_count,
    count(DISTINCT toDate(e.timestamp)) as active_days,
    max(e.timestamp) as last_seen,
    dateDiff('day', max(e.timestamp), now()) as days_since_last_event,
    count() as key_event_count
FROM events e
LEFT JOIN persons p ON e.person_id = p.id
WHERE e.timestamp >= now() - INTERVAL 30 DAY
  AND e.event IN ('signed_up', 'created_project')
GROUP BY entity_id
HAVING event_count >= 10 
  AND active_days >= 3
ORDER BY event_count DESC
```

---

## ⚠️ Limitations & Assumptions

### Current Limitations

1. **Authentication**: No user authentication; designed for local/trusted environments
2. **Rule Expressiveness**: Simple AND/OR logic; no complex nested boolean expressions
3. **Event Property Filters**: Exact string/number matching only (no regex, ranges, etc.)
4. **Schema**: Assumes JSON properties are stored as strings (uses `JSONExtractString`)
5. **Single Database**: Connects to one ClickHouse database at a time
6. **No Real-Time Updates**: Rules and findings are computed on-demand, not continuously
7. **Local Storage**: Rules stored in local JSON files (not in ClickHouse)
8. **PostHog API Limits**: Rate limits apply based on your PostHog plan
9. **PostHog Data Volume**: Large datasets may take time to load; use smaller time windows
10. **Account Extraction**: PostHog accounts are extracted from event properties, not native groups

### Assumptions

1. **PostHog-Style Schema**: Assumes PostHog-like table structure (customizable via schema mapping)
2. **Account Linking**: Events link to accounts via `properties.company_domain` matching `accounts.domain`
3. **Person-Event Linking**: Uses `person_id` column or `distinct_id` mapping
4. **JSON Properties**: Properties stored as JSON strings (ClickHouse String type, not JSON type)
5. **Time-Based Analysis**: All rules operate within a time window (no lifetime metrics)

---

## 🧪 Development

### Project Structure

```
beton-inspector/
├── app.py                    # Main Streamlit app
├── config.py                 # Configuration models (ClickHouse + PostHog)
├── db.py                     # ClickHouse connection & query builders
├── posthog_connector.py      # PostHog API connection & data loader
├── models.py                 # Pydantic data models
├── rules_engine.py           # Rule → SQL translation logic
├── storage.py                # Local JSON storage for rules
├── mock_data.py             # Mock data generator
├── mock_data_loader.py      # Mock data loader utility
├── requirements.txt          # Python dependencies
├── .env.example             # Example environment variables
├── .gitignore               # Git ignore patterns
├── README.md                # This file
└── pages/                   # Streamlit pages
    ├── 1_Connection_and_Schema_Config.py  # ClickHouse config
    ├── 2_Exploratory_Views.py            # ClickHouse data views
    ├── 3_Inspection_Rules.py             # Rule management
    ├── 4_Punch_List.py                   # Rule execution
    ├── 5_Data_Explorer.py                # Mock/PostHog data explorer
    ├── 6_AI_Sales_Plays.py               # AI recommendations
    └── 7_PostHog_Connection.py           # PostHog integration
```

### Adding New Features

**Adding a New Event Property Filter Type:**
1. Update `RuleCondition` model in `models.py`
2. Update SQL generation in `rules_engine.py`
3. Update UI in `pages/3_Inspection_Rules.py`

**Adding a New Scoring Algorithm:**
1. Update `InspectionRule.compute_score()` in `models.py`
2. Add new weight fields to the model
3. Update UI in rule creation form

**Adding Real-Time Updates:**
1. Replace local JSON storage with ClickHouse storage
2. Add scheduled rule execution
3. Add notifications/webhooks for new findings

### Running Tests

Currently no automated tests. Manual testing workflow:

1. Generate mock data: `python mock_data.py`
2. Start app: `streamlit run app.py`
3. Test each page:
   - Configure connection
   - Explore data
   - Create rules
   - Run punch list
   - Export CSV

---

## 🚢 Deployment (Railway: staging + production)

This repo is deployed to Railway using GitHub integration with two Railway environments:
- **staging** deploys from the `staging` branch
- **production** deploys from the `main` branch

Promotion model:
- Merge feature branches into `staging` (auto-deploys staging)
- Promote `staging` → `main` via PR (auto-deploys production)

For the full runbook (including backend DB migrations): see `DEPLOYMENT.md`.

---

## 📝 License

This project is provided as-is for demonstration and internal use.

---

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- **Enhanced rule expressions** (nested boolean logic)
- **More sophisticated scoring** (ML-based scoring)
- **Real-time monitoring** (continuous rule execution)
- **Integrations** (Slack, email, CRM sync)
- **Multi-database support** (connect to multiple ClickHouse instances)
- **User authentication** (multi-user access control)
- **Automated tests** (unit and integration tests)

---

## 📧 Support

For questions or issues, refer to the code comments or extend the functionality as needed.

---

**Built with Streamlit 🎈**

