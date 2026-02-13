'use client'

import { useMemo, useState, useEffect } from 'react'
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

// ---------------------------------------------------------------------------
// dagre types — we load the library dynamically to avoid CJS/SSR conflicts
// ---------------------------------------------------------------------------

interface DagreLib {
  graphlib: { Graph: new () => DagreGraph }
  layout: (g: DagreGraph) => void
}

interface DagreGraph {
  setGraph: (opts: Record<string, unknown>) => void
  setDefaultEdgeLabel: (fn: () => Record<string, unknown>) => void
  setNode: (id: string, opts: { width: number; height: number }) => void
  setEdge: (a: string, b: string) => void
  node: (id: string) => { x: number; y: number }
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

interface SchemaGraphTabProps {
  workspaceId: string | undefined
  session: ExplorationSession
  edaResults?: EdaResult[]
}

const nodeTypes = { tableNode: TableNode }

function getNodeHeight(columnCount: number): number {
  return HEADER_HEIGHT + Math.max(columnCount, 1) * ROW_HEIGHT + 4
}

function buildGraph(
  dagre: DagreLib,
  edaResults: Array<{
    table_id: string
    table_stats: Record<string, any> | null
    join_suggestions: Array<{ table1: string; col1: string; table2: string; col2: string }> | null
  }>,
  confirmedJoins: JoinPair[] | null
): { nodes: Node<Record<string, unknown>>[]; edges: Edge[] } {
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
      if (!tableMap.has(j.table1)) tableMap.set(j.table1, { label: j.table1, columns: [] })
      if (!tableMap.has(j.table2)) tableMap.set(j.table2, { label: j.table2, columns: [] })
    }
  }

  // Dagre layout
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 40 })
  g.setDefaultEdgeLabel(() => ({}))

  const tableIds = Array.from(tableMap.keys()).sort()

  for (const id of tableIds) {
    const data = tableMap.get(id)!
    g.setNode(id, { width: NODE_WIDTH, height: getNodeHeight(data.columns.length) })
  }
  for (const j of uniqueJoins) {
    g.setEdge(j.table1, j.table2)
  }

  dagre.layout(g)

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

// ---------------------------------------------------------------------------
// Inner component — only mounts once dagre + data are ready,
// so useNodesState initialises with the correct computed values.
// ---------------------------------------------------------------------------

function SchemaGraphInner({
  nodes: initialNodes,
  edges: initialEdges,
}: {
  nodes: Node<Record<string, unknown>>[]
  edges: Edge[]
}) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

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
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
        <Background gap={16} size={1} />
      </ReactFlow>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Outer component — loads dagre, fetches data, renders inner when ready.
// ---------------------------------------------------------------------------

export function SchemaGraphTab({ workspaceId, session, edaResults: externalEdaResults }: SchemaGraphTabProps) {
  const { data: fetchedEdaResults = [], isLoading: fetchLoading } = useSessionEdaResults(
    externalEdaResults ? undefined : workspaceId,
    externalEdaResults ? undefined : session.session_id,
  )
  const edaResults = externalEdaResults ?? fetchedEdaResults
  const isLoading = externalEdaResults ? false : fetchLoading

  // Lazy-load dagre on client only (it uses CJS require() internally)
  const [dagre, setDagre] = useState<DagreLib | null>(null)

  useEffect(() => {
    let cancelled = false
    import('@dagrejs/dagre').then((mod) => {
      if (cancelled) return
      // CJS default export: mod.default is the dagre object; fall back to mod itself
      const lib = (mod.default ?? mod) as unknown as DagreLib
      setDagre(lib)
    })
    return () => { cancelled = true }
  }, [])

  const graph = useMemo(() => {
    if (!dagre) return null
    return buildGraph(dagre, edaResults, session.confirmed_joins)
  }, [dagre, edaResults, session.confirmed_joins])

  if (isLoading || !dagre) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No schema data available. Complete an exploration to see the graph.
      </div>
    )
  }

  // Key on node count so SchemaGraphInner remounts if schema data changes
  return <SchemaGraphInner key={graph.nodes.length} nodes={graph.nodes} edges={graph.edges} />
}
