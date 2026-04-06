import { Command } from 'commander'
import { getApiClient, handleApiError } from '../lib/api-client.js'
import { outputJson } from '../utils/json-output.js'
import { colors } from '../utils/colors.js'
import { formatDate, formatRelativeTime } from '../utils/format.js'

export function registerKeysCommand(program: Command): void {
  const keys = program
    .command('keys')
    .description('Manage API keys')
    .action(async () => {
      // Default: list keys
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const res = await client.get<{
          keys: Array<{
            id: string; name: string; key_prefix: string
            created_at: string; last_used_at: string | null
          }>
        }>('/api/auth/keys')

        if (json) {
          outputJson(res.keys)
          return
        }

        // Interactive TUI
        const { render } = await import('ink')
        const React = await import('react')
        const { default: App } = await import('../components/App.js')
        render(React.createElement(App, { client, workspace: opts.workspace || '', initialView: 'keys' }))
      } catch (err) {
        handleApiError(err, json)
      }
    })

  keys
    .command('list')
    .description('List all API keys')
    .action(async () => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const res = await client.get<{
          keys: Array<{
            id: string; name: string; key_prefix: string
            created_at: string; last_used_at: string | null
          }>
        }>('/api/auth/keys')

        if (json) {
          outputJson(res.keys)
          return
        }

        if (res.keys.length === 0) {
          console.log('No API keys found. Create one with: beton keys create --name <name>')
          return
        }

        // Table output
        const header = `${'Name'.padEnd(20)}  ${'Key Prefix'.padEnd(18)}  ${'Created'.padEnd(18)}  ${'Last Used'.padEnd(14)}`
        const sep = '\u2500'.repeat(header.length)
        console.log(colors.bold(header))
        console.log(colors.dim(sep))

        for (const key of res.keys) {
          const name = key.name.padEnd(20).slice(0, 20)
          const prefix = `${key.key_prefix}****`.padEnd(18).slice(0, 18)
          const created = formatDate(key.created_at, 'iso').padEnd(18).slice(0, 18)
          const lastUsed = (key.last_used_at ? formatRelativeTime(key.last_used_at) : 'Never').padEnd(14)
          console.log(`${name}  ${prefix}  ${created}  ${lastUsed}`)
        }
      } catch (err) {
        handleApiError(err, json)
      }
    })

  keys
    .command('create')
    .description('Create a new API key')
    .requiredOption('--name <name>', 'Name for the API key')
    .action(async (cmdOpts) => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const res = await client.post<{ key: string; id: string; name: string }>('/api/auth/keys', {
          name: cmdOpts.name,
        })

        if (json) {
          outputJson(res)
          return
        }

        console.log(colors.green('\u2714 API key created successfully!'))
        console.log('')
        console.log(colors.bold('Key: ') + colors.yellow(res.key))
        console.log('')
        console.log(colors.dim('Save this key now - it will not be shown again.'))
        console.log(colors.dim('Use it with: beton login --api-key ' + res.key))
      } catch (err) {
        handleApiError(err, json)
      }
    })

  keys
    .command('revoke <id>')
    .description('Revoke an API key')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id: string, cmdOpts) => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        if (!cmdOpts.yes && !json) {
          const readline = await import('node:readline')
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
          const answer = await new Promise<string>((resolve) => {
            rl.question(`Revoke API key ${id}? [y/N] `, resolve)
          })
          rl.close()
          if (answer.toLowerCase() !== 'y') {
            console.log('Cancelled.')
            return
          }
        }

        await client.delete(`/api/auth/keys/${id}`)

        if (json) {
          outputJson({ revoked: true, id })
          return
        }

        console.log(colors.green(`\u2714 API key ${id} revoked.`))
      } catch (err) {
        handleApiError(err, json)
      }
    })
}
