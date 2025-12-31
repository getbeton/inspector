// Mock playbook data for development and demo mode

export interface PlaybookCondition {
  signal_id: string
  signal_name: string
  operator: 'AND' | 'OR' | null
}

export interface PlaybookData {
  id: string
  name: string
  description: string
  conditions: PlaybookCondition[]
  actions: ('slack_alert' | 'attio_update' | 'email_sequence' | 'webhook')[]
  webhook_url?: string
  status: 'active' | 'paused'
  leads_per_month: number
  conversion_rate: number
  estimated_arr: number
  created_at: string
  last_triggered?: string
}

export const MOCK_PLAYBOOKS: PlaybookData[] = [
  {
    id: 'pb_001',
    name: 'High-Intent PQL Alert',
    description: 'Alert sales when high-intent product qualified leads appear',
    conditions: [
      { signal_id: 'sig_001', signal_name: 'Completed Onboarding', operator: 'AND' },
      { signal_id: 'sig_007', signal_name: 'Company Size 50-500', operator: null },
    ],
    actions: ['slack_alert', 'attio_update'],
    status: 'active',
    leads_per_month: 23,
    conversion_rate: 0.187,
    estimated_arr: 139000,
    created_at: '2024-11-15T10:00:00Z',
    last_triggered: '2024-12-30T14:32:00Z',
  },
  {
    id: 'pb_002',
    name: 'Developer Interest Sequence',
    description: 'Engage developers showing API interest with technical content',
    conditions: [
      { signal_id: 'sig_002', signal_name: 'API Key Created', operator: 'OR' },
      { signal_id: 'sig_008', signal_name: 'Docs Visited 3+ Times', operator: null },
    ],
    actions: ['email_sequence', 'attio_update'],
    status: 'active',
    leads_per_month: 45,
    conversion_rate: 0.122,
    estimated_arr: 178000,
    created_at: '2024-10-20T09:00:00Z',
    last_triggered: '2024-12-31T08:15:00Z',
  },
  {
    id: 'pb_003',
    name: 'Expansion Ready Accounts',
    description: 'Flag accounts showing growth signals for upsell outreach',
    conditions: [
      { signal_id: 'sig_003', signal_name: 'Team Growth (3+ invites)', operator: 'AND' },
      { signal_id: 'sig_009', signal_name: 'Weekly Active Users Up', operator: 'AND' },
      { signal_id: 'sig_010', signal_name: 'Feature Adoption >80%', operator: null },
    ],
    actions: ['slack_alert', 'attio_update', 'webhook'],
    webhook_url: 'https://hooks.example.com/expansion',
    status: 'active',
    leads_per_month: 12,
    conversion_rate: 0.334,
    estimated_arr: 130000,
    created_at: '2024-09-01T14:00:00Z',
    last_triggered: '2024-12-28T11:45:00Z',
  },
  {
    id: 'pb_004',
    name: 'Pricing Intent Alert',
    description: 'Notify sales when prospects show pricing page interest',
    conditions: [
      { signal_id: 'sig_004', signal_name: 'Pricing Page Visit 2+', operator: null },
    ],
    actions: ['slack_alert'],
    status: 'active',
    leads_per_month: 67,
    conversion_rate: 0.089,
    estimated_arr: 193000,
    created_at: '2024-08-15T11:00:00Z',
    last_triggered: '2024-12-31T09:22:00Z',
  },
  {
    id: 'pb_005',
    name: 'Churn Risk Intervention',
    description: 'Alert CS team when accounts show churn risk signals',
    conditions: [
      { signal_id: 'sig_005', signal_name: 'Login Frequency Down 50%', operator: 'OR' },
      { signal_id: 'sig_011', signal_name: 'Support Tickets Up', operator: null },
    ],
    actions: ['slack_alert', 'email_sequence'],
    status: 'paused',
    leads_per_month: 8,
    conversion_rate: 0.45,
    estimated_arr: 116000,
    created_at: '2024-07-10T16:00:00Z',
    last_triggered: '2024-12-15T10:00:00Z',
  },
  {
    id: 'pb_006',
    name: 'Trial Expiry Outreach',
    description: 'Send conversion emails before trial expires',
    conditions: [
      { signal_id: 'sig_006', signal_name: 'Trial Ending in 3 Days', operator: 'AND' },
      { signal_id: 'sig_012', signal_name: 'High Engagement Score', operator: null },
    ],
    actions: ['email_sequence', 'attio_update'],
    status: 'paused',
    leads_per_month: 34,
    conversion_rate: 0.156,
    estimated_arr: 172000,
    created_at: '2024-06-20T08:00:00Z',
  },
]

// Available signals for condition builder
export const AVAILABLE_SIGNALS = [
  { id: 'sig_001', name: 'Completed Onboarding' },
  { id: 'sig_002', name: 'API Key Created' },
  { id: 'sig_003', name: 'Team Growth (3+ invites)' },
  { id: 'sig_004', name: 'Pricing Page Visit 2+' },
  { id: 'sig_005', name: 'Login Frequency Down 50%' },
  { id: 'sig_006', name: 'Trial Ending in 3 Days' },
  { id: 'sig_007', name: 'Company Size 50-500' },
  { id: 'sig_008', name: 'Docs Visited 3+ Times' },
  { id: 'sig_009', name: 'Weekly Active Users Up' },
  { id: 'sig_010', name: 'Feature Adoption >80%' },
  { id: 'sig_011', name: 'Support Tickets Up' },
  { id: 'sig_012', name: 'High Engagement Score' },
]

// Available actions
export const AVAILABLE_ACTIONS = [
  { id: 'slack_alert', name: 'Slack Alert', icon: 'slack', description: 'Send notification to sales channel' },
  { id: 'attio_update', name: 'Attio CRM Update', icon: 'database', description: 'Create/update deal in Attio' },
  { id: 'email_sequence', name: 'Email Sequence', icon: 'mail', description: 'Trigger automated email campaign' },
  { id: 'webhook', name: 'Webhook', icon: 'webhook', description: 'Send HTTP request to custom endpoint' },
] as const
