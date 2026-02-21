-- Migration: 017_agent_fetch_cache
-- Description: Session-scoped URL cache for agent fetch-url proxy
-- Created: 2026-02-20

-- ============================================
-- TABLE: agent_fetch_cache
-- Caches scraped web content per agent session to avoid re-scraping
-- ============================================

CREATE TABLE agent_fetch_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES workspace_agent_sessions(session_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    operation TEXT NOT NULL DEFAULT 'scrape',
    content JSONB NOT NULL,
    content_size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (session_id, url, operation)
);

-- Note: the UNIQUE constraint above already creates a B-tree index on (session_id, url, operation),
-- so no additional index is needed for lookups.

-- ============================================
-- ENABLE RLS (admin-only access via service role)
-- ============================================

ALTER TABLE agent_fetch_cache ENABLE ROW LEVEL SECURITY;
