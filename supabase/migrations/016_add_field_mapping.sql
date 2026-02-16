-- Migration: 016_add_field_mapping
-- Description: Add field_mapping JSONB column to integration_configs for Attio field mapping
-- Created: 2026-02-08

ALTER TABLE integration_configs
  ADD COLUMN IF NOT EXISTS field_mapping JSONB DEFAULT NULL;
