# 🎯 Beton Signal Discovery Engine

## Overview

The Beton Signal Discovery Engine is a signal discovery and validation platform for B2B SaaS companies. It automatically finds which user behaviors predict revenue outcomes, validates those signals against historical data (backtesting), and tracks whether predictions continue to work over time.

## Key Features

### 🔍 Automated Signal Discovery
- Automatically discovers behavioral signals that predict conversion
- Validates signals with statistical rigor (lift, confidence intervals, p-values)
- Monitors signal health and accuracy degradation over time

### 📊 Dashboard
- Real-time metrics: Leads, Conversion Rate, Pipeline Influenced, Signal Accuracy
- Accuracy trend visualization
- Signal health monitoring
- Recent leads tracking

### 🎯 Signal Management
- Browse all discovered signals with filtering and sorting
- View detailed backtest results for each signal
- Enable/disable signals
- Track signal performance over time

### 🧪 Custom Signal Backtesting
- **Visual Builder**: Define signals using intuitive dropdowns and conditions
- **SQL Editor**: Write custom SQL queries for advanced signal definitions
- Simulate backtest results with statistical validation
- Calculate projected ARR impact
- Get recommendations (Enable vs Review)

### 📋 Playbooks
- Combine multiple signals into playbooks
- Configure actions: Slack alerts, Attio CRM updates, email sequences
- Track playbook performance metrics

### 📤 Destinations
- **Attio CRM Integration**: Auto-match fields, sync lead data
- **Slack Integration**: Send alerts to sales channels
- **Webhooks**: Configure custom webhooks for signal events

### ⚙️ Settings
- Configure revenue settings (ACV, baseline conversion, sales cycle)
- Set signal thresholds (minimum confidence, sample size, lift)

## Architecture

### Backend (FastAPI)
- **Location**: `/backend/app/`
- **Key Files**:
  - `signal_stub_data.py`: Mock data for signals, backtesting, and analytics
  - `main.py`: API endpoints for signal discovery (added at the end)

### Frontend (Streamlit)
- **Location**: `/frontend/`
- **Key Files**:
  - `Signal_Discovery.py`: Main app with dashboard
  - `pages/02_Sources.py`: Data sources status
  - `pages/03_Signals.py`: Signals list with filtering
  - `pages/04_Signal_Detail.py`: Detailed signal view with backtest results
  - `pages/05_Backtest.py`: Custom signal builder and testing
  - `pages/06_Playbooks.py`: Playbook configuration
  - `pages/07_Destinations.py`: Output destinations (Attio, Slack, Webhooks)
  - `pages/08_Settings.py`: Company settings

## API Endpoints

### Signal Discovery
- `GET /api/signals/list` - List all signals with calculated ARR
- `GET /api/signals/{signal_id}` - Get detailed signal information
- `GET /api/signals/dashboard/metrics` - Dashboard aggregated metrics
- `POST /api/signals/backtest` - Run backtest simulation

### Data Sources
- `GET /api/sources/status` - Get status of all data sources

### Playbooks
- `GET /api/playbooks/list` - List all playbooks

### Settings
- `GET /api/settings` - Get company settings
- `POST /api/settings` - Update company settings

### Destinations
- `GET /api/destinations/attio/fields` - Get Attio field mapping
- `POST /api/destinations/attio/auto-match` - Auto-match Attio fields

### Utilities
- `GET /api/posthog/events` - List PostHog events for filter builder
- `GET /api/posthog/properties` - List PostHog properties for filter builder

## Running the Application

### Prerequisites
- Python 3.10+
- PostgreSQL (for backend database)
- Environment variables configured

### Backend
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
streamlit run Signal_Discovery.py --server.port 8501
```

### Access
- Frontend: http://localhost:8501
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Key Differentiators

### 1. Backtesting Capability
Unlike competitors (Pocus, Common Room, MadKudu) that ask users to define scoring rules based on intuition, Beton inverts this: "Show us your data → we find signals that work → we prove they work with backtesting."

### 2. Signal Validation
Every signal comes with statistical proof:
- Lift (conversion multiplier)
- 95% Confidence intervals
- p-values
- Sample sizes (with/without signal)
- Historical accuracy trends

### 3. User-Defined Testing
Users can test ANY hypothesis before deploying:
- Visual builder for non-technical users
- SQL editor for power users
- Instant backtest simulation
- Projected ARR calculations

### 4. Health Monitoring
Automatic detection of signal degradation:
- Tracks accuracy over time
- Alerts when signals stop working
- Prevents stale signals from affecting decisions

## Data Flow

1. **Data Ingestion**: PostHog (events) + Attio (CRM) + Stripe (billing)
2. **Signal Discovery**: Automated analysis finds predictive patterns
3. **Validation**: Backtest against historical data
4. **Monitoring**: Track accuracy, detect degradation
5. **Action**: Trigger playbooks (Slack, Attio, webhooks)

## Mock Data

The current implementation uses stub data for demonstration:
- 10 pre-discovered signals
- 6 months of accuracy trends
- Realistic backtest results
- Sample leads and playbooks

## Future Enhancements

- [ ] Real ML-based signal discovery engine
- [ ] Live PostHog/Attio integration (currently simulated)
- [ ] Advanced filtering and segmentation
- [ ] A/B testing for signals
- [ ] Multi-tenant support
- [ ] Real-time signal monitoring
- [ ] Custom notification channels
- [ ] Signal marketplace/templates

## Technical Decisions

### Why Streamlit?
- Rapid prototyping
- Built-in state management
- Easy data visualization
- Python-native (matches backend)

### Why Stub Data?
- Allows demonstration without real integrations
- Faster iteration during development
- Easy to test edge cases
- Can be swapped for real data later

### Why FastAPI?
- Modern async Python framework
- Auto-generated API docs
- Fast performance
- Easy integration with existing stack

## License

MIT License

## Support

For questions or issues, refer to the main repository README or create an issue on GitHub.
