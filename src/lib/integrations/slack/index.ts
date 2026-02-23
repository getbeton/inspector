export {
  SlackClient,
  createSlackClient,
  SlackError,
  SlackAuthError,
  SlackRateLimitError,
  SlackChannelError,
} from './client'

export type {
  SlackClientConfig,
  SlackChannel,
  SlackConnectionResult,
  SlackPostResult,
  SlackConfigJson,
} from './types'
