import { Command } from 'commander'
import { getApiClient, handleApiError } from '../lib/api-client.js'
import { outputJson } from '../utils/json-output.js'
import { formatCurrency } from '../utils/format.js'

export function registerAccountsCommand(program: Command): void {
  const accounts = program
    .command('accounts')
    .description('List and inspect accounts')
    .option('--status <status>', 'Filter by status (active/trial/churned)')
    .option('--min-health <number>', 'Minimum health score', parseInt)
    .option('--sort <field>', 'Sort by field (health/expansion/churn/arr/name)')
    .option('--page <number>', 'Page number', parseInt)
    .option('--limit <number>', 'Results per page', parseInt)
    .action(async (cmdOpts) => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const params: Record<string, string> = {}
        if (cmdOpts.status) params.status = cmdOpts.status
        if (cmdOpts.minHealth) params.min_health = String(cmdOpts.minHealth)
        if (cmdOpts.sort) params.sort = cmdOpts.sort
        if (cmdOpts.page) params.page = String(cmdOpts.page)
        if (cmdOpts.limit) params.limit = String(cmdOpts.limit)

        const res = await client.get<{
          accounts: Array<{
            id: string; name: string | null; domain: string | null; arr: number
            plan: string; status: string; health_score: number; fit_score: number
          }>
          pagination?: { page: number; limit: number; total: number; pages: number }
        }>('/api/accounts', params)

        if (json) {
          const pagination = res.pagination
          outputJson(res.accounts, pagination ? {
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
        render(React.createElement(App, { client, workspace: opts.workspace || '', initialView: 'accounts' }))
      } catch (err) {
        handleApiError(err, json)
      }
    })

  accounts
    .command('show <id>')
    .description('Show account detail with scores')
    .action(async (id: string) => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const [acctRes, scoresRes] = await Promise.allSettled([
          client.get<{ accounts: unknown[] }>('/api/accounts', { id }),
          client.get<{ scores: unknown[] }>(`/api/heuristics/scores/${id}`),
        ])

        const account = acctRes.status === 'fulfilled'
          ? (acctRes.value.accounts?.[0] || null)
          : null
        const scores = scoresRes.status === 'fulfilled'
          ? scoresRes.value.scores
          : []

        if (json) {
          outputJson({ account, scores })
          return
        }

        // Interactive TUI
        const { render } = await import('ink')
        const React = await import('react')
        const { default: App } = await import('../components/App.js')
        render(React.createElement(App, { client, workspace: opts.workspace || '', initialView: 'account-detail' }))
      } catch (err) {
        handleApiError(err, json)
      }
    })
}
