// Re-export for convenience
export type { AgentSessionStatus } from './session';

// ============================================
// Data exploration types (list-tables, list-columns)
// ============================================

export interface TableInfo {
    table_name: string;
    source_type?: string | null;
}

export interface ColumnInfo {
    name: string;
    type: string;
    samples: unknown[];
}

export interface TableColumnsResponse {
    table_name: string;
    queryable_name: string;
    source_type?: string | null;
    columns: ColumnInfo[];
}

// ============================================
// Write-summary composite request
// ============================================

export interface WriteSummaryEdaEntry {
    table_id: string;
    join_suggestions?: EdaResult['join_suggestions'];
    metrics_discovery?: EdaResult['metrics_discovery'];
    table_stats?: EdaResult['table_stats'];
    summary_text?: string;
}

export interface WriteSummaryWebsiteExploration {
    is_b2b?: boolean | null;
    plg_type?: string | null;
    website_url?: string | null;
    product_assumptions?: unknown;
    icp_description?: string | null;
    product_description?: string | null;
    pricing_model?: unknown;
}

export interface WriteSummaryRequest {
    session_id: string;
    eda_results?: WriteSummaryEdaEntry[];
    website_exploration?: WriteSummaryWebsiteExploration;
}

// ============================================
// Existing types
// ============================================

export interface WebsiteExplorationResult {
    id: string;
    workspace_id: string;
    is_b2b: boolean | null;
    plg_type: 'plg' | 'slg' | 'hybrid' | 'not_applicable' | null;
    website_url: string | null;
    product_assumptions: string[] | null;
    icp_description: string | null;
    product_description: string | null;
    pricing_model: Record<string, any> | null;
    updated_at: string;
}

export interface EdaResult {
    id: string;
    workspace_id: string;
    table_id: string;
    join_suggestions: Array<{
        table1: string;
        col1: string;
        table2: string;
        col2: string;
    }> | null;
    metrics_discovery: Array<{
        name: string;
        description: string;
        tables: string[];
    }> | null;
    table_stats: Record<string, any> | null;
    summary_text: string | null;
    updated_at: string;
}
