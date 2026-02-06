'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export interface TableNodeData {
  label: string
  columns: Array<{
    name: string
    type: string
  }>
}

function TableNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as TableNodeData

  return (
    <div className="border rounded-lg bg-card shadow-md min-w-[180px] overflow-hidden">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-primary" />

      <div className="bg-primary/10 px-3 py-2 border-b">
        <span className="font-mono text-xs font-semibold text-primary">
          {nodeData.label}
        </span>
      </div>

      {nodeData.columns.length > 0 && (
        <div className="px-3 py-1.5 space-y-0.5 max-h-[200px] overflow-y-auto">
          {nodeData.columns.slice(0, 12).map((col) => (
            <div key={col.name} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="font-mono truncate">{col.name}</span>
              <span className="text-muted-foreground shrink-0">{col.type}</span>
            </div>
          ))}
          {nodeData.columns.length > 12 && (
            <div className="text-[10px] text-muted-foreground pt-1">
              +{nodeData.columns.length - 12} more
            </div>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary" />
    </div>
  )
}

export const TableNode = memo(TableNodeComponent)
