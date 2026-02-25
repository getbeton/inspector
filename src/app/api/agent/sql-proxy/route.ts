import { NextRequest, NextResponse } from 'next/server';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
import { rateLimitResponse } from '@/lib/agent/rate-limit';
import { resolveSession } from '@/lib/agent/session';
import { createPostHogClientForWorkspace } from '@/lib/integrations/posthog/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createQueryServiceForAgent } from '@/lib/services/query-service';
import { withErrorHandler } from '@/lib/middleware/error-handler';

const log = createModuleLogger('[API][Agent][SQLProxy]');

export async function POST(req: NextRequest) {
    // Step 1: Validate agent auth (early return)
    if (!validateAgentRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Parse body — session_id required, workspace_id removed
    const body = await req.json();
    const { query, session_id } = body;

    if (!query) {
        return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    if (!session_id) {
        return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    // Step 3: Resolve session → workspaceId + internal UUID
    let workspaceId: string;
    let sessionUUID: string;
    try {
        const session = await resolveSession(session_id);
        workspaceId = session.workspaceId;
        sessionUUID = session.sessionUUID;
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid session';
        return NextResponse.json({ error: msg }, { status: 404 });
    }

    // Step 4: In-memory rate limit (burst protection, first gate)
    const limited = rateLimitResponse(workspaceId, { maxRequests: 20 });
    if (limited) return limited;

    // Step 5: Audit log — L9 fix: Increased truncation limit from 80 to 500 chars
    log.warn(`[AUDIT] SQL proxy query workspace=${workspaceId} session=${session_id} query=${query.substring(0, 500)}`);

    // Steps 6-9: QueryService execution (wrapped with error handler for consistent formatting)
    // ConfigurationError, InvalidQueryError, RateLimitError, TimeoutError, PostHogAPIError
    // all get mapped to appropriate HTTP responses by withErrorHandler.
    const executeQuery = withErrorHandler(async () => {
        const posthogClient = await createPostHogClientForWorkspace(workspaceId);
        const adminClient = createAdminClient();
        const queryService = createQueryServiceForAgent(adminClient, posthogClient);

        const response = await queryService.execute(workspaceId, query, {
            sessionId: sessionUUID,
        });

        return NextResponse.json({
            results: response.results.results,
            columns: response.results.columns,
            query_status: response.results.status,
            cached: response.cached,
            query_id: response.queryId,
            execution_time_ms: response.results.execution_time_ms,
            row_count: response.results.row_count,
            rate_limit: {
                remaining: response.rateLimitStatus.remaining,
                limit: response.rateLimitStatus.limit,
                reset_at: response.rateLimitStatus.resetAt instanceof Date
                    ? response.rateLimitStatus.resetAt.toISOString()
                    : response.rateLimitStatus.resetAt,
            },
        });
    });

    return executeQuery(req);
}
