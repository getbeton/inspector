import { NextRequest, NextResponse } from 'next/server';
import { createModuleLogger } from '@/lib/utils/logger';
import { validateAgentRequest } from '@/lib/agent/auth';
import { updateSessionStatus } from '@/lib/agent/session';
import type { AgentSessionStatus } from '@/lib/agent/types';

const log = createModuleLogger('[API][Agent][CloseSession]');

const ALLOWED_CLOSE_STATUSES: AgentSessionStatus[] = ['completed', 'failed', 'closed'];

export async function POST(req: NextRequest) {
    if (!validateAgentRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { session_id, status, error_message } = body;

        if (!session_id) {
            return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
        }

        const targetStatus: AgentSessionStatus = status && ALLOWED_CLOSE_STATUSES.includes(status)
            ? status
            : 'closed';

        await updateSessionStatus(session_id, targetStatus, error_message);

        log.warn(`[AUDIT] Session closed: ${session_id} → ${targetStatus}`);
        return NextResponse.json({ success: true });
    } catch (e) {
        log.error(`Close session failed: ${e}`);
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
