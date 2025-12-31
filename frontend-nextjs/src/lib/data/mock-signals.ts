/**
 * Mock signals data for demo mode
 * Matches the Streamlit frontend mock data structure
 */

export interface SignalData {
  id: string
  name: string
  status: 'active' | 'draft'
  lift: number
  confidence: number
  leads_per_month: number
  estimated_arr: number
  source: 'Beton-Discovered' | 'User-Defined'
  trend_30d: string
  sample_with: number
  sample_without: number
  conversion_with: number
  conversion_without: number
  trend_data: number[]
  accuracy_trend: number[]
}

export const MOCK_SIGNALS: SignalData[] = [
  {
    id: 'sig_001',
    name: 'Onboarding completed within 3 days',
    status: 'active',
    lift: 4.2,
    confidence: 0.997,
    leads_per_month: 47,
    estimated_arr: 378000,
    source: 'Beton-Discovered',
    trend_30d: '+12%',
    sample_with: 1456,
    sample_without: 8725,
    conversion_with: 0.143,
    conversion_without: 0.034,
    trend_data: [3.9, 4.0, 4.1, 4.3, 4.2, 4.4, 4.2],
    accuracy_trend: [0.85, 0.87, 0.89, 0.91, 0.90, 0.88, 0.90]
  },
  {
    id: 'sig_002',
    name: 'Invited 2+ teammates',
    status: 'active',
    lift: 3.8,
    confidence: 0.99,
    leads_per_month: 31,
    estimated_arr: 249000,
    source: 'Beton-Discovered',
    trend_30d: '+8%',
    sample_with: 982,
    sample_without: 9198,
    conversion_with: 0.129,
    conversion_without: 0.034,
    trend_data: [3.5, 3.6, 3.7, 3.8, 3.9, 3.7, 3.8],
    accuracy_trend: [0.82, 0.84, 0.86, 0.88, 0.87, 0.86, 0.88]
  },
  {
    id: 'sig_003',
    name: 'Pricing page visited 2+ times',
    status: 'active',
    lift: 3.1,
    confidence: 0.95,
    leads_per_month: 23,
    estimated_arr: 185000,
    source: 'Beton-Discovered',
    trend_30d: '-3%',
    sample_with: 743,
    sample_without: 9437,
    conversion_with: 0.105,
    conversion_without: 0.034,
    trend_data: [3.3, 3.2, 3.1, 3.0, 3.1, 3.2, 3.1],
    accuracy_trend: [0.78, 0.79, 0.77, 0.76, 0.78, 0.79, 0.78]
  },
  {
    id: 'sig_004',
    name: 'API key created',
    status: 'active',
    lift: 2.9,
    confidence: 0.98,
    leads_per_month: 19,
    estimated_arr: 153000,
    source: 'Beton-Discovered',
    trend_30d: '+5%',
    sample_with: 621,
    sample_without: 9559,
    conversion_with: 0.099,
    conversion_without: 0.034,
    trend_data: [2.7, 2.8, 2.8, 2.9, 2.9, 2.8, 2.9],
    accuracy_trend: [0.80, 0.81, 0.83, 0.85, 0.84, 0.83, 0.85]
  },
  {
    id: 'sig_005',
    name: 'Dashboard created',
    status: 'draft',
    lift: 2.4,
    confidence: 0.94,
    leads_per_month: 28,
    estimated_arr: 225000,
    source: 'User-Defined',
    trend_30d: '+2%',
    sample_with: 891,
    sample_without: 9289,
    conversion_with: 0.082,
    conversion_without: 0.034,
    trend_data: [2.3, 2.3, 2.4, 2.4, 2.5, 2.4, 2.4],
    accuracy_trend: [0.75, 0.76, 0.78, 0.79, 0.78, 0.77, 0.79]
  }
]
