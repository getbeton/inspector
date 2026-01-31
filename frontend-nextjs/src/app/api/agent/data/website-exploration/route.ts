import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
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

        const supabase = await createClient();

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
            } as never, { onConflict: 'workspace_id' });

        if (error) {
            log.error(`Failed to store website results: ${error.message}`);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        log.error(`Error processing website results: ${e}`);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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

    // Note: `as any` needed because supabase is a union type (SSR client | raw client)
    // and their `.from()` signatures are incompatible with each other
    const { data, error } = await (supabase as any)
        .from('website_exploration_results')
        .select('*')
        .eq('workspace_id', workspaceId)
        .single();

    // It's possible to have no results yet
    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || null);
}
