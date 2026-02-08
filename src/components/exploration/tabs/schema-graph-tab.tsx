'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
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
import {
  TableNode,
  type TableNodeData,
  NODE_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
} from '../schema/table-node'
import { useSessionEdaResults } from '@/lib/hooks/use-explorations'
import type { ExplorationSession, JoinPair } from '@/lib/api/explorations'
import type { EdaResult } from '@/lib/agent/types'

interface SchemaGraphTabProps {
  workspaceId: string | undefined
  session: ExplorationSession
  edaResults?: EdaResult[]
}

const nodeTypes = { tableNode: TableNode }

function getNodeHeight(columnCount: number): number {
  return HEADER_HEIGHT + Math.max(columnCount, 1) * ROW_HEIGHT + 4 // 4px for py-0.5 padding
}

interface CollectedData {
  tableMap: Map<string, TableNodeData>
  uniqueJoins: JoinPair[]
}

function collectData(
  edaResults: Array<{
    table_id: string
    table_stats: Record<string, any> | null
    join_suggestions: Array<{ table1: string; col1: string; table2: string; col2: string }> | null
  }>,
  confirmedJoins: JoinPair[] | null
): CollectedData {
  const tableMap = new Map<string, TableNodeData>()

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

  const joins = confirmedJoins && confirmedJoins.length > 0
    ? confirmedJoins
    : edaResults.flatMap(r => r.join_suggestions || [])

  const seenEdges = new Set<string>()
  const uniqueJoins: JoinPair[] = []
  for (const j of joins) {
    const key = [j.table1, j.col1, j.table2, j.col2].sort().join(':')
    if (!seenEdges.has(key)) {
      seenEdges.add(key)
      uniqueJoins.push(j)
      if (!tableMap.has(j.table1)) {
        tableMap.set(j.table1, { label: j.table1, columns: [] })
      }
      if (!tableMap.has(j.table2)) {
        tableMap.set(j.table2, { label: j.table2, columns: [] })
      }
    }
  }

  return { tableMap, uniqueJoins }
}

function layoutWithDagre(
  dagreLib: typeof import('@dagrejs/dagre'),
  { tableMap, uniqueJoins }: CollectedData
): { nodes: Node<Record<string, unknown>>[]; edges: Edge[] } {
  const g = new dagreLib.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 40 })
  g.setDefaultEdgeLabel(() => ({}))

  const tableIds = Array.from(tableMap.keys()).sort()

  for (const id of tableIds) {
    const data = tableMap.get(id)!
    g.setNode(id, {
      width: NODE_WIDTH,
      height: getNodeHeight(data.columns.length),
    })
  }

  for (const j of uniqueJoins) {
    g.setEdge(j.table1, j.table2)
  }

  dagreLib.layout(g)

  const nodes: Node<Record<string, unknown>>[] = tableIds.map((id) => {
    const pos = g.node(id)
    const data = tableMap.get(id)!
    return {
      id,
      type: 'tableNode',
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - getNodeHeight(data.columns.length) / 2,
      },
      data: data as unknown as Record<string, unknown>,
    }
  })

  const edges: Edge[] = uniqueJoins.map((j, i) => ({
    id: `edge-${i}`,
    source: j.table1,
    sourceHandle: j.col1,
    target: j.table2,
    targetHandle: j.col2,
    type: 'smoothstep',
    style: { strokeWidth: 2 },
    label: `${j.col1} = ${j.col2}`,
    labelStyle: { fontSize: 10, fontFamily: 'monospace' },
    labelBgStyle: { fillOpacity: 0.8 },
  }))

  return { nodes, edges }
}

export function SchemaGraphTab({ workspaceId, session, edaResults: externalEdaResults }: SchemaGraphTabProps) {
  const { data: fetchedEdaResults = [], isLoading: fetchLoading } = useSessionEdaResults(
    externalEdaResults ? undefined : workspaceId,
    externalEdaResults ? undefined : session.session_id,
  )
  const edaResults = externalEdaResults ?? fetchedEdaResults
  const isLoading = externalEdaResults ? false : fetchLoading

  // Lazy-load dagre on client only (it uses CommonJS require internally)
  const dagreRef = useRef<typeof import('@dagrejs/dagre') | null>(null)
  const [dagreLoaded, setDagreLoaded] = useState(false)

  useEffect(() => {
    import('@dagrejs/dagre').then((mod) => {
      dagreRef.current = mod.default as unknown as typeof import('@dagrejs/dagre')
      setDagreLoaded(true)
    })
  }, [])

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!dagreLoaded || !dagreRef.current) return { initialNodes: [], initialEdges: [] }
    const data = collectData(edaResults, session.confirmed_joins)
    const { nodes, edges } = layoutWithDagre(dagreRef.current, data)
    return { initialNodes: nodes, initialEdges: edges }
  }, [edaResults, session.confirmed_joins, dagreLoaded])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  if (isLoading || !dagreLoaded) {
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
