import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createModuleLogger } from '@/lib/utils/logger';

const log = createModuleLogger('[API][Agent][Columns]');

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get('workspaceId');
        const tableId = searchParams.get('tableId');

        if (!workspaceId || !tableId) {
            return NextResponse.json({ error: 'Missing workspaceId or tableId' }, { status: 400 });
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

        // Get column data from EDA results (table_stats contains column info)
        const admin = createAdminClient();

        const { data: edaResult, error } = await admin
            .from('eda_results')
            .select('table_stats')
            .eq('workspace_id', workspaceId)
            .eq('table_id', tableId)
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            log.error(`Failed to fetch columns: ${error.message}`);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Extract column info from table_stats if available
        const tableStats = edaResult?.table_stats as Record<string, any> | null;
        const columns = tableStats?.columns || [];

        return NextResponse.json({ table_id: tableId, columns });
    } catch (e) {
        log.error(`Columns fetch failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
