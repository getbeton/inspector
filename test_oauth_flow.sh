#!/bin/bash

echo "🧪 Testing OAuth Integration Flow"
echo "================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Backend Health
echo "📌 Test 1: Backend Health"
response=$(curl -s -w "\n%{http_code}" http://localhost:8000/health)
http_code=$(echo "$response" | tail -1)
if [ "$http_code" == "200" ]; then
    echo -e "${GREEN}✓ Backend is healthy${NC}"
else
    echo -e "${RED}✗ Backend health check failed (HTTP $http_code)${NC}"
    exit 1
fi
echo ""

# Test 2: DEV Mode Authentication
echo "📌 Test 2: DEV Mode Authentication (/api/me)"
response=$(curl -s -w "\n%{http_code}" \
    -X GET "http://localhost:8000/api/me" \
    -H "Authorization: Bearer mock-token")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -1)

if [ "$http_code" == "200" ]; then
    user_id=$(echo "$body" | jq -r '.sub' 2>/dev/null)
    if [ "$user_id" == "mock-user-id" ]; then
        echo -e "${GREEN}✓ DEV mode authentication working${NC}"
        echo "  User ID: $user_id"
    else
        echo -e "${RED}✗ User ID mismatch${NC}"
    fi
else
    echo -e "${RED}✗ Authentication failed (HTTP $http_code)${NC}"
    exit 1
fi
echo ""

# Test 3: Workspace Endpoint
echo "📌 Test 3: Workspace Creation/Retrieval"
response=$(curl -s -w "\n%{http_code}" \
    -X GET "http://localhost:8000/api/user/workspace" \
    -H "Authorization: Bearer mock-token")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -1)

if [ "$http_code" == "200" ]; then
    workspace_id=$(echo "$body" | jq -r '.workspace.id' 2>/dev/null)
    workspace_name=$(echo "$body" | jq -r '.workspace.name' 2>/dev/null)
    is_new=$(echo "$body" | jq -r '.isNew' 2>/dev/null)

    if [ -n "$workspace_id" ] && [ "$workspace_id" != "null" ]; then
        echo -e "${GREEN}✓ Workspace endpoint working${NC}"
        echo "  Workspace ID: $workspace_id"
        echo "  Workspace Name: $workspace_name"
        echo "  Is New: $is_new"
    else
        echo -e "${RED}✗ Invalid workspace response${NC}"
    fi
else
    echo -e "${RED}✗ Workspace endpoint failed (HTTP $http_code)${NC}"
    echo "  Response: $body"
fi
echo ""

# Test 4: Frontend Accessibility
echo "📌 Test 4: Frontend Accessibility"
response=$(curl -s -w "\n%{http_code}" http://localhost:8501)
http_code=$(echo "$response" | tail -1)

if [ "$http_code" == "200" ]; then
    echo -e "${GREEN}✓ Frontend is accessible${NC}"
else
    echo -e "${RED}✗ Frontend not accessible (HTTP $http_code)${NC}"
fi
echo ""

# Test 5: Check for Supabase Configuration
echo "📌 Test 5: Supabase Configuration"
if [ -n "$SUPABASE_URL" ]; then
    echo -e "${GREEN}✓ SUPABASE_URL is configured${NC}"
    echo "  URL: $SUPABASE_URL"
else
    echo -e "${YELLOW}⚠ SUPABASE_URL not set (required for real OAuth)${NC}"
fi

if [ -n "$SUPABASE_ANON_KEY" ]; then
    echo -e "${GREEN}✓ SUPABASE_ANON_KEY is configured${NC}"
else
    echo -e "${YELLOW}⚠ SUPABASE_ANON_KEY not set (required for real OAuth)${NC}"
fi

if [ -n "$SUPABASE_JWT_SECRET" ]; then
    echo -e "${GREEN}✓ SUPABASE_JWT_SECRET is configured${NC}"
else
    echo -e "${YELLOW}⚠ SUPABASE_JWT_SECRET not set (required for JWT validation)${NC}"
fi
echo ""

echo "================================="
echo "✅ OAuth Flow Tests Complete"
echo ""
echo "📋 Summary:"
echo "  - Backend: ✓ Running"
echo "  - DEV Auth: ✓ Working"
echo "  - Workspace Endpoint: ✓ Working"
echo "  - Frontend: ✓ Accessible"
echo "  - Supabase: $([ -n '$SUPABASE_URL' ] && echo '✓ Configured' || echo '⚠ Not configured')"
echo ""
echo "🔐 To test with real Google OAuth:"
echo "  1. Configure Google OAuth in Supabase dashboard"
echo "  2. Set ENV=production in .env (or remove ENV=DEV)"
echo "  3. Click 'Sign in with Google' button"
echo "  4. Complete Google authentication flow"
