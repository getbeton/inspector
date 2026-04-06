import { Command } from 'commander'
import { getApiClient, handleApiError } from '../lib/api-client.js'
import { outputJson } from '../utils/json-output.js'
import { colors } from '../utils/colors.js'
import { formatRelativeTime, formatDate } from '../utils/format.js'

export function registerMcpCommand(program: Command): void {
  const mcp = program
    .command('mcp')
    .description('View MCP sessions and logs')
    .action(async () => {
      // Default: show sessions
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const res = await client.get<{
          sessions: Array<{
            id: string; client_app: string; status: string
            started_at: string; ended_at: string | null
            request_count: number; last_activity_at: string | null
          }>
        }>('/api/agent/sessions')

        if (json) {
          outputJson(res.sessions)
          return
        }

        // Interactive TUI
        const { render } = await import('ink')
        const React = await import('react')
        const { default: App } = await import('../components/App.js')
        render(React.createElement(App, { client, workspace: opts.workspace || '', initialView: 'mcp' }))
      } catch (err) {
        handleApiError(err, json)
      }
    })

  mcp
    .command('sessions')
    .description('List MCP sessions')
    .action(async () => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const res = await client.get<{
          sessions: Array<{
            id: string; client_app: string; status: string
            started_at: string; ended_at: string | null
            request_count: number; last_activity_at: string | null
          }>
        }>('/api/agent/sessions')

        if (json) {
          outputJson(res.sessions)
          return
        }

        if (res.sessions.length === 0) {
          console.log('No MCP sessions found.')
          return
        }

        const header = `${'Client App'.padEnd(18)}  ${'Session ID'.padEnd(16)}  ${'Status'.padEnd(10)}  ${'Last Activity'.padEnd(14)}  ${'Requests'.padEnd(10)}`
        const sep = '\u2500'.repeat(header.length)
        console.log(colors.bold(header))
        console.log(colors.dim(sep))

        for (const session of res.sessions) {
          const app = (session.client_app || '-').padEnd(18).slice(0, 18)
          const sid = session.id.slice(0, 14).padEnd(16)
          const status = session.status.padEnd(10)
          const lastActivity = (session.last_activity_at ? formatRelativeTime(session.last_activity_at) : '-').padEnd(14)
          const requests = String(session.request_count || 0).padEnd(10)

          const colorFn = session.status === 'active' ? colors.green : colors.dim
          console.log(`${app}  ${sid}  ${colorFn(status)}  ${lastActivity}  ${requests}`)
        }
      } catch (err) {
        handleApiError(err, json)
      }
    })

  mcp
    .command('logs')
    .description('View MCP request logs')
    .requiredOption('--session <id>', 'Session ID to view logs for')
    .action(async (cmdOpts) => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const res = await client.get<{
          logs: Array<{
            id: string; timestamp: string; tool: string
            status: number; duration_ms: number
          }>
        }>('/api/mcp/logs', { session: cmdOpts.session })

        if (json) {
          outputJson(res.logs)
          return
        }

        if (res.logs.length === 0) {
          console.log(`No logs found for session ${cmdOpts.session}`)
          return
        }

        const header = `${'Time'.padEnd(12)}  ${'Tool'.padEnd(25)}  ${'Status'.padEnd(8)}  ${'Duration'.padEnd(10)}`
        const sep = '\u2500'.repeat(header.length)
        console.log(colors.bold(`Session: ${cmdOpts.session}`))
        console.log(colors.bold(header))
        console.log(colors.dim(sep))

        for (const log of res.logs) {
          const time = formatDate(log.timestamp, 'iso').slice(11, 19).padEnd(12)
          const tool = log.tool.padEnd(25).slice(0, 25)
          const status = String(log.status).padEnd(8)
          const duration = `${log.duration_ms}ms`.padEnd(10)

          const statusColor = log.status >= 200 && log.status < 300 ? colors.green : colors.red
          console.log(`${time}  ${tool}  ${statusColor(status)}  ${duration}`)
        }
      } catch (err) {
        handleApiError(err, json)
      }
    })
}
