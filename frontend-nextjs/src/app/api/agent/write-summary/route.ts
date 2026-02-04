import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
import { rateLimitResponse } from '@/lib/agent/rate-limit';
import { resolveSession, updateSessionStatus } from '@/lib/agent/session';
import type { WriteSummaryRequest } from '@/lib/agent/types';

const log = createModuleLogger('[API][Agent][WriteSummary]');

export async function POST(req: NextRequest) {
    if (!validateAgentRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body: WriteSummaryRequest = await req.json();
        const { session_id, eda_results, website_exploration } = body;

        if (!session_id) {
            return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
        }

        if (!eda_results && !website_exploration) {
            return NextResponse.json({ error: 'At least one of eda_results or website_exploration is required' }, { status: 400 });
        }

        // Resolve session → workspace
        let workspaceId: string;
        try {
            const session = await resolveSession(session_id);
            workspaceId = session.workspaceId;
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Invalid session';
            return NextResponse.json({ error: msg }, { status: 404 });
        }

        // Rate limit per workspace
        const limited = rateLimitResponse(workspaceId);
        if (limited) return limited;

        const supabase = createAdminClient();
        const now = new Date().toISOString();

        // Upsert EDA results (if provided)
        if (eda_results && eda_results.length > 0) {
            for (const eda of eda_results) {
                if (!eda.table_id) {
                    log.warn(`Skipping EDA entry without table_id in session=${session_id}`);
                    continue;
                }

                const { error } = await supabase
                    .from('eda_results')
                    .upsert({
                        workspace_id: workspaceId,
                        table_id: eda.table_id,
                        join_suggestions: eda.join_suggestions,
                        metrics_discovery: eda.metrics_discovery,
                        table_stats: eda.table_stats,
                        summary_text: eda.summary_text,
                        updated_at: now,
                    }, { onConflict: 'workspace_id, table_id' });

                if (error) {
                    log.error(`EDA upsert failed for table=${eda.table_id}: ${error.message}`);
                    return NextResponse.json({ error: `EDA upsert failed: ${error.message}` }, { status: 500 });
                }
            }

            log.warn(`[AUDIT] Write-summary EDA upsert workspace=${workspaceId} tables=${eda_results.map(e => e.table_id).join(',')}`);
        }

        // Upsert website exploration (if provided)
        if (website_exploration) {
            // Build the upsert payload explicitly for type compatibility
            // pricing_model is JSONB in Postgres but typed as string in generated types
            const wePayload: Record<string, unknown> = {
                workspace_id: workspaceId,
                is_b2b: website_exploration.is_b2b,
                plg_type: website_exploration.plg_type,
                website_url: website_exploration.website_url,
                product_assumptions: website_exploration.product_assumptions,
                icp_description: website_exploration.icp_description,
                product_description: website_exploration.product_description,
                pricing_model: website_exploration.pricing_model,
                updated_at: now,
            };

            const { error } = await (supabase as any)
                .from('website_exploration_results')
                .upsert(wePayload, { onConflict: 'workspace_id' });

            if (error) {
                log.error(`Website exploration upsert failed: ${error.message}`);
                return NextResponse.json({ error: `Website exploration upsert failed: ${error.message}` }, { status: 500 });
            }

            log.warn(`[AUDIT] Write-summary website exploration upsert workspace=${workspaceId}`);
        }

        // Mark session as completed
        await updateSessionStatus(session_id, 'completed');

        return NextResponse.json({ success: true });
    } catch (e) {
        log.error(`Write-summary failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
