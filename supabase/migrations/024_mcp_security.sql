-- Migration 024: MCP Security Hardening
--
-- Fixes:
--   C3: TOCTOU race condition in auth code redemption (atomic UPDATE+RETURNING)
--   H5: O(N) bcrypt scan on API key validation (key_prefix index)

-- ─── C3: Atomic auth code redemption ──────────────────────────────────────────
-- Instead of SELECT (unused) then UPDATE (mark used), a single UPDATE...RETURNING
-- atomically claims the code. Two concurrent requests will never both succeed.

CREATE OR REPLACE FUNCTION redeem_mcp_auth_code(p_code TEXT)
RETURNS TABLE (
  id UUID,
  code TEXT,
  client_id TEXT,
  user_id UUID,
  redirect_uri TEXT,
  code_challenge TEXT,
  code_challenge_method TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) LANGUAGE sql AS $$
  UPDATE mcp_auth_codes
  SET used_at = NOW()
  WHERE mcp_auth_codes.code = p_code
    AND mcp_auth_codes.used_at IS NULL
  RETURNING
    mcp_auth_codes.id,
    mcp_auth_codes.code,
    mcp_auth_codes.client_id,
    mcp_auth_codes.user_id,
    mcp_auth_codes.redirect_uri,
    mcp_auth_codes.code_challenge,
    mcp_auth_codes.code_challenge_method,
    mcp_auth_codes.access_token,
    mcp_auth_codes.refresh_token,
    mcp_auth_codes.expires_at,
    mcp_auth_codes.used_at,
    mcp_auth_codes.created_at;
$$;

-- ─── H5: API key prefix for O(1) lookup ──────────────────────────────────────
-- Store first 12 chars of the plaintext key so we can narrow bcrypt comparison
-- to a single row instead of scanning all keys.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(12);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
  ON api_keys(key_prefix)
  WHERE key_prefix IS NOT NULL;
