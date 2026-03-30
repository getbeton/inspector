/**
 * Postgres Data Source tools (6 tools) — thin proxy to /api/agent/pg/*
 *
 * All tools accept data_source_id or data_source_name to target a specific
 * Postgres connection within the workspace.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callApi } from '../lib/proxy.js'
import { httpErrorToMcp, toMcpError } from '../lib/errors.js'

const dsParams = {
  data_source_id: z.string().optional().describe('UUID of the Postgres data source'),
  data_source_name: z.string().optional().describe('Name of the Postgres data source'),
}

function dsQueryParams(args: { data_source_id?: string; data_source_name?: string }): Record<string, string> {
  const params: Record<string, string> = {}
  if (args.data_source_id) params.data_source_id = args.data_source_id
  if (args.data_source_name) params.data_source_name = args.data_source_name
  return params
}

export function registerPostgresTools(
  server: McpServer,
  getAuthHeader: () => string | undefined,
): void {
  // ── pg_list_schemas ──────────────────────────────────────────────
  server.tool(
    'pg_list_schemas',
    'List all schemas in a connected Postgres database',
    { ...dsParams },
    async (args) => {
      try {
        const { data, status } = await callApi(
          '/api/agent/pg/list-schemas',
          getAuthHeader(),
          { params: dsQueryParams(args), toolName: 'pg_list_schemas' },
        )
        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── pg_list_tables ───────────────────────────────────────────────
  server.tool(
    'pg_list_tables',
    'List all tables in a Postgres schema (default: public)',
    {
      ...dsParams,
      schema: z.string().optional().describe('Schema name (default: public)'),
    },
    async (args) => {
      try {
        const params = { ...dsQueryParams(args), ...(args.schema ? { schema: args.schema } : {}) }
        const { data, status } = await callApi(
          '/api/agent/pg/list-tables',
          getAuthHeader(),
          { params, toolName: 'pg_list_tables' },
        )
        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── pg_list_columns ──────────────────────────────────────────────
  server.tool(
    'pg_list_columns',
    'Get column schema for a specific table in a Postgres database',
    {
      ...dsParams,
      table: z.string().describe('Table name'),
      schema: z.string().optional().describe('Schema name (default: public)'),
    },
    async (args) => {
      try {
        const params = {
          ...dsQueryParams(args),
          table: args.table,
          ...(args.schema ? { schema: args.schema } : {}),
        }
        const { data, status } = await callApi(
          '/api/agent/pg/list-columns',
          getAuthHeader(),
          { params, toolName: 'pg_list_columns' },
        )
        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── pg_query ─────────────────────────────────────────────────────
  server.tool(
    'pg_query',
    'Execute a read-only SQL query against a connected Postgres database. Only SELECT and WITH (CTE) queries are allowed.',
    {
      ...dsParams,
      query: z.string().describe('SQL query (SELECT only)'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi(
          '/api/agent/pg/query',
          getAuthHeader(),
          {
            method: 'POST',
            body: { ...dsQueryParams(args), query: args.query },
            toolName: 'pg_query',
          },
        )
        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── pg_explain ───────────────────────────────────────────────────
  server.tool(
    'pg_explain',
    'Get the EXPLAIN plan for a SQL query without executing it',
    {
      ...dsParams,
      query: z.string().describe('SQL query to explain'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi(
          '/api/agent/pg/explain',
          getAuthHeader(),
          {
            method: 'POST',
            body: { ...dsQueryParams(args), query: args.query },
            toolName: 'pg_explain',
          },
        )
        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── pg_stats ─────────────────────────────────────────────────────
  server.tool(
    'pg_stats',
    'Get table statistics (row counts, sizes) for a Postgres schema',
    {
      ...dsParams,
      schema: z.string().optional().describe('Schema name (default: public)'),
    },
    async (args) => {
      try {
        const params = { ...dsQueryParams(args), ...(args.schema ? { schema: args.schema } : {}) }
        const { data, status } = await callApi(
          '/api/agent/pg/stats',
          getAuthHeader(),
          { params, toolName: 'pg_stats' },
        )
        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    },
  )
}
