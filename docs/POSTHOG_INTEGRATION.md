# PostHog Integration

This document describes the PostHog workspace configuration system in Beton Inspector.

## Overview

The PostHog integration allows customers to connect their PostHog instance to Beton Inspector for:
- Syncing product usage events
- Detecting PQL (Product Qualified Lead) signals
- Enriching account data with behavioral analytics

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                        │
│                                                              │
│  Settings Page → POST /api/posthog/validate                  │
│                → GET /api/posthog/status                     │
└─────────────────────────┬────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────┐
│                     Backend (FastAPI)                        │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │            PostHog Endpoints                            │ │
│  │  app/api/endpoints/posthog.py                          │ │
│  │  - POST /api/posthog/validate                          │ │
│  │  - GET /api/posthog/status                             │ │
│  │  - POST /api/posthog/disconnect                        │ │
│  └─────────────────────────┬───────────────────────────────┘ │
│                            │                                 │
│  ┌─────────────────────────▼───────────────────────────────┐ │
│  │         PostHogValidatorService                         │ │
│  │  app/services/posthog_validator.py                     │ │
│  │  - validate_credentials()                              │ │
│  │  - validate_and_store_config()                         │ │
│  │  - get_config_status()                                 │ │
│  └─────────────────────────┬───────────────────────────────┘ │
│                            │                                 │
│  ┌─────────────────────────▼───────────────────────────────┐ │
│  │        PostHogWorkspaceClient                           │ │
│  │  app/integrations/posthog_workspace_client.py          │ │
│  │  - validate_credentials() → PostHog API                │ │
│  │  - get_workspace_info()                                │ │
│  │  - get_events_count()                                  │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────┐
│                   PostgreSQL (Supabase)                      │
│                                                              │
│  posthog_workspace_config table:                            │
│  - id, workspace_id, posthog_api_key (encrypted)            │
│  - posthog_workspace_name, posthog_project_id               │
│  - is_validated, validated_at, validation_error             │
│  - last_sync, is_active, created_at, updated_at             │
└──────────────────────────────────────────────────────────────┘
```

## API Reference

### POST /api/posthog/validate

Validate PostHog credentials and store them if valid.

**Request:**
```json
{
  "api_key": "phc_abc123def456..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "workspace_name": "Acme Corp",
  "project_id": "12345",
  "events_count": 15420
}
```

**Error Response (400 - Invalid Format):**
```json
{
  "error": "Invalid API key format. PostHog personal API keys start with 'phc_'",
  "error_type": "invalid_format"
}
```

**Error Response (401 - Unauthorized):**
```json
{
  "error": "Invalid or unauthorized API key",
  "error_type": "unauthorized"
}
```

**Error Response (429 - Rate Limited):**
```json
{
  "error": "Rate limit exceeded. Maximum 5 validation requests per minute.",
  "error_type": "rate_limited"
}
```

### GET /api/posthog/status

Get current PostHog configuration status.

**Response (200):**
```json
{
  "is_configured": true,
  "is_validated": true,
  "is_active": true,
  "workspace_name": "Acme Corp",
  "project_id": "12345",
  "validated_at": "2025-01-15T10:30:00Z",
  "last_sync": "2025-01-15T12:00:00Z",
  "validation_error": null
}
```

### POST /api/posthog/disconnect

Disconnect PostHog integration (deactivate, don't delete).

**Response (200):**
```json
{
  "message": "PostHog integration disconnected successfully"
}
```

## API Key Format

PostHog personal API keys:
- Start with `phc_`
- Are typically 40+ characters long
- Can be created in PostHog: Settings → Project → Personal API Keys

**Example:** `phc_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

## Error Codes

| Error Type | HTTP Status | Description |
|------------|-------------|-------------|
| `invalid_format` | 400 | API key doesn't match expected format |
| `unauthorized` | 401 | API key is invalid or revoked |
| `not_found` | 404 | Project/workspace not found |
| `rate_limited` | 429 | Too many requests (PostHog or Beton limit) |
| `connection_error` | 502 | Network/connection failure |
| `api_error` | 502 | PostHog API returned an error |
| `internal_error` | 500 | Unexpected server error |

## Rate Limiting

- **Beton:** 5 validation requests per minute per workspace
- **PostHog:** Subject to PostHog's API rate limits

## Security

### API Key Storage
- API keys are encrypted using Fernet symmetric encryption
- Encryption key is stored in `BETON_ENCRYPTION_KEY` environment variable
- Keys are never logged or exposed in API responses

### Authentication
- All endpoints require authentication (session cookie or JWT)
- Workspace isolation: users can only access their own workspace config

## Testing

### Run Tests
```bash
# All PostHog integration tests
pytest backend/tests/test_posthog_integration.py -v

# Only unit tests (no external calls)
pytest backend/tests/test_posthog_integration.py -v -m "not integration"

# Integration tests (requires real API key)
POSTHOG_TEST_API_KEY="phc_..." pytest backend/tests/test_posthog_integration.py -v -m integration
```

### cURL Examples

**Validate credentials:**
```bash
curl -X POST http://localhost:8000/api/posthog/validate \
  -H "Content-Type: application/json" \
  -H "Cookie: beton_session=..." \
  -d '{"api_key": "phc_abc123..."}'
```

**Get status:**
```bash
curl http://localhost:8000/api/posthog/status \
  -H "Cookie: beton_session=..."
```

**Disconnect:**
```bash
curl -X POST http://localhost:8000/api/posthog/disconnect \
  -H "Cookie: beton_session=..."
```

## Troubleshooting

### "Invalid API key format"
- Ensure key starts with `phc_`
- Check for extra whitespace
- Verify you're using a Personal API Key, not a Project API Key

### "Unauthorized API key"
- Verify the key in PostHog Settings → Personal API Keys
- Check if the key has been revoked
- Ensure the key has read access to projects

### "Connection error"
- Check network connectivity
- Verify PostHog host URL (default: https://app.posthog.com)
- For self-hosted PostHog, ensure the URL is correct

### "Rate limit exceeded"
- Wait 60 seconds before retrying
- Check if PostHog's rate limits are being hit

## Database Schema

```sql
CREATE TABLE posthog_workspace_config (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    posthog_api_key TEXT NOT NULL,  -- Encrypted
    posthog_workspace_name VARCHAR(255),
    posthog_project_id VARCHAR(255) NOT NULL,
    is_validated BOOLEAN DEFAULT FALSE,
    validated_at TIMESTAMP,
    validation_error TEXT,
    last_sync TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ix_posthog_workspace_config_workspace_id ON posthog_workspace_config(workspace_id);
CREATE INDEX ix_posthog_workspace_config_is_validated ON posthog_workspace_config(is_validated);
```

## Files Reference

| File | Description |
|------|-------------|
| `backend/app/integrations/posthog_workspace_client.py` | PostHog API client for validation |
| `backend/app/services/posthog_validator.py` | Validation service |
| `backend/app/api/endpoints/posthog.py` | API endpoints |
| `backend/app/models.py` | `PosthogWorkspaceConfig` model |
| `backend/alembic/versions/6f7a8b9c0d1e_*.py` | Database migration |
| `backend/tests/test_posthog_integration.py` | Test suite |
