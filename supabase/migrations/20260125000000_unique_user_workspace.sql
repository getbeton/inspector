-- Migration: 007_unique_user_workspace
-- Description: Add unique constraint on user_id to prevent race condition duplicate workspaces
-- Created: 2026-01-25
-- Related: PR #30 code review recommendation

-- ============================================
-- ISSUE: Race Condition in Auth Callback
-- ============================================
-- The auth callback checks for existing membership and creates workspace if missing.
-- Concurrent signups for the same user could theoretically create duplicate workspaces.
-- This constraint ensures each user can only have one workspace membership.
--
-- FUTURE: If multi-workspace support is needed, this constraint can be removed
-- and the auth callback logic updated to handle workspace selection.
-- ============================================

-- Add unique constraint on user_id
-- This prevents the race condition where concurrent signup requests
-- could create multiple workspaces for the same user
ALTER TABLE workspace_members
ADD CONSTRAINT workspace_members_user_id_unique UNIQUE (user_id);

COMMENT ON CONSTRAINT workspace_members_user_id_unique ON workspace_members IS
'Ensures one workspace per user. Remove if multi-workspace support is needed.';
