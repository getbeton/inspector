/**
 * Billing tool (1 tool)
 *
 * - create_checkout_link: Generate Stripe Checkout URL for card entry
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../context/types.js'
import { toMcpError } from '../lib/errors.js'
import { createCheckoutSession } from '../lib/stripe.js'

export function registerBillingTools(
  server: McpServer,
  getContext: () => Promise<ToolContext>
): void {
  server.tool(
    'create_checkout_link',
    'Generate a Stripe Checkout URL for entering payment details. Returns a URL the user should open in their browser.',
    {
      success_url: z.string().url().describe('URL to redirect to after successful card entry'),
      cancel_url: z.string().url().describe('URL to redirect to if user cancels'),
    },
    async ({ success_url, cancel_url }) => {
      try {
        const { supabase, workspaceId } = await getContext()

        // Get workspace details
        const { data: workspace } = await supabase
          .from('workspaces')
          .select('name, stripe_customer_id')
          .eq('id', workspaceId)
          .single()

        if (!workspace) {
          return toMcpError(new Error('Workspace not found'))
        }

        const { url } = await createCheckoutSession({
          workspaceId,
          workspaceName: workspace.name,
          stripeCustomerId: workspace.stripe_customer_id,
          successUrl: success_url,
          cancelUrl: cancel_url,
        })

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              checkout_url: url,
              message: 'Open this URL in a browser to enter payment details.',
            }, null, 2),
          }],
        }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
