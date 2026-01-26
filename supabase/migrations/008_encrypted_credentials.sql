-- Migration: 008_encrypted_credentials
-- Description: Add project_id_encrypted column and comments for encrypted credentials
-- Created: 2026-01-25

-- ============================================
-- Add project_id_encrypted column for storing encrypted project IDs
-- This complements the existing api_key_encrypted column
-- NULL is allowed for backwards compatibility
-- ============================================

ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS project_id_encrypted TEXT;

-- Add documentation comments for encrypted columns
COMMENT ON COLUMN integration_configs.api_key_encrypted IS 'AES-256-GCM encrypted API key (format: salt:iv:tag:ciphertext)';
COMMENT ON COLUMN integration_configs.project_id_encrypted IS 'AES-256-GCM encrypted project ID (format: salt:iv:tag:ciphertext)';
