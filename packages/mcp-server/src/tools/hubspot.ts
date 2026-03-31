/**
 * HubSpot CRM tools (14 tools) — thin proxy to /api/agent/hubspot/*
 *
 * All tools require a session_id and use x-agent-secret authentication.
 * The AGENT_SECRET env var must be set for these tools to work.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callApi } from '../lib/proxy.js'
import { httpErrorToMcp, toMcpError } from '../lib/errors.js'

const AGENT_SECRET = process.env.AGENT_SECRET || ''

/** Common params for HubSpot tools */
const sessionParams = {
  session_id: z.string().describe('Agent session ID'),
  connection_id: z.string().optional().describe('Specific HubSpot connection UUID (auto-selects if omitted)'),
}

/** Build extra headers for agent authentication */
function agentHeaders(): Record<string, string> {
  return AGENT_SECRET ? { 'x-agent-secret': AGENT_SECRET } : {}
}

/** Standard success response */
function okResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

export function registerHubSpotTools(
  server: McpServer,
  _getAuthHeader: () => string | undefined,
): void {
  // ── hubspot_search ──────────────────────────────────────────────────
  server.tool(
    'hubspot_search',
    'Search HubSpot CRM objects with filters, properties, and pagination. Supports contacts, companies, deals, tickets.',
    {
      ...sessionParams,
      object_type: z.string().describe('CRM object type (contacts, companies, deals, tickets)'),
      filters: z.array(z.object({
        filters: z.array(z.object({
          propertyName: z.string(),
          operator: z.string(),
          value: z.string().optional(),
          values: z.array(z.string()).optional(),
        })),
      })).optional().describe('HubSpot filter groups'),
      properties: z.array(z.string()).optional().describe('Properties to return'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results (default 10)'),
      after: z.string().optional().describe('Pagination cursor'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi('/api/agent/hubspot/search', undefined, {
          method: 'POST',
          body: args,
          toolName: 'hubspot_search',
          extraHeaders: agentHeaders(),
        })
        if (status !== 200) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_read_record ─────────────────────────────────────────────
  server.tool(
    'hubspot_read_record',
    'Get a single HubSpot CRM record by ID',
    {
      ...sessionParams,
      object_type: z.string().describe('CRM object type'),
      record_id: z.string().describe('HubSpot record ID'),
    },
    async (args) => {
      try {
        const params: Record<string, string> = {
          session_id: args.session_id,
          object_type: args.object_type,
          record_id: args.record_id,
        }
        if (args.connection_id) params.connection_id = args.connection_id

        const { data, status } = await callApi('/api/agent/hubspot/records', undefined, {
          params,
          toolName: 'hubspot_read_record',
          extraHeaders: agentHeaders(),
        })
        if (status !== 200) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_create_record ───────────────────────────────────────────
  server.tool(
    'hubspot_create_record',
    'Create or upsert a single HubSpot CRM record. Provide matching_property for upsert behavior.',
    {
      ...sessionParams,
      object_type: z.string().describe('CRM object type'),
      properties: z.record(z.unknown()).describe('Record properties'),
      matching_property: z.string().optional().describe('Property to match on for upsert (e.g., email, domain)'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi('/api/agent/hubspot/records', undefined, {
          method: 'POST',
          body: args,
          toolName: 'hubspot_create_record',
          extraHeaders: agentHeaders(),
        })
        if (status !== 200 && status !== 201) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_batch_create ────────────────────────────────────────────
  server.tool(
    'hubspot_batch_create',
    'Batch create or upsert up to 100 HubSpot CRM records at once',
    {
      ...sessionParams,
      object_type: z.string().describe('CRM object type'),
      records: z.array(z.object({
        properties: z.record(z.unknown()).describe('Record properties'),
      })).min(1).max(100).describe('Array of records to create'),
      matching_property: z.string().optional().describe('Property for upsert matching'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi('/api/agent/hubspot/records/batch', undefined, {
          method: 'POST',
          body: args,
          toolName: 'hubspot_batch_create',
          extraHeaders: agentHeaders(),
        })
        if (status !== 201 && status !== 207) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_create_entity_chain ─────────────────────────────────────
  server.tool(
    'hubspot_create_entity_chain',
    'Create a chain of company -> contact -> deal with automatic associations. Supports partial chains.',
    {
      ...sessionParams,
      create_company: z.boolean().optional().describe('Create/upsert company'),
      create_contact: z.boolean().optional().describe('Create/upsert contact'),
      create_deal: z.boolean().optional().describe('Create deal'),
      company_data: z.record(z.unknown()).optional().describe('Company properties (domain, name, etc.)'),
      contact_data: z.record(z.unknown()).optional().describe('Contact properties (email, firstname, etc.)'),
      deal_data: z.record(z.unknown()).optional().describe('Deal properties (dealname, amount, etc.)'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi('/api/agent/hubspot/entities', undefined, {
          method: 'POST',
          body: args,
          toolName: 'hubspot_create_entity_chain',
          extraHeaders: agentHeaders(),
        })
        if (status !== 201 && status !== 207) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_associate ───────────────────────────────────────────────
  server.tool(
    'hubspot_associate',
    'Create a single association between two HubSpot CRM records',
    {
      ...sessionParams,
      from_type: z.string().describe('Source object type (e.g., contacts)'),
      from_id: z.string().describe('Source record ID'),
      to_type: z.string().describe('Target object type (e.g., companies)'),
      to_id: z.string().describe('Target record ID'),
      association_type_id: z.number().optional().describe('Explicit association type ID (auto-resolved if omitted)'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi('/api/agent/hubspot/associations', undefined, {
          method: 'POST',
          body: args,
          toolName: 'hubspot_associate',
          extraHeaders: agentHeaders(),
        })
        if (status !== 200) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_batch_associate ─────────────────────────────────────────
  server.tool(
    'hubspot_batch_associate',
    'Batch create up to 2000 associations between HubSpot CRM records',
    {
      ...sessionParams,
      associations: z.array(z.object({
        from_type: z.string(),
        from_id: z.string(),
        to_type: z.string(),
        to_id: z.string(),
        association_type_id: z.number().optional(),
      })).min(1).max(2000).describe('Array of associations to create'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi('/api/agent/hubspot/associations/batch', undefined, {
          method: 'POST',
          body: args,
          toolName: 'hubspot_batch_associate',
          extraHeaders: agentHeaders(),
        })
        if (status !== 200) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_create_list ─────────────────────────────────────────────
  server.tool(
    'hubspot_create_list',
    'Create a static HubSpot contact list, optionally adding contacts by email',
    {
      ...sessionParams,
      name: z.string().describe('List name'),
      emails: z.array(z.string().email()).optional().describe('Contact emails to add to the list'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi('/api/agent/hubspot/lists', undefined, {
          method: 'POST',
          body: args,
          toolName: 'hubspot_create_list',
          extraHeaders: agentHeaders(),
        })
        if (status !== 201) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_list_objects ────────────────────────────────────────────
  server.tool(
    'hubspot_list_objects',
    'List available CRM object schemas in the HubSpot account',
    { ...sessionParams },
    async (args) => {
      try {
        const params: Record<string, string> = { session_id: args.session_id }
        if (args.connection_id) params.connection_id = args.connection_id

        const { data, status } = await callApi('/api/agent/hubspot/objects', undefined, {
          params,
          toolName: 'hubspot_list_objects',
          extraHeaders: agentHeaders(),
        })
        if (status !== 200) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_list_properties ─────────────────────────────────────────
  server.tool(
    'hubspot_list_properties',
    'List all properties for a HubSpot CRM object type',
    {
      ...sessionParams,
      object_type: z.string().describe('CRM object type (contacts, companies, deals, tickets)'),
    },
    async (args) => {
      try {
        const params: Record<string, string> = {
          session_id: args.session_id,
          object_type: args.object_type,
        }
        if (args.connection_id) params.connection_id = args.connection_id

        const { data, status } = await callApi('/api/agent/hubspot/properties', undefined, {
          params,
          toolName: 'hubspot_list_properties',
          extraHeaders: agentHeaders(),
        })
        if (status !== 200) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_create_property ─────────────────────────────────────────
  server.tool(
    'hubspot_create_property',
    'Create a custom property on a HubSpot CRM object type',
    {
      ...sessionParams,
      object_type: z.string().describe('CRM object type'),
      name: z.string().describe('Internal property name'),
      label: z.string().describe('Display label'),
      type: z.string().describe('Property type (string, number, enumeration, datetime, etc.)'),
      field_type: z.string().describe('Field type (text, number, select, date, etc.)'),
      group_name: z.string().describe('Property group name'),
      description: z.string().optional().describe('Property description'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi('/api/agent/hubspot/properties', undefined, {
          method: 'POST',
          body: args,
          toolName: 'hubspot_create_property',
          extraHeaders: agentHeaders(),
        })
        if (status !== 201) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_trigger_sync ────────────────────────────────────────────
  server.tool(
    'hubspot_trigger_sync',
    'Trigger a manual sync of HubSpot CRM data for specific object types',
    {
      ...sessionParams,
      object_types: z.array(z.string()).optional().describe('Object types to sync (defaults to all standard types)'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi('/api/agent/hubspot/sync', undefined, {
          method: 'POST',
          body: args,
          toolName: 'hubspot_trigger_sync',
          extraHeaders: agentHeaders(),
        })
        if (status !== 200) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_sync_status ─────────────────────────────────────────────
  server.tool(
    'hubspot_sync_status',
    'Get the current sync status for each HubSpot CRM object type',
    { ...sessionParams },
    async (args) => {
      try {
        const params: Record<string, string> = { session_id: args.session_id }
        if (args.connection_id) params.connection_id = args.connection_id

        const { data, status } = await callApi('/api/agent/hubspot/sync', undefined, {
          params,
          toolName: 'hubspot_sync_status',
          extraHeaders: agentHeaders(),
        })
        if (status !== 200) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )

  // ── hubspot_list_connections ─────────────────────────────────────────
  server.tool(
    'hubspot_list_connections',
    'List all HubSpot connections for the workspace (without sensitive token data)',
    {
      session_id: z.string().describe('Agent session ID'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi('/api/agent/hubspot/connections', undefined, {
          params: { session_id: args.session_id },
          toolName: 'hubspot_list_connections',
          extraHeaders: agentHeaders(),
        })
        if (status !== 200) return httpErrorToMcp(data, status)
        return okResponse(data)
      } catch (error) {
        return toMcpError(error)
      }
    },
  )
}
