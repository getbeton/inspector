import { Command } from 'commander'
import { getApiClient, handleApiError } from '../lib/api-client.js'
import { outputJson } from '../utils/json-output.js'

export function registerIdentitiesCommand(program: Command): void {
  program
    .command('identities')
    .description('List identities (contacts/users)')
    .option('--status <status>', 'Filter by status (active/new/churned)')
    .option('--min-score <number>', 'Minimum score threshold', parseInt)
    .option('--search <query>', 'Search by name/email/company')
    .option('--page <number>', 'Page number', parseInt)
    .option('--limit <number>', 'Results per page', parseInt)
    .action(async (cmdOpts) => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const params: Record<string, string> = {}
        if (cmdOpts.status) params.status = cmdOpts.status
        if (cmdOpts.minScore) params.min_score = String(cmdOpts.minScore)
        if (cmdOpts.search) params.search = cmdOpts.search
        if (cmdOpts.page) params.page = String(cmdOpts.page)
        if (cmdOpts.limit) params.limit = String(cmdOpts.limit)

        const res = await client.get<{
          identities?: unknown[]
          contacts?: unknown[]
          pagination?: { page: number; limit: number; total: number; pages: number }
        }>('/api/identities', params)

        const data = res.identities || res.contacts || []
        const pagination = res.pagination

        if (json) {
          outputJson(data, pagination ? {
            total: pagination.total,
            page: pagination.page,
            page_size: pagination.limit,
            has_next: pagination.page < pagination.pages,
          } : undefined)
          return
        }

        // Interactive TUI
        const { render } = await import('ink')
        const React = await import('react')
        const { default: App } = await import('../components/App.js')
        render(React.createElement(App, { client, workspace: opts.workspace || '', initialView: 'identities' }))
      } catch (err) {
        handleApiError(err, json)
      }
    })
}
