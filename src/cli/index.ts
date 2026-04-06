import { Command } from 'commander'
import { registerDashboardCommand } from './commands/dashboard.js'
import { registerSignalsCommand } from './commands/signals.js'
import { registerAccountsCommand } from './commands/accounts.js'
import { registerIdentitiesCommand } from './commands/identities.js'
import { registerIntegrationsCommand } from './commands/integrations.js'
import { registerLoginCommand } from './commands/login.js'
import { registerKeysCommand } from './commands/keys.js'
import { registerMcpCommand } from './commands/mcp.js'
import { getApiClient } from './lib/api-client.js'

const program = new Command()

program
  .name('beton')
  .version('0.1.0')
  .description('Beton Inspector TUI - Terminal interface for RevOps intelligence')
  .option('--json', 'Output data as JSON for scripting')
  .option('--workspace <slug>', 'Override default workspace')
  .option('--api-url <url>', 'Override API base URL')

// Register all subcommands
registerDashboardCommand(program)
registerSignalsCommand(program)
registerAccountsCommand(program)
registerIdentitiesCommand(program)
registerIntegrationsCommand(program)
registerLoginCommand(program)
registerKeysCommand(program)
registerMcpCommand(program)

// Default action (no subcommand): launch interactive TUI or print dashboard JSON
program.action(async () => {
  const opts = program.opts()
  const json = opts.json

  if (json) {
    // Non-interactive: output dashboard data
    const client = getApiClient(opts)
    try {
      const [metrics, integrations, signals] = await Promise.allSettled([
        client.get<Record<string, unknown>>('/api/signals/dashboard/metrics'),
        client.get<{ integrations: unknown[] }>('/api/integrations'),
        client.get<{ signals: unknown[]; pagination: { total: number } }>('/api/signals', { limit: '10' }),
      ])

      let billing: Record<string, unknown> | null = null
      try {
        billing = await client.get<Record<string, unknown>>('/api/billing/status')
      } catch {
        // optional
      }

      const { outputJson } = await import('./utils/json-output.js')
      outputJson({
        metrics: metrics.status === 'fulfilled' ? metrics.value : {},
        integrations: integrations.status === 'fulfilled' ? integrations.value.integrations : [],
        recent_signals: signals.status === 'fulfilled' ? signals.value.signals : [],
        billing,
      })
    } catch (err) {
      const { handleApiError } = await import('./lib/api-client.js')
      handleApiError(err, true)
    }
    return
  }

  // Interactive TUI: launch Ink app
  try {
    const { render } = await import('ink')
    const React = await import('react')
    const { default: App } = await import('./components/App.js')

    const client = getApiClient(opts)
    const workspace = opts.workspace || ''

    render(React.createElement(App, { client, workspace }))
  } catch (err) {
    console.error('Failed to start interactive TUI:', err instanceof Error ? err.message : String(err))
    console.error('Use --json flag for non-interactive output, or check your terminal supports interactive mode.')
    process.exit(1)
  }
})

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
