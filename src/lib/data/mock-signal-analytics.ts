/**
 * Mock signal analytics data for demo mode.
 * Matches the design sketch's data structures and the SignalAnalyticsResponse type.
 */

import type {
  SignalAnalyticsResponse,
  SignalAnalyticsSnapshot,
  CohortRetention,
  ConversionCurve,
  SignalKPI,
  CustomerBreakdown,
} from '@/lib/api/signals'

// ── Months for time-series (12 months trailing) ──────────────

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date()
  d.setMonth(d.getMonth() - (11 - i))
  d.setDate(1)
  return d.toISOString().split('T')[0]
})

// ── Base data (from design sketch) ──────────────────────────

const BASE = {
  revenueSignal: [34, 38, 41, 45, 52, 48, 55, 61, 58, 64, 69, 72],
  revenueOther: [120, 118, 122, 125, 121, 128, 130, 126, 132, 135, 138, 140],
  occurrences: [142, 158, 175, 203, 189, 221, 248, 235, 267, 289, 312, 338],
  convSignal: [18.2, 19.1, 20.3, 21.8, 20.5, 22.4, 23.1, 22.8, 24.2, 25.1, 26.3, 27.5],
  convNoSignal: [4.1, 4.3, 4.2, 4.5, 4.4, 4.6, 4.5, 4.7, 4.8, 4.6, 4.9, 5.0],
  acvSignal: [42.5, 43.2, 44.8, 46.1, 45.3, 47.2, 48.5, 47.8, 49.6, 51.2, 52.8, 54.1],
  acvNoSignal: [28.3, 28.1, 28.5, 28.8, 28.6, 29.1, 29.0, 29.3, 29.5, 29.2, 29.8, 30.0],
}

// ── Customer breakdown per month ─────────────────────────────

const CUSTOMER_NAMES = ['Acme Corp', 'Initech', 'Globex', 'Soylent', 'Stark Ind', 'Cyberdyne', 'Umbrella']

function generateCustomers(monthIdx: number, revMul: number): CustomerBreakdown[] {
  const baseSpends = [8.2, 6.5, 5.8, 4.1, 3.2, 2.8, 2.4]
  const count = Math.min(3 + Math.floor(monthIdx / 3), 7)
  return CUSTOMER_NAMES.slice(0, count).map((name, i) => ({
    name,
    spend: Math.round(baseSpends[i] * revMul * (0.9 + monthIdx * 0.02) * 10) / 10,
    speed: (i < 2 ? 1 : i < 4 ? 2 : 3) as 1 | 2 | 3,
  }))
}

// ── Window configurations ────────────────────────────────────

interface WindowCfg {
  revMul: number
  convMul: number
  users: number
  converted: number
  revenue: number
  sig: number
  pval: number
}

const WINDOW_CFG: Record<string, WindowCfg> = {
  '7':    { revMul: 0.52, convMul: 0.60, users: 1480, converted: 355, revenue: 228, sig: 91.2, pval: 0.088 },
  '14':   { revMul: 0.78, convMul: 0.85, users: 2210, converted: 530, revenue: 342, sig: 95.1, pval: 0.049 },
  '30':   { revMul: 1.00, convMul: 1.00, users: 2847, converted: 684, revenue: 438, sig: 97.3, pval: 0.027 },
  '60':   { revMul: 1.12, convMul: 1.08, users: 3120, converted: 738, revenue: 491, sig: 96.1, pval: 0.039 },
  '90':   { revMul: 1.20, convMul: 1.12, users: 3310, converted: 772, revenue: 526, sig: 94.8, pval: 0.052 },
  'none': { revMul: 1.35, convMul: 1.18, users: 3680, converted: 824, revenue: 591, sig: 92.4, pval: 0.076 },
}

// ── Conversion curves ────────────────────────────────────────

const CONV_CURVE_PERIOD = {
  signal:   [0, 8.2, 5.4, 3.8, 2.6, 1.9, 1.4, 1.0, 0.7, 0.5, 0.3, 0.2, 0.1],
  nosignal: [0, 2.1, 1.5, 1.1, 0.8, 0.6, 0.4, 0.3, 0.2, 0.2, 0.1, 0.1, 0.1],
}

function cumulative(arr: number[]): number[] {
  const result: number[] = []
  let sum = 0
  for (const v of arr) {
    sum += v
    result.push(Math.round(sum * 100) / 100)
  }
  return result
}

const MOCK_CONVERSION_CURVE: ConversionCurve = {
  signal_period: CONV_CURVE_PERIOD.signal,
  nosignal_period: CONV_CURVE_PERIOD.nosignal,
  signal_cumulative: cumulative(CONV_CURVE_PERIOD.signal),
  nosignal_cumulative: cumulative(CONV_CURVE_PERIOD.nosignal),
}

// ── Retention data ───────────────────────────────────────────

const MOCK_RETENTION: CohortRetention[] = [
  // Users tab (no stat mode variant)
  {
    tab: 'users', stat_mode: 'total',
    signal_values:   [100, 82, 71, 64, 58, 54, 51, 49, 47],
    nosignal_values: [100, 61, 48, 39, 33, 29, 26, 24, 22],
  },
  // Events tab
  {
    tab: 'events', stat_mode: 'total',
    signal_values:   [100, 88, 78, 72, 67, 63, 60, 58, 56],
    nosignal_values: [100, 55, 40, 32, 27, 23, 20, 18, 17],
  },
  {
    tab: 'events', stat_mode: 'avg',
    signal_values:   [100, 107, 110, 112, 115, 117, 118, 118, 119],
    nosignal_values: [100, 90, 83, 82, 82, 79, 77, 75, 77],
  },
  {
    tab: 'events', stat_mode: 'median',
    signal_values:   [100, 95, 92, 90, 88, 87, 86, 85, 85],
    nosignal_values: [100, 78, 68, 62, 58, 55, 53, 51, 50],
  },
  // Revenue tab
  {
    tab: 'revenue', stat_mode: 'total',
    signal_values:   [100, 91, 83, 78, 74, 71, 69, 67, 66],
    nosignal_values: [100, 58, 43, 35, 30, 26, 24, 22, 21],
  },
  {
    tab: 'revenue', stat_mode: 'avg',
    signal_values:   [100, 111, 117, 122, 128, 131, 135, 137, 140],
    nosignal_values: [100, 95, 90, 90, 91, 90, 92, 92, 95],
  },
  {
    tab: 'revenue', stat_mode: 'median',
    signal_values:   [100, 98, 94, 91, 89, 87, 86, 85, 84],
    nosignal_values: [100, 82, 72, 65, 60, 57, 54, 52, 51],
  },
]

// ── Build mock analytics for a given window ──────────────────

function buildSnapshots(windowKey: string): SignalAnalyticsSnapshot[] {
  const cfg = WINDOW_CFG[windowKey]
  const windowDays = windowKey === 'none' ? null : parseInt(windowKey, 10)

  return MONTHS.map((month, i) => ({
    id: `mock-snap-${windowKey}-${i}`,
    month,
    conversion_window_days: windowDays,
    users_with_signal: Math.round(cfg.users * (0.7 + i * 0.03)),
    converted_users: Math.round(cfg.converted * (0.7 + i * 0.03)),
    additional_net_revenue: Math.round(cfg.revenue * (0.7 + i * 0.03) * 100) / 100,
    statistical_significance: cfg.sig + (i - 6) * 0.3,
    p_value: Math.max(0.001, cfg.pval - (i - 6) * 0.002),
    revenue_signal: Math.round(BASE.revenueSignal[i] * cfg.revMul),
    revenue_other: BASE.revenueOther[i],
    occurrences: BASE.occurrences[i],
    conversion_rate_signal: Number((BASE.convSignal[i] * cfg.convMul).toFixed(1)),
    conversion_rate_nosignal: BASE.convNoSignal[i],
    acv_signal: Number((BASE.acvSignal[i] * (0.85 + 0.15 * cfg.revMul)).toFixed(1)),
    acv_nosignal: BASE.acvNoSignal[i],
    customer_breakdown: generateCustomers(i, cfg.revMul),
    computed_at: new Date().toISOString(),
  }))
}

function buildKPI(windowKey: string): SignalKPI {
  const cfg = WINDOW_CFG[windowKey]
  return {
    users_with_signal: cfg.users,
    converted_users: cfg.converted,
    additional_net_revenue: cfg.revenue,
    statistical_significance: cfg.sig,
    p_value: cfg.pval,
    conversion_rate: Number(((cfg.converted / cfg.users) * 100).toFixed(1)),
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Build a complete mock SignalAnalyticsResponse for a given signal and window.
 */
export function getMockSignalAnalytics(
  signalId: string,
  windowDays: number | null = 30
): SignalAnalyticsResponse {
  const windowKey = windowDays === null ? 'none' : String(windowDays)
  const cfg = WINDOW_CFG[windowKey] || WINDOW_CFG['30']

  return {
    signal_definition_id: signalId,
    conversion_window_days: windowDays,
    kpi: buildKPI(windowKey),
    snapshots: buildSnapshots(windowKey),
    retention: MOCK_RETENTION,
    conversion_curve: MOCK_CONVERSION_CURVE,
    available_windows: [7, 14, 30, 60, 90, null],
  }
}

/**
 * All available window keys for demo mode.
 */
export const MOCK_WINDOWS = Object.keys(WINDOW_CFG)
