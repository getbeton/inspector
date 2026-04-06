import { Command } from 'commander'
import { getApiClient, handleApiError } from '../lib/api-client.js'
import { outputJson } from '../utils/json-output.js'

export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .description('Show dashboard overview with key metrics')
    .action(async () => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const [metrics, integrations, signals] = await Promise.allSettled([
          client.get<Record<string, unknown>>('/api/signals/dashboard/metrics'),
          client.get<{ integrations: Array<{ name: string; display_name: string; is_connected: boolean; category: string }> }>('/api/integrations'),
          client.get<{ signals: unknown[]; pagination: { total: number } }>('/api/signals', { limit: '10' }),
        ])

        let billing: Record<string, unknown> | null = null
        try {
          billing = await client.get<Record<string, unknown>>('/api/billing/status')
        } catch {
          // optional
        }

        const data = {
          metrics: metrics.status === 'fulfilled' ? metrics.value : {},
          integrations: integrations.status === 'fulfilled' ? integrations.value.integrations : [],
          recent_signals: signals.status === 'fulfilled' ? signals.value.signals : [],
          billing,
        }

        if (json) {
          outputJson(data)
          return
        }

        // Non-json: launch interactive TUI
        const { render } = await import('ink')
        const React = await import('react')
        const { default: App } = await import('../components/App.js')
        render(React.createElement(App, { client, workspace: opts.workspace || '', initialView: 'dashboard' }))
      } catch (err) {
        handleApiError(err, json)
      }
    })
}
