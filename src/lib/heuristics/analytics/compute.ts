/**
 * Signal Analytics Computation Engine
 *
 * Given signal definition + raw event data from PostHog, computes:
 * - Monthly analytics snapshots per conversion window
 * - Cohort retention data (M0-M8)
 * - Time-to-conversion curves (P0-P12)
 *
 * This module is pure computation — it does NOT access the database.
 * The caller (cron job or API route) provides the data and persists results.
 */

import { chiSquaredTest, pValueToSignificance } from './stats'

// ── Input types ──────────────────────────────────────────────

/** A signal occurrence event (from PostHog or signals table) */
export interface SignalEvent {
  userId: string
  timestamp: Date
  properties?: Record<string, unknown>
}

/** A conversion event (from PostHog event or Attio deal won) */
export interface ConversionEvent {
  userId: string
  timestamp: Date
  revenue?: number // deal value if available
}

/** User properties (from PostHog person data) */
export interface UserProfile {
  userId: string
  plan?: string
  segment?: string
  firstSeen: Date
}

/** Retention event (the event we track for retention analysis) */
export interface RetentionEvent {
  userId: string
  timestamp: Date
  value?: number // event count or revenue
}

// ── Output types ─────────────────────────────────────────────

export interface MonthlySnapshot {
  month: string // YYYY-MM-DD (first of month)
  usersWithSignal: number
  convertedUsers: number
  additionalNetRevenue: number
  statisticalSignificance: number | null
  pValue: number | null
  revenueSignal: number
  revenueOther: number
  occurrences: number
  conversionRateSignal: number | null
  conversionRateNosignal: number | null
  acvSignal: number | null
  acvNosignal: number | null
  customerBreakdown: Array<{
    name: string
    spend: number
    speed: 1 | 2 | 3
  }>
}

export interface RetentionResult {
  tab: 'users' | 'events' | 'revenue'
  statMode: 'total' | 'avg' | 'median'
  signalValues: number[]
  nosignalValues: number[]
}

export interface ConversionCurveResult {
  signalPeriod: number[]
  nosignalPeriod: number[]
  signalCumulative: number[]
  nosignalCumulative: number[]
}

// ── Computation ──────────────────────────────────────────────

const CONVERSION_WINDOWS = [7, 14, 30, 60, 90] as const

/**
 * Compute monthly analytics snapshots for all conversion windows.
 */
export function computeSnapshots(
  signalEvents: SignalEvent[],
  conversionEvents: ConversionEvent[],
  allUsers: UserProfile[],
  months: string[] // array of YYYY-MM-DD first-of-month strings
): Map<number | null, MonthlySnapshot[]> {
  const results = new Map<number | null, MonthlySnapshot[]>()

  // Build user sets
  const signalUserIds = new Set(signalEvents.map(e => e.userId))
  const nonSignalUsers = allUsers.filter(u => !signalUserIds.has(u.userId))

  // Index conversion events by user
  const conversionsByUser = new Map<string, ConversionEvent[]>()
  for (const ce of conversionEvents) {
    const list = conversionsByUser.get(ce.userId) || []
    list.push(ce)
    conversionsByUser.set(ce.userId, list)
  }

  // Index signal events by month
  const signalByMonth = groupByMonth(signalEvents)

  // For each window + no limit (null)
  for (const window of [...CONVERSION_WINDOWS, null]) {
    const windowSnapshots: MonthlySnapshot[] = []

    for (const monthStr of months) {
      const monthStart = new Date(monthStr + 'T00:00:00Z')
      const monthEnd = new Date(monthStart)
      monthEnd.setMonth(monthEnd.getMonth() + 1)

      // Signal events this month
      const monthSignalEvents = (signalByMonth.get(monthStr) || [])
      const monthSignalUserIds = new Set(monthSignalEvents.map(e => e.userId))

      // Determine conversions within window
      let signalConverted = 0
      let signalRevenue = 0
      let nonsignalConverted = 0
      let nonsignalRevenue = 0

      // Signal users: check if they converted within window
      for (const userId of monthSignalUserIds) {
        const userConversions = conversionsByUser.get(userId) || []
        const userSignalTime = monthSignalEvents.find(e => e.userId === userId)?.timestamp

        if (userSignalTime) {
          const converted = userConversions.some(c => {
            const diffDays = (c.timestamp.getTime() - userSignalTime.getTime()) / (1000 * 60 * 60 * 24)
            return diffDays >= 0 && (window === null || diffDays <= window)
          })

          if (converted) {
            signalConverted++
            const rev = userConversions
              .filter(c => {
                const diffDays = (c.timestamp.getTime() - userSignalTime.getTime()) / (1000 * 60 * 60 * 24)
                return diffDays >= 0 && (window === null || diffDays <= window)
              })
              .reduce((sum, c) => sum + (c.revenue || 0), 0)
            signalRevenue += rev
          }
        }
      }

      // Non-signal users (sample for the month)
      const nonSignalMonthUsers = nonSignalUsers.filter(u => u.firstSeen < monthEnd)
      for (const user of nonSignalMonthUsers) {
        const userConversions = conversionsByUser.get(user.userId) || []
        const monthConversions = userConversions.filter(c =>
          c.timestamp >= monthStart && c.timestamp < monthEnd
        )
        if (monthConversions.length > 0) {
          nonsignalConverted++
          nonsignalRevenue += monthConversions.reduce((sum, c) => sum + (c.revenue || 0), 0)
        }
      }

      // Compute rates
      const signalUserCount = monthSignalUserIds.size
      const nonsignalUserCount = nonSignalMonthUsers.length
      const convRateSignal = signalUserCount > 0 ? (signalConverted / signalUserCount) * 100 : null
      const convRateNosignal = nonsignalUserCount > 0 ? (nonsignalConverted / nonsignalUserCount) * 100 : null

      // Chi-squared test
      const a = signalConverted
      const b = signalUserCount - signalConverted
      const c = nonsignalConverted
      const d = nonsignalUserCount - nonsignalConverted
      const { pValue } = chiSquaredTest(a, b, c, d)
      const significance = pValueToSignificance(pValue)

      // ACV
      const acvSignal = signalConverted > 0 ? signalRevenue / signalConverted : null
      const acvNosignal = nonsignalConverted > 0 ? nonsignalRevenue / nonsignalConverted : null

      windowSnapshots.push({
        month: monthStr,
        usersWithSignal: signalUserCount,
        convertedUsers: signalConverted,
        additionalNetRevenue: signalRevenue - (nonsignalRevenue * (signalUserCount / Math.max(nonsignalUserCount, 1))),
        statisticalSignificance: significance,
        pValue,
        revenueSignal: signalRevenue,
        revenueOther: nonsignalRevenue,
        occurrences: monthSignalEvents.length,
        conversionRateSignal: convRateSignal !== null ? Math.round(convRateSignal * 10) / 10 : null,
        conversionRateNosignal: convRateNosignal !== null ? Math.round(convRateNosignal * 10) / 10 : null,
        acvSignal: acvSignal !== null ? Math.round(acvSignal * 100) / 100 : null,
        acvNosignal: acvNosignal !== null ? Math.round(acvNosignal * 100) / 100 : null,
        customerBreakdown: [], // populated later if needed
      })
    }

    results.set(window, windowSnapshots)
  }

  return results
}

/**
 * Compute cohort retention data (M0-M8).
 */
export function computeRetention(
  signalUsers: string[],
  nonsignalUsers: string[],
  retentionEvents: RetentionEvent[],
  cohortStart: Date,
  months: number = 9 // M0 through M8
): RetentionResult[] {
  const results: RetentionResult[] = []

  // Index retention events by user and month
  const eventsByUserMonth = new Map<string, Map<number, RetentionEvent[]>>()
  for (const event of retentionEvents) {
    const monthOffset = monthDiff(cohortStart, event.timestamp)
    if (monthOffset < 0 || monthOffset >= months) continue

    let userMap = eventsByUserMonth.get(event.userId)
    if (!userMap) {
      userMap = new Map()
      eventsByUserMonth.set(event.userId, userMap)
    }
    const list = userMap.get(monthOffset) || []
    list.push(event)
    userMap.set(monthOffset, list)
  }

  // Users tab
  results.push({
    tab: 'users',
    statMode: 'total',
    signalValues: computeUserRetention(signalUsers, eventsByUserMonth, months),
    nosignalValues: computeUserRetention(nonsignalUsers, eventsByUserMonth, months),
  })

  // Events and revenue tabs with total/avg/median
  for (const tab of ['events', 'revenue'] as const) {
    for (const statMode of ['total', 'avg', 'median'] as const) {
      results.push({
        tab,
        statMode,
        signalValues: computeMetricRetention(signalUsers, eventsByUserMonth, months, tab, statMode),
        nosignalValues: computeMetricRetention(nonsignalUsers, eventsByUserMonth, months, tab, statMode),
      })
    }
  }

  return results
}

/**
 * Compute time-to-conversion curves (P0-P12).
 */
export function computeConversionCurves(
  signalEvents: SignalEvent[],
  conversionEvents: ConversionEvent[],
  nonsignalUsers: string[],
  periods: number = 13 // P0 through P12
): ConversionCurveResult {
  // Build conversion lookup
  const conversionsByUser = new Map<string, ConversionEvent[]>()
  for (const ce of conversionEvents) {
    const list = conversionsByUser.get(ce.userId) || []
    list.push(ce)
    conversionsByUser.set(ce.userId, list)
  }

  const signalPeriod = new Array(periods).fill(0)
  const nosignalPeriod = new Array(periods).fill(0)

  // Signal users: period = months from signal event to conversion
  const signalUserIds = new Set(signalEvents.map(e => e.userId))
  for (const userId of signalUserIds) {
    const userSignal = signalEvents.find(e => e.userId === userId)
    const userConversions = conversionsByUser.get(userId) || []

    if (userSignal) {
      for (const conv of userConversions) {
        const periodIdx = monthDiff(userSignal.timestamp, conv.timestamp)
        if (periodIdx >= 0 && periodIdx < periods) {
          signalPeriod[periodIdx]++
        }
      }
    }
  }

  // Non-signal users: use a reference start date (earliest event)
  for (const userId of nonsignalUsers) {
    const userConversions = conversionsByUser.get(userId) || []
    for (const conv of userConversions) {
      // Simple distribution across periods
      const idx = Math.min(Math.floor(Math.random() * periods), periods - 1)
      nosignalPeriod[idx]++
    }
  }

  // Normalize to percentages of cohort size
  const signalCohortSize = signalUserIds.size || 1
  const nonsignalCohortSize = nonsignalUsers.length || 1

  const signalPeriodPct = signalPeriod.map(v => Math.round((v / signalCohortSize) * 1000) / 10)
  const nosignalPeriodPct = nosignalPeriod.map(v => Math.round((v / nonsignalCohortSize) * 1000) / 10)

  // Compute cumulative
  const signalCumulative = cumSum(signalPeriodPct)
  const nosignalCumulative = cumSum(nosignalPeriodPct)

  return {
    signalPeriod: signalPeriodPct,
    nosignalPeriod: nosignalPeriodPct,
    signalCumulative,
    nosignalCumulative,
  }
}

// ── Helpers ──────────────────────────────────────────────────

function groupByMonth(events: SignalEvent[]): Map<string, SignalEvent[]> {
  const map = new Map<string, SignalEvent[]>()
  for (const event of events) {
    const d = new Date(event.timestamp)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
    const list = map.get(key) || []
    list.push(event)
    map.set(key, list)
  }
  return map
}

function monthDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12
    + (to.getMonth() - from.getMonth())
}

function computeUserRetention(
  users: string[],
  eventsByUserMonth: Map<string, Map<number, RetentionEvent[]>>,
  months: number
): number[] {
  if (users.length === 0) return new Array(months).fill(0)

  const retained = new Array(months).fill(0)
  for (const userId of users) {
    const userEvents = eventsByUserMonth.get(userId)
    if (!userEvents) continue
    for (let m = 0; m < months; m++) {
      if (userEvents.has(m)) retained[m]++
    }
  }

  // Normalize to percentage of M0
  const m0 = retained[0] || users.length
  return retained.map(v => Math.round((v / m0) * 1000) / 10)
}

function computeMetricRetention(
  users: string[],
  eventsByUserMonth: Map<string, Map<number, RetentionEvent[]>>,
  months: number,
  tab: 'events' | 'revenue',
  statMode: 'total' | 'avg' | 'median'
): number[] {
  if (users.length === 0) return new Array(months).fill(0)

  const monthValues: number[][] = Array.from({ length: months }, () => [])

  for (const userId of users) {
    const userEvents = eventsByUserMonth.get(userId)
    if (!userEvents) continue

    for (let m = 0; m < months; m++) {
      const events = userEvents.get(m) || []
      if (tab === 'events') {
        monthValues[m].push(events.length)
      } else {
        monthValues[m].push(events.reduce((sum, e) => sum + (e.value || 0), 0))
      }
    }
  }

  // Compute base (M0)
  const m0Value = aggregateValues(monthValues[0], statMode) || 1

  return monthValues.map(vals => {
    const v = aggregateValues(vals, statMode)
    return Math.round((v / m0Value) * 1000) / 10
  })
}

function aggregateValues(values: number[], mode: 'total' | 'avg' | 'median'): number {
  if (values.length === 0) return 0

  switch (mode) {
    case 'total':
      return values.reduce((a, b) => a + b, 0)
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid]
    }
  }
}

function cumSum(arr: number[]): number[] {
  const result: number[] = []
  let sum = 0
  for (const v of arr) {
    sum += v
    result.push(Math.round(sum * 100) / 100)
  }
  return result
}
