import { Command } from 'commander'
import { getApiClient, handleApiError } from '../lib/api-client.js'
import { outputJson } from '../utils/json-output.js'
import { colors } from '../utils/colors.js'

export function registerIntegrationsCommand(program: Command): void {
  const integrations = program
    .command('integrations')
    .description('Manage integrations')
    .action(async () => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const res = await client.get<{
          integrations: Array<{
            id: string; name: string; display_name: string; description: string
            category: string; is_connected: boolean; last_validated_at: string | null
          }>
        }>('/api/integrations')

        if (json) {
          outputJson(res.integrations)
          return
        }

        // Interactive TUI
        const { render } = await import('ink')
        const React = await import('react')
        const { default: App } = await import('../components/App.js')
        render(React.createElement(App, { client, workspace: opts.workspace || '', initialView: 'integrations' }))
      } catch (err) {
        handleApiError(err, json)
      }
    })

  integrations
    .command('test <name>')
    .description('Test integration connection')
    .action(async (name: string) => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const res = await client.get<{
          connected: boolean
          message?: string
          error?: string
        }>(`/api/integrations/${name}/credentials`)

        const success = res.connected !== false

        if (json) {
          outputJson({ name, connected: success, message: res.message || res.error })
          return
        }

        if (success) {
          console.log(colors.green(`\u2714 ${name}: Connection successful`))
        } else {
          console.log(colors.red(`\u2718 ${name}: Connection failed - ${res.error || res.message || 'Unknown error'}`))
          process.exit(1)
        }
      } catch (err) {
        if (json) {
          outputJson({ name, connected: false, message: err instanceof Error ? err.message : String(err) })
          return
        }
        handleApiError(err, json)
      }
    })

  integrations
    .command('configure <name>')
    .description('Configure an integration')
    .option('--api-key <key>', 'API key for the integration')
    .option('--project-id <id>', 'Project ID (for PostHog)')
    .option('--base-url <url>', 'Base URL (for self-hosted)')
    .action(async (name: string, cmdOpts) => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const config: Record<string, string> = {}
        if (cmdOpts.apiKey) config.api_key = cmdOpts.apiKey
        if (cmdOpts.projectId) config.project_id = cmdOpts.projectId
        if (cmdOpts.baseUrl) config.base_url = cmdOpts.baseUrl

        if (Object.keys(config).length === 0) {
          if (json) {
            outputJson({ error: 'No configuration values provided' })
          } else {
            console.error('No configuration values provided. Use --api-key, --project-id, or --base-url.')
          }
          process.exit(1)
        }

        const res = await client.post(`/api/integrations/${name}`, config)

        if (json) {
          outputJson({ name, configured: true, ...res as object })
          return
        }

        console.log(colors.green(`\u2714 ${name} configured successfully.`))
      } catch (err) {
        handleApiError(err, json)
      }
    })
}
