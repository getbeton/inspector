import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateAgentRequest } from '@/lib/agent/auth';

export async function GET(req: NextRequest) {
    if (!validateAgentRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
        return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch workspace details (domain, name)
    // We already added website_url to workspaces in migration 009
    const { data: workspace, error } = await supabase
        .from('workspaces')
        .select('id, name, slug, website_url')
        .eq('id', workspaceId)
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!workspace) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return NextResponse.json(workspace);
}
