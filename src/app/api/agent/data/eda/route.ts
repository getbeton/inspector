import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
import { rateLimitResponse } from '@/lib/agent/rate-limit';
import type { Database } from '@/lib/supabase/types';

const log = createModuleLogger('[API][Agent][EDA]');

export async function POST(req: NextRequest) {
    if (!validateAgentRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { workspace_id, table_id, join_suggestions, metrics_discovery, table_stats, summary_text } = body;

        if (!workspace_id || !table_id) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Rate limit per workspace
        const limited = rateLimitResponse(workspace_id);
        if (limited) return limited;

        const supabase = createAdminClient();

        // Upsert EDA Results
        const { error } = await supabase
            .from('eda_results')
            .upsert({
                workspace_id,
                table_id,
                join_suggestions,
                metrics_discovery,
                table_stats,
                summary_text,
                updated_at: new Date().toISOString()
            }, { onConflict: 'workspace_id, table_id' });

        if (error) {
            log.error(`Failed to store EDA results: ${error.message}`);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        log.warn(`[AUDIT] EDA upsert workspace=${workspace_id} table=${table_id}`);
        return NextResponse.json({ success: true });
    } catch (e) {
        log.error(`Error processing EDA results: ${e}`);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
    const isAgent = validateAgentRequest(req);
    let supabase;

    if (isAgent) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) {
            log.error('Missing Supabase Service Key for Agent request');
            return NextResponse.json({ error: 'Configuration Error' }, { status: 500 });
        }
        supabase = createSupabaseClient<Database>(url, serviceKey);
    } else {
        supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    const tableId = searchParams.get('tableId');

    if (!workspaceId) {
        return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    }

    const sessionId = searchParams.get('sessionId');

    // Note: `as any` needed because supabase is a union type (SSR client | raw client)
    // and their `.from()` signatures are incompatible with each other
    let query = (supabase as any).from('eda_results').select('*').eq('workspace_id', workspaceId);
    if (sessionId) {
        query = query.eq('session_id', sessionId);
    }
    if (tableId) {
        query = query.eq('table_id', tableId);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

