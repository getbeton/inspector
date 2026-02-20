'use client'

import { useMemo } from 'react'
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
// Layout helpers — simple BFS-based layering (replaces dagre)
// ---------------------------------------------------------------------------

interface SchemaGraphTabProps {
  workspaceId: string | undefined
  session?: ExplorationSession
  edaResults?: EdaResult[]
}

const nodeTypes = { tableNode: TableNode }

const X_GAP = 100
const Y_GAP = 40

function getNodeHeight(columnCount: number): number {
  return HEADER_HEIGHT + Math.max(columnCount, 1) * ROW_HEIGHT + 4
}

function buildGraph(
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

  // --- BFS-based LR layering ---
  const tableIds = Array.from(tableMap.keys())
  const outgoing = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const id of tableIds) {
    outgoing.set(id, [])
    inDegree.set(id, 0)
  }
  for (const j of uniqueJoins) {
    if (tableMap.has(j.table1) && tableMap.has(j.table2)) {
      outgoing.get(j.table1)!.push(j.table2)
      inDegree.set(j.table2, (inDegree.get(j.table2) ?? 0) + 1)
    }
  }

  // Roots = nodes with no incoming edges
  const roots = tableIds.filter(id => (inDegree.get(id) ?? 0) === 0)

  // Assign layers via BFS (longest path from any root)
  const layers = new Map<string, number>()
  for (const id of tableIds) layers.set(id, 0)

  const queue = [...roots]
  const visited = new Set<string>(roots)

  while (queue.length > 0) {
    const id = queue.shift()!
    const currentLayer = layers.get(id)!
    for (const target of outgoing.get(id) ?? []) {
      const newLayer = currentLayer + 1
      if (newLayer > (layers.get(target) ?? 0)) {
        layers.set(target, newLayer)
      }
      if (!visited.has(target)) {
        visited.add(target)
        queue.push(target)
      }
    }
  }

  // Fallback: place any unvisited nodes (cycles / disconnected) into an extra layer
  const maxLayer = Math.max(...layers.values(), 0)
  for (const id of tableIds) {
    if (!visited.has(id)) {
      layers.set(id, maxLayer + 1)
    }
  }

  // Group by layer
  const layerGroups = new Map<number, string[]>()
  for (const [id, layer] of layers) {
    if (!layerGroups.has(layer)) layerGroups.set(layer, [])
    layerGroups.get(layer)!.push(id)
  }

  // Calculate total height per layer for vertical centering
  const layerHeights = new Map<number, number>()
  for (const [layer, ids] of layerGroups) {
    let h = 0
    for (const id of ids) {
      h += getNodeHeight(tableMap.get(id)!.columns.length)
    }
    h += Math.max(0, ids.length - 1) * Y_GAP
    layerHeights.set(layer, h)
  }

  const maxHeight = Math.max(...layerHeights.values(), 0)

  // Position nodes (LR direction, vertically centered per layer)
  const nodes: Node<Record<string, unknown>>[] = []

  for (const [layer, ids] of layerGroups) {
    const totalHeight = layerHeights.get(layer)!
    let y = (maxHeight - totalHeight) / 2

    for (const id of ids.sort()) {
      const data = tableMap.get(id)!
      const height = getNodeHeight(data.columns.length)
      nodes.push({
        id,
        type: 'tableNode',
        position: { x: layer * (NODE_WIDTH + X_GAP), y },
        data: data as unknown as Record<string, unknown>,
      })
      y += height + Y_GAP
    }
  }

  // Build edges
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
// Inner component — mounts once data is ready,
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
    <div className="h-[500px] border overflow-hidden">
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
// Outer component — fetches data and renders inner when ready.
// ---------------------------------------------------------------------------

export function SchemaGraphTab({ workspaceId, session, edaResults: externalEdaResults }: SchemaGraphTabProps) {
  const { data: fetchedEdaResults = [], isLoading } = useSessionEdaResults(
    externalEdaResults ? undefined : workspaceId,
    externalEdaResults ? undefined : session?.id,
  )
  const edaResults = externalEdaResults ?? fetchedEdaResults
  const loading = externalEdaResults ? false : isLoading

  const graph = useMemo(
    () => buildGraph(edaResults, session?.confirmed_joins ?? null),
    [edaResults, session?.confirmed_joins]
  )

  if (loading) {
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
