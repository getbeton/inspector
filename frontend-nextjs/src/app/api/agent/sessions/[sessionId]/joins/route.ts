import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createModuleLogger } from '@/lib/utils/logger';

const log = createModuleLogger('[API][Agent][Joins]');

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;

        // Authenticate user
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { joins } = body;

        if (!Array.isArray(joins)) {
            return NextResponse.json({ error: 'joins must be an array' }, { status: 400 });
        }

        // Validate join pair structure
        for (const join of joins) {
            if (!join.table1 || !join.col1 || !join.table2 || !join.col2) {
                return NextResponse.json(
                    { error: 'Each join must have table1, col1, table2, col2' },
                    { status: 400 }
                );
            }
        }

        // Look up the session and verify workspace access
        const admin = createAdminClient();

        const { data: session, error: sessionError } = await admin
            .from('workspace_agent_sessions')
            .select('workspace_id')
            .eq('session_id', sessionId)
            .single();

        if (sessionError || !session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // Verify user has access to this workspace
        const { data: membership } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .eq('workspace_id', session.workspace_id)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Save confirmed joins (confirmed_joins column added by migration 012, cast as any)
        const { error } = await (admin as any)
            .from('workspace_agent_sessions')
            .update({
                confirmed_joins: joins,
                updated_at: new Date().toISOString(),
            })
            .eq('session_id', sessionId);

        if (error) {
            log.error(`Failed to save joins for session ${sessionId}: ${error.message}`);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        log.warn(`[AUDIT] Confirmed joins saved session=${sessionId} count=${joins.length}`);
        return NextResponse.json({ success: true });
    } catch (e) {
        log.error(`Save joins failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
