import { Command } from 'commander'
import { saveApiKey, clearCredentials } from '../lib/auth.js'
import { getApiClient, handleApiError } from '../lib/api-client.js'
import { loadConfig, saveConfig } from '../lib/config.js'
import { outputJson } from '../utils/json-output.js'
import { colors } from '../utils/colors.js'

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with the Inspector API')
    .option('--api-key <key>', 'API key for authentication')
    .action(async (cmdOpts) => {
      const opts = program.opts()
      const json = opts.json

      if (!cmdOpts.apiKey) {
        if (json) {
          process.stderr.write(JSON.stringify({ error: { code: 1, message: 'API key required. Use --api-key <key>' } }) + '\n')
        } else {
          console.error('API key required. Use: beton login --api-key <key>')
          console.error('Get your API key from the Inspector web dashboard under Settings > API Keys.')
        }
        process.exit(1)
      }

      // Save the API key
      saveApiKey(cmdOpts.apiKey)

      // Also save to config for convenience
      const config = loadConfig()
      config.auth = { ...config.auth, api_key: cmdOpts.apiKey }
      saveConfig(config)

      // Validate by calling whoami
      try {
        const client = getApiClient({ ...opts, apiUrl: opts.apiUrl })
        const me = await client.get<{ user?: { email: string; name?: string } }>('/api/auth/me')

        if (json) {
          outputJson({ authenticated: true, user: me.user })
          return
        }

        console.log(colors.green('\u2714 Authenticated successfully!'))
        if (me.user?.email) {
          console.log(`  Logged in as: ${colors.bold(me.user.email)}`)
        }
      } catch {
        // Key saved but validation failed - still save it
        if (json) {
          outputJson({ authenticated: false, message: 'API key saved but validation failed. The key may still be valid.' })
          return
        }
        console.log(colors.yellow('API key saved, but could not validate against the API.'))
        console.log('The key may still be valid - the API might be unreachable.')
      }
    })

  program
    .command('logout')
    .description('Clear stored credentials')
    .action(async () => {
      const opts = program.opts()
      const json = opts.json

      clearCredentials()

      // Also remove from config
      const config = loadConfig()
      if (config.auth) {
        delete config.auth.api_key
        saveConfig(config)
      }

      if (json) {
        outputJson({ logged_out: true })
        return
      }

      console.log(colors.green('\u2714 Credentials cleared.'))
    })

  program
    .command('whoami')
    .description('Show current authenticated user')
    .action(async () => {
      const opts = program.opts()
      const client = getApiClient(opts)
      const json = opts.json

      try {
        const res = await client.get<{
          user?: { id: string; email: string; name?: string; role?: string }
          workspace?: { slug: string; name: string }
        }>('/api/auth/me')

        if (json) {
          outputJson(res)
          return
        }

        if (res.user) {
          console.log(`${colors.bold('User:')}  ${res.user.email}${res.user.name ? ` (${res.user.name})` : ''}`)
          if (res.user.role) console.log(`${colors.bold('Role:')}  ${res.user.role}`)
        }
        if (res.workspace) {
          console.log(`${colors.bold('Workspace:')} ${res.workspace.name} (${colors.dim(res.workspace.slug)})`)
        }
      } catch (err) {
        handleApiError(err, json)
      }
    })
}
