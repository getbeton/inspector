// Mock identity data for development and demo mode

export interface IdentityData {
  id: string
  email: string
  name?: string
  company?: string
  company_size?: string
  account_id?: string
  first_seen: string
  last_seen: string
  total_events: number
  session_count: number
  signals_matched: number
  score: number
  status: 'active' | 'churned' | 'new'
  source: 'PostHog' | 'Stripe' | 'Manual'
}

export const MOCK_IDENTITIES: IdentityData[] = [
  {
    id: 'id_001',
    email: 'sarah.johnson@techcorp.io',
    name: 'Sarah Johnson',
    company: 'TechCorp',
    company_size: '50-200',
    account_id: 'acc_techcorp',
    first_seen: '2024-10-15T10:00:00Z',
    last_seen: '2024-12-31T08:45:00Z',
    total_events: 1247,
    session_count: 89,
    signals_matched: 4,
    score: 87,
    status: 'active',
    source: 'PostHog',
  },
  {
    id: 'id_002',
    email: 'mike.chen@startup.com',
    name: 'Mike Chen',
    company: 'Startup Inc',
    company_size: '10-50',
    account_id: 'acc_startup',
    first_seen: '2024-11-02T14:30:00Z',
    last_seen: '2024-12-30T16:22:00Z',
    total_events: 834,
    session_count: 56,
    signals_matched: 3,
    score: 72,
    status: 'active',
    source: 'PostHog',
  },
  {
    id: 'id_003',
    email: 'alex.dev@agency.co',
    name: 'Alex Developer',
    company: 'Dev Agency',
    company_size: '5-10',
    account_id: 'acc_devagency',
    first_seen: '2024-09-20T09:15:00Z',
    last_seen: '2024-12-28T11:00:00Z',
    total_events: 2156,
    session_count: 124,
    signals_matched: 6,
    score: 94,
    status: 'active',
    source: 'PostHog',
  },
  {
    id: 'id_004',
    email: 'emma.sales@enterprise.org',
    name: 'Emma Sales',
    company: 'Enterprise Corp',
    company_size: '500+',
    account_id: 'acc_enterprise',
    first_seen: '2024-12-01T08:00:00Z',
    last_seen: '2024-12-31T09:30:00Z',
    total_events: 456,
    session_count: 28,
    signals_matched: 2,
    score: 65,
    status: 'new',
    source: 'PostHog',
  },
  {
    id: 'id_005',
    email: 'john.inactive@oldco.com',
    name: 'John Inactive',
    company: 'OldCo',
    company_size: '50-200',
    account_id: 'acc_oldco',
    first_seen: '2024-06-10T12:00:00Z',
    last_seen: '2024-11-15T14:00:00Z',
    total_events: 567,
    session_count: 34,
    signals_matched: 1,
    score: 23,
    status: 'churned',
    source: 'Stripe',
  },
  {
    id: 'id_006',
    email: 'lisa.power@growth.io',
    name: 'Lisa Power',
    company: 'Growth Labs',
    company_size: '10-50',
    account_id: 'acc_growthlabs',
    first_seen: '2024-08-25T11:30:00Z',
    last_seen: '2024-12-31T07:15:00Z',
    total_events: 1890,
    session_count: 98,
    signals_matched: 5,
    score: 91,
    status: 'active',
    source: 'PostHog',
  },
  {
    id: 'id_007',
    email: 'david.trial@newuser.com',
    name: 'David Trial',
    company: 'New User Co',
    company_size: '1-5',
    first_seen: '2024-12-28T16:00:00Z',
    last_seen: '2024-12-31T10:00:00Z',
    total_events: 78,
    session_count: 5,
    signals_matched: 1,
    score: 45,
    status: 'new',
    source: 'PostHog',
  },
  {
    id: 'id_008',
    email: 'anna.buyer@bigclient.com',
    name: 'Anna Buyer',
    company: 'Big Client Inc',
    company_size: '200-500',
    account_id: 'acc_bigclient',
    first_seen: '2024-07-15T09:00:00Z',
    last_seen: '2024-12-29T15:45:00Z',
    total_events: 3245,
    session_count: 156,
    signals_matched: 7,
    score: 98,
    status: 'active',
    source: 'Stripe',
  },
]
