# Google OAuth with Supabase - Implementation Guide

## Overview

This document describes the complete OAuth implementation for Beton Inspector, enabling Google sign-in via Supabase.

## What Was Implemented

### 1. Backend JWT Validation (`/backend/app/core/jwt_handler.py`)

**Purpose**: Validates Supabase JWT tokens with proper claim validation

**Key Features**:
- Signature verification using `SUPABASE_JWT_SECRET`
- Audience claim validation (must be `"authenticated"`)
- Issuer validation against Supabase project URL
- Expiration checking
- User claim extraction (sub, email, name, provider)
- Graceful error handling with detailed error messages
- Dual library support: python-jose (primary) with PyJWT fallback

**How It Works**:
```python
jwt_handler = get_jwt_handler()
claims = jwt_handler.validate_and_extract_claims(token)
# Returns: { "sub": "user_id", "email": "user@example.com", ... }
```

### 2. Backend Auth Refactoring (`/backend/app/auth.py`)

**Changes**:
- Removed mock JWT validation logic
- Integrated with JWT handler for production token validation
- Maintains DEV mode support (returns mock user when ENV=DEV)
- Clean dependency injection for protected endpoints

**Authentication Flow**:
```
Request with "Authorization: Bearer <jwt_token>"
    ↓
ENV == "DEV"? → Return mock user
    ↓ No
JWT handler validates token → Extract user claims
    ↓
Return user context (sub, email, name, provider)
```

### 3. Frontend OAuth Flow (`/frontend/components/oauth.py`)

**Components**:
- `inject_token_extraction_script()`: Extracts JWT from Supabase OAuth callback
- `handle_oauth_callback()`: Handles token after redirect
- `render_google_oauth_button()`: Google sign-in button with redirect
- `render_development_login()`: Mock login for DEV testing

**Google OAuth Button**:
- Styled Google sign-in button with official Google logo
- Redirects to Supabase OAuth endpoint
- Automatically extracts token after redirect

### 4. Supabase Client (`/frontend/utils/supabase_client.py`)

**Purpose**: Manages Supabase OAuth configuration and redirect URLs

**Key Methods**:
- `get_oauth_redirect_url(provider)`: Generates OAuth redirect URL
- `extract_claims_from_token(token)`: Decodes JWT for display (validation happens on backend)

### 5. OAuth Handler (`/frontend/utils/oauth_handler.py`)

**Purpose**: Orchestrates OAuth flow and user authentication

**Key Methods**:
- `handle_callback()`: Processes OAuth callback and validates token
- `validate_token_with_backend(token)`: Calls `/api/user/workspace` to validate
- `decode_token_claims(token)`: Extracts claims from JWT (for display)

**Flow**:
```
User redirected from Supabase with token
    ↓
Extract token from URL fragment (JavaScript)
    ↓
Call backend to validate token and get workspace
    ↓
Store token and user/workspace info in session
    ↓
Redirect to authenticated app
```

### 6. Backend Workspace Endpoint (`/backend/app/main.py`)

**Endpoint**: `GET /api/user/workspace`

**Features**:
- Creates workspace for first-time users
- Generates workspace name from email domain
- Creates workspace-user membership
- Returns workspace details + isNew flag

**Response**:
```json
{
  "workspace": {
    "id": "uuid",
    "name": "Company Name",
    "slug": "company-name",
    "created_at": "2025-12-25T..."
  },
  "isNew": false
}
```

## Architecture

### Token Flow

```
┌─────────────┐
│   Google    │
│   OAuth     │
└──────┬──────┘
       │
       ├─ User clicks "Sign in with Google"
       │
       ├─ Redirects to: SUPABASE_URL/auth/v1/authorize
       │           ?provider=google&redirect_to=...
       │
       └─► Supabase handles Google authentication
           │
           └─► Redirects back with JWT in URL fragment
               (#access_token=eyJ...&token_type=bearer)

┌──────────────────┐
│  Streamlit App   │
│  (localhost:8501)│
└────────┬─────────┘
         │
         ├─ JavaScript extracts token from URL fragment
         │
         ├─ Stores in sessionStorage
         │
         └─ Calls /api/user/workspace with JWT
            │
            └─►  ┌──────────────────┐
                 │  Backend (8000)  │
                 │  JWT Validation  │
                 └────────┬─────────┘
                          │
                          ├─ Validate signature
                          ├─ Check audience="authenticated"
                          ├─ Verify issuer
                          ├─ Check expiration
                          │
                          └─ Return workspace info
                             (or create new)
```

### Environment Configuration

**Production (Real OAuth)**:
```bash
ENV=production  # or remove ENV=DEV
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...  # Public key for OAuth
SUPABASE_JWT_SECRET=your-jwt-secret  # Private key for validation
```

**Development (Mock Auth)**:
```bash
ENV=DEV  # Default - uses mock authentication
# OAuth still works if Supabase is configured
# Click "Development: Quick Mock Login" to test without OAuth
```

## Testing

### Test DEV Mode Authentication

```bash
# Run test script
./test_oauth_flow.sh

# Output should show:
# ✓ Backend is healthy
# ✓ DEV mode authentication working
# ✓ Workspace endpoint working
# ✓ Frontend is accessible
```

### Test JWT Validation with Real Token

```bash
# Get a valid JWT from Supabase dashboard or Google OAuth
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test validation
curl -X GET "http://localhost:8000/api/me" \
  -H "Authorization: Bearer $TOKEN"
```

### Test Workspace Creation

```bash
# First-time user - should get isNew=true
TOKEN="<valid_jwt_from_google_oauth>"

curl -X GET "http://localhost:8000/api/user/workspace" \
  -H "Authorization: Bearer $TOKEN"

# Response: { "workspace": {...}, "isNew": true }
```

## How to Configure Google OAuth in Supabase

### Step 1: Enable OAuth in Supabase Dashboard

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Authentication** > **Providers**
4. Find **Google** provider and toggle it ON

### Step 2: Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google+ API**
4. Create **OAuth 2.0 Client ID** (type: Web Application)
5. Add authorized redirect URI:
   ```
   https://your-supabase-project.supabase.co/auth/v1/callback?provider=google
   ```
6. Copy:
   - Client ID
   - Client Secret

### Step 3: Add Credentials to Supabase

1. In Supabase Dashboard, under **Authentication** > **Providers** > **Google**
2. Paste:
   - **Client ID**: (from Google Cloud Console)
   - **Client Secret**: (from Google Cloud Console)
3. Click **Save**

### Step 4: Test OAuth Flow

1. Open `http://localhost:8501`
2. Click **"Sign in with Google"**
3. Complete Google authentication
4. You should be redirected and logged in

## Files Created/Modified

### Created Files
- `/frontend/utils/supabase_client.py` - Supabase OAuth client
- `/frontend/utils/oauth_handler.py` - OAuth callback handler
- `/backend/app/core/jwt_handler.py` - JWT validation
- `/backend/app/core/__init__.py` - Module exports
- `/test_oauth_flow.sh` - Test suite

### Modified Files
- `/frontend/components/oauth.py` - Google OAuth button & flow
- `/frontend/components/auth.py` - Login page using Google OAuth
- `/frontend/Home.py` - OAuth callback handling
- `/backend/app/auth.py` - JWT handler integration

## Security Considerations

### ✅ Implemented

1. **Token Validation**
   - JWT signature verified with SUPABASE_JWT_SECRET
   - Audience claim enforced (prevents token misuse)
   - Issuer validated against Supabase URL
   - Expiration checked

2. **Token Security**
   - Tokens stored in Streamlit session state (not localStorage)
   - Tokens passed via Authorization header (not URL)
   - URL fragments cleared after token extraction

3. **User Isolation**
   - Workspace isolation via foreign keys
   - User can only access their own workspace
   - API keys have per-workspace scope (if used)

4. **Frontend Security**
   - No sensitive tokens in logs
   - HTML-escaped output (Streamlit default)
   - HTTPS recommended for production

### ⚠️ To Implement

1. **Rate Limiting**: Add rate limits on authentication endpoints
2. **Session Expiry**: Implement token refresh (Supabase handles, frontend could refresh)
3. **CORS**: Configure CORS properly for production domain
4. **HTTPS**: Use HTTPS in production
5. **Secure Cookies**: Use secure, HttpOnly cookies (optional frontend enhancement)

## Troubleshooting

### "Invalid audience" Error

**Cause**: JWT token doesn't have `"aud": "authenticated"`

**Solution**: Ensure Supabase generates tokens with correct audience claim. Tokens from Google OAuth should have this automatically.

### "Invalid issuer" Error

**Cause**: Token issuer doesn't match SUPABASE_URL

**Solution**:
1. Check SUPABASE_URL is set correctly
2. Ensure token is from correct Supabase project
3. Check issuer in token matches: `{SUPABASE_URL}/auth/v1`

### Frontend OAuth Button Not Appearing

**Cause**: Supabase credentials not loaded

**Solution**:
1. Check `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set
2. Restart Docker containers: `docker-compose restart`
3. Check frontend logs: `docker-compose logs streamlit`

### "Workspace not found" Error

**Cause**: User authenticated but workspace creation failed

**Solution**:
1. Check database connection
2. Verify database migrations ran
3. Check backend logs: `docker-compose logs backend`

## Next Steps

1. **Configure Google OAuth** in Supabase dashboard (see instructions above)
2. **Test with Real Google Account**:
   - Click "Sign in with Google"
   - Authenticate with your Google account
   - Should create workspace and log in
3. **Production Deployment**:
   - Set ENV to production (remove ENV=DEV)
   - Configure HTTPS
   - Add rate limiting
   - Monitor authentication logs
4. **Optional Enhancements**:
   - Add user profile picture display
   - Implement token refresh
   - Add logout flow
   - Multi-workspace support

## API Reference

### Backend Endpoints

#### `GET /api/me`
Get current authenticated user
```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:8000/api/me
```

#### `GET /api/user/workspace`
Get or create user's workspace
```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:8000/api/user/workspace
```

#### `GET /api/user/profile`
Get user profile from JWT claims
```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:8000/api/user/profile
```

### Frontend Components

#### `render_google_oauth_button()`
Renders Google sign-in button
```python
from components.oauth import render_google_oauth_button
render_google_oauth_button()
```

#### `get_supabase_client()`
Get Supabase OAuth client
```python
from utils.supabase_client import get_supabase_client
client = get_supabase_client()
oauth_url = client.get_oauth_redirect_url("google")
```

## Summary

✅ **Complete OAuth Implementation** with:
- Google sign-in via Supabase
- JWT token validation on backend
- Automatic workspace creation for new users
- DEV mode for testing without OAuth
- Comprehensive error handling
- Security best practices

**Status**: Ready for production configuration
**Next**: Configure Google OAuth credentials in Supabase dashboard
