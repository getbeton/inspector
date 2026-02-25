import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createModuleLogger } from '@/lib/utils/logger';

const log = createModuleLogger('[API][Agent][Sessions]');

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
        }

        // Verify user has access to this workspace
        const { data: membership } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .eq('workspace_id', workspaceId)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Fetch sessions with aggregated counts using admin client (bypasses RLS for joined tables)
        const admin = createAdminClient();

        // Note: confirmed_joins column added by migration 012, cast through `as any` until types regenerated
        const { data: sessions, error } = await (admin as any)
            .from('workspace_agent_sessions')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false }) as { data: any[] | null; error: any };

        if (error) {
            log.error(`Failed to fetch sessions: ${error.message}`);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Get EDA counts and website result existence per session
        const sessionIds = (sessions || []).map(s => s.session_id);

        const edaCounts: Record<string, number> = {};
        const websiteSessions: Set<string> = new Set();

        if (sessionIds.length > 0) {
            // Get internal UUIDs for session lookups
            const sessionUuids = (sessions || []).map(s => s.id);

            // Count EDA results per session
            // Note: session_id column added by migration 012, cast through `as any` until types regenerated
            const { data: edaData } = await (admin as any)
                .from('eda_results')
                .select('session_id')
                .eq('workspace_id', workspaceId)
                .in('session_id', sessionUuids);

            if (edaData) {
                for (const row of edaData as any[]) {
                    if (row.session_id) {
                        edaCounts[row.session_id] = (edaCounts[row.session_id] || 0) + 1;
                    }
                }
            }

            // Check which sessions have website results
            const { data: websiteData } = await (admin as any)
                .from('website_exploration_results')
                .select('session_id')
                .eq('workspace_id', workspaceId)
                .in('session_id', sessionUuids);

            if (websiteData) {
                for (const row of websiteData as any[]) {
                    if (row.session_id) {
                        websiteSessions.add(row.session_id);
                    }
                }
            }
        }

        const enrichedSessions = (sessions || []).map(s => ({
            ...s,
            eda_count: edaCounts[s.id] || 0,
            has_website_result: websiteSessions.has(s.id),
        }));

        return NextResponse.json({ sessions: enrichedSessions });
    } catch (e) {
        log.error(`Sessions list failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
