'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export const NODE_WIDTH = 240
export const HEADER_HEIGHT = 36
export const ROW_HEIGHT = 28

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
    <div className="border rounded-lg bg-card shadow-md overflow-hidden" style={{ width: NODE_WIDTH }}>
      <div className="bg-primary/10 px-3 border-b flex items-center" style={{ height: HEADER_HEIGHT }}>
        <span className="font-mono text-xs font-semibold text-primary truncate">
          {nodeData.label}
        </span>
      </div>

      {nodeData.columns.length > 0 && (
        <div className="py-0.5">
          {nodeData.columns.map((col) => (
            <div
              key={col.name}
              className="relative flex items-center justify-between gap-2 px-3 hover:bg-muted/50"
              style={{ height: ROW_HEIGHT }}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={col.name}
                className="!w-2 !h-2 !bg-primary !border-background !border-2 !-left-1"
              />
              <span className="font-mono text-[11px] truncate">{col.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{col.type}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={col.name}
                className="!w-2 !h-2 !bg-primary !border-background !border-2 !-right-1"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const TableNode = memo(TableNodeComponent)
