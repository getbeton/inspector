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
