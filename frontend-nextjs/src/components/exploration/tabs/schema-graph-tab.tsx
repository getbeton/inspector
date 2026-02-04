'use client'

import { useMemo, useCallback } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TableNode, type TableNodeData } from '../schema/table-node'
import { useSessionEdaResults } from '@/lib/hooks/use-explorations'
import type { ExplorationSession, JoinPair } from '@/lib/api/explorations'

interface SchemaGraphTabProps {
  workspaceId: string | undefined
  session: ExplorationSession
}

const nodeTypes = { tableNode: TableNode }

function buildGraph(
  edaResults: Array<{
    table_id: string
    table_stats: Record<string, any> | null
    join_suggestions: Array<{ table1: string; col1: string; table2: string; col2: string }> | null
  }>,
  confirmedJoins: JoinPair[] | null
): { nodes: Node<Record<string, unknown>>[]; edges: Edge[] } {
  const tableMap = new Map<string, TableNodeData>()

  // Collect tables and their columns from EDA results
  for (const result of edaResults) {
    const stats = result.table_stats as Record<string, any> | null
    const columns = (stats?.columns || []) as Array<{ col_name?: string; name?: string; col_type?: string; type?: string }>

    tableMap.set(result.table_id, {
      label: result.table_id,
      columns: columns.map(c => ({
        name: c.col_name || c.name || '',
        type: c.col_type || c.type || '',
      })),
    })
  }

  // Determine which joins to use for edges
  const joins = confirmedJoins && confirmedJoins.length > 0
    ? confirmedJoins
    : edaResults.flatMap(r => r.join_suggestions || [])

  // De-duplicate joins
  const seenEdges = new Set<string>()
  const uniqueJoins: JoinPair[] = []
  for (const j of joins) {
    const key = [j.table1, j.col1, j.table2, j.col2].sort().join(':')
    if (!seenEdges.has(key)) {
      seenEdges.add(key)
      uniqueJoins.push(j)

      // Ensure both tables exist in the map (even if no EDA result)
      if (!tableMap.has(j.table1)) {
        tableMap.set(j.table1, { label: j.table1, columns: [] })
      }
      if (!tableMap.has(j.table2)) {
        tableMap.set(j.table2, { label: j.table2, columns: [] })
      }
    }
  }

  // Layout: simple grid arrangement
  const tableIds = Array.from(tableMap.keys()).sort()
  const cols = Math.max(2, Math.ceil(Math.sqrt(tableIds.length)))

  const nodes: Node<Record<string, unknown>>[] = tableIds.map((id, i) => ({
    id,
    type: 'tableNode',
    position: {
      x: (i % cols) * 280,
      y: Math.floor(i / cols) * 260,
    },
    data: tableMap.get(id)! as unknown as Record<string, unknown>,
  }))

  const edges: Edge[] = uniqueJoins.map((j, i) => ({
    id: `edge-${i}`,
    source: j.table1,
    target: j.table2,
    type: 'smoothstep',
    label: `${j.col1} = ${j.col2}`,
    style: { strokeWidth: 2 },
    labelStyle: { fontSize: 10, fontFamily: 'monospace' },
    labelBgStyle: { fillOpacity: 0.8 },
  }))

  return { nodes, edges }
}

export function SchemaGraphTab({ workspaceId, session }: SchemaGraphTabProps) {
  const { data: edaResults = [], isLoading } = useSessionEdaResults(workspaceId, session.session_id)

  const { initialNodes, initialEdges } = useMemo(() => {
    const { nodes, edges } = buildGraph(edaResults, session.confirmed_joins)
    return { initialNodes: nodes, initialEdges: edges }
  }, [edaResults, session.confirmed_joins])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No schema data available. Complete an exploration to see the graph.
      </div>
    )
  }

  return (
    <div className="h-[500px] border rounded-lg overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
        <Background gap={16} size={1} />
      </ReactFlow>
    </div>
  )
}
