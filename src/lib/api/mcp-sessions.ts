import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionStatus = 'created' | 'running' | 'completed' | 'failed' | 'closed'

export interface McpSession {
  id: string
  session_id: string
  workspace_id: string
  agent_app_name: string
  status: SessionStatus
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
  eda_count: number
  has_website_result: boolean
}

interface SessionsListResponse {
  sessions: McpSession[]
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export async function getMcpSessions(workspaceId: string): Promise<McpSession[]> {
  const res = await apiClient.get<SessionsListResponse>(
    `/api/agent/sessions?workspaceId=${encodeURIComponent(workspaceId)}`,
  )
  return res.sessions
}
