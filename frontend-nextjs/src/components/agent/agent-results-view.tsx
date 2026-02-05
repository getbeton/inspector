'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { WebsiteExplorationResult, EdaResult } from '@/lib/agent/types';

interface AgentResultsViewProps {
    workspaceId: string;
}

export function AgentResultsView({ workspaceId }: AgentResultsViewProps) {
    const [websiteData, setWebsiteData] = useState<WebsiteExplorationResult | null>(null);
    const [edaData, setEdaData] = useState<EdaResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                // Fetch Website Exploration
                const wsRes = await fetch(`/api/agent/data/website-exploration?workspaceId=${workspaceId}`);
                if (wsRes.ok) {
                    const data = await wsRes.json();
                    if (data && !data.error) setWebsiteData(data);
                }

                // Fetch EDA Results
                const edaRes = await fetch(`/api/agent/data/eda?workspaceId=${workspaceId}`);
                if (edaRes.ok) {
                    const data = await edaRes.json();
                    if (Array.isArray(data)) setEdaData(data);
                }
            } catch (e) {
                console.error('Failed to fetch agent data', e);
            } finally {
                setLoading(false);
            }
        }
        if (workspaceId) fetchData();
    }, [workspaceId]);

    if (loading) return <div>Loading Agent Insights...</div>;

    if (!websiteData && edaData.length === 0) {
        return (
            <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                    No insights generated yet. Link your card to trigger the Agent analysis.
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Website Analysis Section */}
            {websiteData && (
                <Card>
                    <CardHeader>
                        <CardTitle>Website Analysis</CardTitle>
                        <CardDescription>Insights from {websiteData.website_url}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="font-semibold mb-2">Business Type</h4>
                                <div className="flex gap-2">
                                    <Badge variant={websiteData.is_b2b ? "default" : "secondary"}>
                                        {websiteData.is_b2b ? 'B2B' : 'B2C'}
                                    </Badge>
                                    {websiteData.plg_type && (
                                        <Badge variant="outline">{websiteData.plg_type.toUpperCase()}</Badge>
                                    )}
                                </div>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-2">ICP</h4>
                                <p className="text-sm text-muted-foreground">{websiteData.icp_description || 'N/A'}</p>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-2">Product Description</h4>
                            <p className="text-sm">{websiteData.product_description}</p>
                        </div>

                        {websiteData.product_assumptions && websiteData.product_assumptions.length > 0 && (
                            <div>
                                <h4 className="font-semibold mb-2">Key Assumptions</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground">
                                    {websiteData.product_assumptions.map((a, i) => (
                                        <li key={i}>{a}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* EDA Results Section */}
            {edaData.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-semibold">Data Warehouse Analysis</h3>
                    {edaData.map((result) => (
                        <Card key={result.id}>
                            <CardHeader>
                                <CardTitle>Table: {result.table_id}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {result.summary_text && (
                                    <p className="text-sm bg-muted p-2 rounded">{result.summary_text}</p>
                                )}

                                {result.metrics_discovery && result.metrics_discovery.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold mb-2">Discovered Metrics</h4>
                                        <div className="grid gap-2">
                                            {result.metrics_discovery.map((m, i) => (
                                                <div key={i} className="border p-2 rounded text-sm">
                                                    <span className="font-bold">{m.name}</span>: {m.description}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {result.join_suggestions && result.join_suggestions.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold mb-2">Join Suggestions</h4>
                                        <ul className="list-disc list-inside text-sm">
                                            {result.join_suggestions.map((j, i) => (
                                                <li key={i}>
                                                    Join <b>{j.table1}</b> ({j.col1}) with <b>{j.table2}</b> ({j.col2})
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
