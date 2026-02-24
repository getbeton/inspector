-- MCP OAuth 2.0 support
-- Enables interactive login for MCP clients (Claude Code, etc.)
-- instead of requiring static API keys in .mcp.json

-- Dynamic client registration (RFC 7591)
-- MCP clients register themselves on first connection
CREATE TABLE mcp_oauth_clients (
  client_id    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  client_name  TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Authorization codes (short-lived, single-use)
-- Bridges the browser login → MCP client token exchange
CREATE TABLE mcp_auth_codes (
  code                  TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri          TEXT NOT NULL,
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  access_token          TEXT NOT NULL,
  refresh_token         TEXT NOT NULL,
  expires_at            TIMESTAMPTZ NOT NULL,
  used_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup for expired code cleanup
CREATE INDEX idx_mcp_auth_codes_expires ON mcp_auth_codes(expires_at);

-- RLS: service_role only (no user-facing policies)
ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_auth_codes ENABLE ROW LEVEL SECURITY;
