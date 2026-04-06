-- Migration: multi_user_workspaces
-- Description: Enable multi-user workspaces with invites and domain-based joining
-- Created: 2026-04-06
-- Related: Multi-User Workspace epic

-- ============================================
-- 1. DROP SINGLE-WORKSPACE CONSTRAINT
-- ============================================
-- Migration 007 added UNIQUE(user_id) to prevent race-condition duplicates.
-- Now we intentionally allow users to belong to multiple workspaces.

ALTER TABLE workspace_members
DROP CONSTRAINT IF EXISTS workspace_members_user_id_unique;

-- ============================================
-- 2. WORKSPACE INVITES TABLE
-- ============================================
-- Supports two invite types:
--   'email' — sent to a specific email, single-use
--   'link'  — shareable URL, optionally multi-use

CREATE TABLE workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  token VARCHAR(255) NOT NULL UNIQUE,
  invite_type VARCHAR(20) NOT NULL DEFAULT 'email',
  invited_by UUID NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INTEGER DEFAULT 1,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_invite_type CHECK (invite_type IN ('email', 'link')),
  CONSTRAINT valid_invite_role CHECK (role IN ('admin', 'member')),
  CONSTRAINT email_required_for_email_type CHECK (
    invite_type = 'link' OR email IS NOT NULL
  )
);

CREATE INDEX idx_workspace_invites_token ON workspace_invites(token);
CREATE INDEX idx_workspace_invites_email ON workspace_invites(email);
CREATE INDEX idx_workspace_invites_workspace ON workspace_invites(workspace_id);

COMMENT ON TABLE workspace_invites IS 'Workspace membership invitations — email-based or shareable link';
COMMENT ON COLUMN workspace_invites.token IS 'Secure random token used in invite URL';
COMMENT ON COLUMN workspace_invites.max_uses IS 'For link invites: NULL = unlimited uses';

-- ============================================
-- 3. WORKSPACE DOMAINS TABLE
-- ============================================
-- Maps email domains to workspaces for auto-join suggestions.
-- One domain can only belong to one workspace (UNIQUE constraint).

CREATE TABLE workspace_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  added_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (domain)
);

CREATE INDEX idx_workspace_domains_domain ON workspace_domains(domain);

COMMENT ON TABLE workspace_domains IS 'Claimed email domains for workspace auto-join suggestions';

-- ============================================
-- 4. RLS POLICIES — workspace_invites
-- ============================================

ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;

-- Members can view invites for their workspaces
CREATE POLICY "Members can view workspace invites"
  ON workspace_invites FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspaces()));

-- Members can create invites (API layer enforces admin+ role)
CREATE POLICY "Members can create workspace invites"
  ON workspace_invites FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

-- Members can update invites (for accepting — API layer enforces rules)
CREATE POLICY "Members can update workspace invites"
  ON workspace_invites FOR UPDATE
  USING (workspace_id IN (SELECT get_user_workspaces()));

-- Members can delete invites (revoke — API layer enforces admin+ role)
CREATE POLICY "Members can delete workspace invites"
  ON workspace_invites FOR DELETE
  USING (workspace_id IN (SELECT get_user_workspaces()));

-- ============================================
-- 5. RLS POLICIES — workspace_domains
-- ============================================

ALTER TABLE workspace_domains ENABLE ROW LEVEL SECURITY;

-- Members can view domains for their workspaces
CREATE POLICY "Members can view workspace domains"
  ON workspace_domains FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspaces()));

-- Members can manage domains (API layer enforces owner-only)
CREATE POLICY "Members can create workspace domains"
  ON workspace_domains FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspaces()));

CREATE POLICY "Members can delete workspace domains"
  ON workspace_domains FOR DELETE
  USING (workspace_id IN (SELECT get_user_workspaces()));
