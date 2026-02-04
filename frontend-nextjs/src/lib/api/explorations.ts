import { apiClient } from './client'
import type { EdaResult, WebsiteExplorationResult, TableColumnsResponse } from '@/lib/agent/types'
import type { AgentSessionStatus } from '@/lib/agent/session'

// ============================================
// Types
// ============================================

export interface ExplorationSession {
  id: string
  session_id: string
  workspace_id: string
  agent_app_name: string
  status: AgentSessionStatus
  error_message: string | null
  confirmed_joins: JoinPair[] | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
  eda_count: number
  has_website_result: boolean
}

export interface JoinPair {
  table1: string
  col1: string
  table2: string
  col2: string
}

export interface SessionsListResponse {
  sessions: ExplorationSession[]
}

// ============================================
// API Functions
// ============================================

export async function getSessions(workspaceId: string): Promise<ExplorationSession[]> {
  const res = await apiClient.get<SessionsListResponse>(
    `/api/agent/sessions?workspaceId=${encodeURIComponent(workspaceId)}`
  )
  return res.sessions
}

export async function getSessionEdaResults(
  workspaceId: string,
  sessionId: string
): Promise<EdaResult[]> {
  return apiClient.get<EdaResult[]>(
    `/api/agent/data/eda?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=${encodeURIComponent(sessionId)}`
  )
}

export async function getSessionWebsiteResult(
  workspaceId: string,
  sessionId: string
): Promise<WebsiteExplorationResult | null> {
  return apiClient.get<WebsiteExplorationResult | null>(
    `/api/agent/data/website-exploration?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=${encodeURIComponent(sessionId)}`
  )
}

export async function getTableColumns(
  workspaceId: string,
  tableId: string
): Promise<TableColumnsResponse> {
  return apiClient.get<TableColumnsResponse>(
    `/api/agent/data/columns?workspaceId=${encodeURIComponent(workspaceId)}&tableId=${encodeURIComponent(tableId)}`
  )
}

export async function saveConfirmedJoins(
  sessionId: string,
  joins: JoinPair[]
): Promise<{ success: boolean }> {
  return apiClient.put<{ success: boolean }>(
    `/api/agent/sessions/${encodeURIComponent(sessionId)}/joins`,
    { joins }
  )
}

export async function updateWebsiteExploration(
  workspaceId: string,
  sessionId: string,
  data: Partial<WebsiteExplorationResult>
): Promise<{ success: boolean }> {
  return apiClient.put<{ success: boolean }>(
    `/api/agent/data/website-exploration`,
    { workspaceId, sessionId, ...data }
  )
}
