import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
import { rateLimitResponse } from '@/lib/agent/rate-limit';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

const log = createModuleLogger('[API][Agent][WebsiteExp]');

export async function POST(req: NextRequest) {
    if (!validateAgentRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const {
            workspace_id,
            is_b2b,
            plg_type,
            website_url,
            product_assumptions,
            icp_description,
            product_description,
            pricing_model
        } = body;

        if (!workspace_id) {
            return NextResponse.json({ error: 'Missing workspace_id' }, { status: 400 });
        }

        // Rate limit per workspace
        const limited = rateLimitResponse(workspace_id);
        if (limited) return limited;

        const supabase = createAdminClient();

        const { error } = await supabase
            .from('website_exploration_results')
            .upsert({
                workspace_id,
                is_b2b,
                plg_type,
                website_url,
                product_assumptions,
                icp_description,
                product_description,
                pricing_model,
                updated_at: new Date().toISOString()
            }, { onConflict: 'workspace_id' });

        if (error) {
            log.error(`Failed to store website results: ${error.message}`);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        log.warn(`[AUDIT] Website exploration upsert workspace=${workspace_id}`);
        return NextResponse.json({ success: true });
    } catch (e) {
        log.error(`Error processing website results: ${e}`);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { workspaceId, sessionId, ...fields } = body;

        if (!workspaceId) {
            return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
        }

        // Verify workspace membership
        const { data: membership } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .eq('workspace_id', workspaceId)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const admin = createAdminClient();

        // Build update payload with only allowed fields
        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const allowed = ['is_b2b', 'plg_type', 'website_url', 'product_description', 'icp_description', 'product_assumptions', 'pricing_model'];
        for (const key of allowed) {
            if (key in fields) {
                updatePayload[key] = fields[key];
            }
        }

        // Fetch current row to diff for change log
        const { data: current } = await (admin as any)
            .from('website_exploration_results')
            .select('is_b2b, plg_type, website_url, product_description, icp_description, product_assumptions, pricing_model')
            .eq('workspace_id', workspaceId)
            .single();

        // Log field-level diffs to change log table
        const changeEntries: Record<string, unknown>[] = [];
        for (const key of allowed) {
            if (key in fields) {
                const oldVal = current?.[key] ?? null;
                const newVal = fields[key] ?? null;
                if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                    changeEntries.push({
                        workspace_id: workspaceId,
                        field_name: key,
                        old_value: JSON.stringify(oldVal),
                        new_value: JSON.stringify(newVal),
                        changed_by_email: user.email,
                    });
                }
            }
        }
        if (changeEntries.length > 0) {
            await (admin as any).from('business_model_edit_log').insert(changeEntries);
        }

        let query = admin
            .from('website_exploration_results')
            .update(updatePayload)
            .eq('workspace_id', workspaceId);

        if (sessionId) {
            query = query.eq('session_id', sessionId) as typeof query;
        }

        const { error } = await (query as any);

        if (error) {
            log.error(`Website exploration update failed: ${error.message}`);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        log.error(`Website exploration PUT failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

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

    if (!workspaceId) {
        return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    }

    const sessionId = searchParams.get('sessionId');

    // Note: `as any` needed because supabase is a union type (SSR client | raw client)
    // and their `.from()` signatures are incompatible with each other
    let query = (supabase as any)
        .from('website_exploration_results')
        .select('*')
        .eq('workspace_id', workspaceId);

    if (sessionId) {
        query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query.single();

    // It's possible to have no results yet
    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || null);
}
