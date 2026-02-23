'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import {
  READ_METHODS,
  WRITE_METHODS,
  groupByCategory,
  type McpToolDefinition,
  type HttpMethod,
  type ToolCategory,
} from '../mcp-methods'

// ---------------------------------------------------------------------------
// HTTP method badge color mapping
// ---------------------------------------------------------------------------

const HTTP_BADGE_VARIANT: Record<HttpMethod, 'success' | 'info' | 'warning'> = {
  GET: 'success',
  POST: 'info',
  PUT: 'warning',
  DELETE: 'warning',
}

// ---------------------------------------------------------------------------
// Methods Tab
// ---------------------------------------------------------------------------

export default function MethodsTab() {
  const [search, setSearch] = useState('')

  const filteredRead = useMemo(
    () => filterMethods(READ_METHODS, search),
    [search],
  )
  const filteredWrite = useMemo(
    () => filterMethods(WRITE_METHODS, search),
    [search],
  )

  return (
    <div className="space-y-6">
      {/* Search */}
      <Input
        placeholder="Search tools\u2026"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Read-only section */}
      <MethodSection
        title="Read-only"
        count={filteredRead.length}
        methods={filteredRead}
      />

      {/* Write / Mutate section */}
      <MethodSection
        title="Write / Mutate"
        count={filteredWrite.length}
        methods={filteredWrite}
      />

      {filteredRead.length === 0 && filteredWrite.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No tools match &ldquo;{search}&rdquo;
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterMethods(methods: McpToolDefinition[], query: string): McpToolDefinition[] {
  if (!query.trim()) return methods
  const q = query.toLowerCase()
  return methods.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q),
  )
}

// ---------------------------------------------------------------------------
// Method Section (Read-only or Write/Mutate)
// ---------------------------------------------------------------------------

function MethodSection({
  title,
  count,
  methods,
}: {
  title: string
  count: number
  methods: McpToolDefinition[]
}) {
  if (methods.length === 0) return null

  const grouped = groupByCategory(methods)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant="outline" size="sm">{count}</Badge>
        </div>
        <CardDescription>
          {title === 'Read-only'
            ? 'These tools query data without modifying anything.'
            : 'These tools create or update data. Use with care.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {[...grouped.entries()].map(([category, tools]) => (
          <CategoryGroup key={category} category={category} tools={tools} />
        ))}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Category Group
// ---------------------------------------------------------------------------

function CategoryGroup({
  category,
  tools,
}: {
  category: ToolCategory
  tools: McpToolDefinition[]
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {category}
      </h4>
      <div className="space-y-2">
        {tools.map((tool) => (
          <MethodCard key={tool.name} tool={tool} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Method Card (expandable)
// ---------------------------------------------------------------------------

function MethodCard({ tool }: { tool: McpToolDefinition }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={cn(
        'rounded-md border-2 border-border transition-all',
        expanded ? 'ring-1 ring-primary/50' : '',
      )}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <Badge variant={HTTP_BADGE_VARIANT[tool.httpMethod]} size="sm">
          {tool.httpMethod}
        </Badge>
        <span className="flex items-center gap-1.5 min-w-0">
          <code className="text-sm font-mono font-semibold truncate">{tool.name}</code>
          <CopyButton value={tool.name} size="sm" />
        </span>
        <span className="flex-1 truncate text-xs text-muted-foreground hidden sm:block">
          {tool.description}
        </span>
        <svg
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            expanded ? 'rotate-180' : '',
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t-2 border-border px-3 py-3 space-y-3">
          <p className="text-sm text-muted-foreground">{tool.description}</p>

          {tool.parameters.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-1.5 pr-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</th>
                    <th className="pb-1.5 pr-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</th>
                    <th className="pb-1.5 pr-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Required</th>
                    <th className="pb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {tool.parameters.map((param) => (
                    <tr key={param.name} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 pr-4 font-mono text-xs">{param.name}</td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">{param.type}</td>
                      <td className="py-1.5 pr-4 text-xs">
                        {param.required ? (
                          <Badge variant="default" size="sm">required</Badge>
                        ) : (
                          <span className="text-muted-foreground">optional</span>
                        )}
                      </td>
                      <td className="py-1.5 text-xs text-muted-foreground">{param.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No parameters.</p>
          )}
        </div>
      )}
    </div>
  )
}
