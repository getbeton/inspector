import { createAdminClient } from '@/lib/supabase/admin';
import { createModuleLogger } from '@/lib/utils/logger';

const log = createModuleLogger('[AgentSession]');

export type AgentSessionStatus = 'created' | 'running' | 'completed' | 'failed' | 'closed';

const TERMINAL_STATUSES: AgentSessionStatus[] = ['completed', 'failed', 'closed'];

/**
 * Look up a session by its string ID and return the associated workspace_id.
 * Rejects sessions in terminal states (completed, failed, closed).
 *
 * Returns sessionUUID (the internal UUID primary key) for use as FK
 * in tables like posthog_queries.session_id.
 */
export async function resolveSession(
    sessionId: string
): Promise<{ workspaceId: string; status: AgentSessionStatus; sessionUUID: string }> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('workspace_agent_sessions')
        .select('id, workspace_id, status')
        .eq('session_id', sessionId)
        .single();

    if (error || !data) {
        log.warn(`Session not found: ${sessionId}`);
        throw new Error('Session not found');
    }

    const status = data.status as AgentSessionStatus;

    if (TERMINAL_STATUSES.includes(status)) {
        log.warn(`Session ${sessionId} is in terminal state: ${status}`);
        throw new Error(`Session is ${status}`);
    }

    return { workspaceId: data.workspace_id, status, sessionUUID: data.id };
}

/**
 * Create a new session record in the database.
 */
export async function createSession(
    sessionId: string,
    workspaceId: string,
    appName: string = 'upsell_agent'
): Promise<void> {
    const supabase = createAdminClient();

    const { error } = await supabase
        .from('workspace_agent_sessions')
        .insert({
            session_id: sessionId,
            workspace_id: workspaceId,
            agent_app_name: appName,
            status: 'created',
        });

    if (error) {
        log.error(`Failed to create session ${sessionId}: ${error.message}`);
        throw new Error(`Failed to create session: ${error.message}`);
    }

    log.info(`Session created: ${sessionId} for workspace ${workspaceId}`);
}

/**
 * Update a session's status and optionally set an error message.
 * Automatically sets `started_at` for 'running' and `completed_at` for terminal states.
 */
export async function updateSessionStatus(
    sessionId: string,
    status: AgentSessionStatus,
    errorMessage?: string
): Promise<void> {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const update: Record<string, unknown> = {
        status,
        updated_at: now,
    };

    if (status === 'running') {
        update.started_at = now;
    }

    if (TERMINAL_STATUSES.includes(status)) {
        update.completed_at = now;
    }

    if (errorMessage !== undefined) {
        update.error_message = errorMessage;
    }

    const { error } = await supabase
        .from('workspace_agent_sessions')
        .update(update)
        .eq('session_id', sessionId);

    if (error) {
        log.error(`Failed to update session ${sessionId}: ${error.message}`);
        throw new Error(`Failed to update session: ${error.message}`);
    }

    log.info(`Session ${sessionId} → ${status}`);
}
