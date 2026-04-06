import { Command } from 'commander'
import { getApiClient, handleApiError } from '../lib/api-client.js'
import { outputJson } from '../utils/json-output.js'
import { colors } from '../utils/colors.js'
import { formatLift, formatPercent, formatRelativeTime, formatCurrency, formatNumber, truncate } from '../utils/format.js'

export function registerSignalsCommand(program: Command): void {
  const signals = program
    .command('signals')
    .description('List and manage signals')
    .option('--status <status>', 'Filter by status (enabled/disabled)')
    .option('--source <source>', 'Filter by source (manual/heuristic)')
    .option('--type <type>', 'Filter by signal type')
    .option('--min-lift <number>', 'Minimum lift threshold', parseFloat)
    .option('--min-confidence <number>', 'Minimum confidence threshold', parseFloat)
    .option('--page <number>', 'Page number', parseInt)
    .option('--limit <number>', 'Results per page', parseInt)
    .action(async (cmdOpts) => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const params: Record<string, string> = {}
        if (cmdOpts.source) params.source = cmdOpts.source
        if (cmdOpts.type) params.type = cmdOpts.type
        if (cmdOpts.page) params.page = String(cmdOpts.page)
        if (cmdOpts.limit) params.limit = String(cmdOpts.limit)

        const res = await client.get<{
          signals: Array<{
            id: string; type: string; value: number | null; source: string | null
            timestamp: string; account_id: string
            accounts?: { name: string; domain: string | null; arr: number | null } | null
          }>
          pagination: { page: number; limit: number; total: number; pages: number }
        }>('/api/signals', params)

        if (json) {
          outputJson(res.signals, {
            total: res.pagination.total,
            page: res.pagination.page,
            page_size: res.pagination.limit,
            has_next: res.pagination.page < res.pagination.pages,
          })
          return
        }

        // Interactive TUI mode
        const { render } = await import('ink')
        const React = await import('react')
        const { default: App } = await import('../components/App.js')
        render(React.createElement(App, { client, workspace: opts.workspace || '', initialView: 'signals' }))
      } catch (err) {
        handleApiError(err, json)
      }
    })

  signals
    .command('show <id>')
    .description('Show signal detail with metrics')
    .action(async (id: string) => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const res = await client.get<{
          signal: Record<string, unknown>
          metrics: Record<string, unknown> | null
          related_signals: unknown[]
          scores: unknown[]
        }>(`/api/signals/${id}`)

        if (json) {
          outputJson(res)
          return
        }

        // Interactive TUI
        const { render } = await import('ink')
        const React = await import('react')
        const { default: App } = await import('../components/App.js')
        render(React.createElement(App, { client, workspace: opts.workspace || '', initialView: 'signal-detail' }))
      } catch (err) {
        handleApiError(err, json)
      }
    })

  signals
    .command('delete <id>')
    .description('Delete a signal')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id: string, cmdOpts) => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        if (!cmdOpts.yes && !json) {
          // Simple confirmation via readline
          const readline = await import('node:readline')
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
          const answer = await new Promise<string>((resolve) => {
            rl.question(`Delete signal ${id}? [y/N] `, resolve)
          })
          rl.close()
          if (answer.toLowerCase() !== 'y') {
            console.log('Cancelled.')
            return
          }
        }

        await client.delete(`/api/signals/${id}`)

        if (json) {
          outputJson({ deleted: true, id })
          return
        }

        console.log(colors.green(`Signal ${id} deleted successfully.`))
      } catch (err) {
        handleApiError(err, json)
      }
    })
}
