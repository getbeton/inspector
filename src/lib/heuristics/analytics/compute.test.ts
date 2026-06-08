import { describe, it, expect } from 'vitest'
import {
  computeSnapshots,
  computeRetention,
  computeConversionCurves,
  type SignalEvent,
  type ConversionEvent,
  type UserProfile,
  type RetentionEvent,
} from './compute'

// ── Helpers ──────────────────────────────────────────────

function date(year: number, month: number, day: number = 1): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

function monthStr(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

// ── computeSnapshots ─────────────────────────────────────

describe('computeSnapshots', () => {
  const months = [monthStr(2025, 1), monthStr(2025, 2), monthStr(2025, 3)]

  const allUsers: UserProfile[] = [
    { userId: 'u1', plan: 'pro', segment: 'smb', firstSeen: date(2024, 1) },
    { userId: 'u2', plan: 'free', segment: 'smb', firstSeen: date(2024, 1) },
    { userId: 'u3', plan: 'free', segment: 'mid', firstSeen: date(2024, 1) },
    { userId: 'u4', plan: 'pro', segment: 'smb', firstSeen: date(2024, 1) },
    { userId: 'u5', plan: 'free', segment: 'smb', firstSeen: date(2024, 1) },
  ]

  it('returns snapshots for all windows plus null', () => {
    const signalEvents: SignalEvent[] = [
      { userId: 'u1', timestamp: date(2025, 1, 10) },
    ]
    const conversionEvents: ConversionEvent[] = []

    const result = computeSnapshots(signalEvents, conversionEvents, allUsers, months)

    // 5 windows (7, 14, 30, 60, 90) + 1 null = 6
    expect(result.size).toBe(6)

    // Each window has 3 months
    for (const [, snapshots] of result) {
      expect(snapshots).toHaveLength(3)
    }
  })

  it('counts signal occurrences per month', () => {
    const signalEvents: SignalEvent[] = [
      { userId: 'u1', timestamp: date(2025, 1, 5) },
      { userId: 'u2', timestamp: date(2025, 1, 15) },
      { userId: 'u3', timestamp: date(2025, 2, 10) },
    ]

    const result = computeSnapshots(signalEvents, [], allUsers, months)
    const window30 = result.get(30)!

    expect(window30[0].occurrences).toBe(2)  // Jan: u1 + u2
    expect(window30[1].occurrences).toBe(1)  // Feb: u3
    expect(window30[2].occurrences).toBe(0)  // Mar: none
  })

  it('counts conversions within window', () => {
    const signalEvents: SignalEvent[] = [
      { userId: 'u1', timestamp: date(2025, 1, 10) },
    ]
    const conversionEvents: ConversionEvent[] = [
      { userId: 'u1', timestamp: date(2025, 1, 20), revenue: 1000 }, // 10 days after signal
    ]

    const result = computeSnapshots(signalEvents, conversionEvents, allUsers, months)

    // 7-day window: should NOT count (10 > 7)
    const w7 = result.get(7)!
    expect(w7[0].convertedUsers).toBe(0)

    // 14-day window: should count (10 <= 14)
    const w14 = result.get(14)!
    expect(w14[0].convertedUsers).toBe(1)
    expect(w14[0].revenueSignal).toBe(1000)

    // 30-day window: should count
    const w30 = result.get(30)!
    expect(w30[0].convertedUsers).toBe(1)

    // null (no limit): should count
    const wNone = result.get(null)!
    expect(wNone[0].convertedUsers).toBe(1)
  })

  it('computes conversion rates correctly', () => {
    const signalEvents: SignalEvent[] = [
      { userId: 'u1', timestamp: date(2025, 1, 5) },
      { userId: 'u2', timestamp: date(2025, 1, 10) },
    ]
    const conversionEvents: ConversionEvent[] = [
      { userId: 'u1', timestamp: date(2025, 1, 15), revenue: 500 }, // within 30d
    ]

    const result = computeSnapshots(signalEvents, conversionEvents, allUsers, months)
    const w30 = result.get(30)!

    // Signal: 1 of 2 converted = 50%
    expect(w30[0].conversionRateSignal).toBe(50.0)
    expect(w30[0].usersWithSignal).toBe(2)
  })

  it('computes statistical significance', () => {
    // Create a clear difference: many signal users convert, few control do
    const signalEvents: SignalEvent[] = Array.from({ length: 50 }, (_, i) => ({
      userId: `signal-${i}`,
      timestamp: date(2025, 1, 5),
    }))

    const conversionEvents: ConversionEvent[] = [
      // 20 of 50 signal users convert = 40%
      ...Array.from({ length: 20 }, (_, i) => ({
        userId: `signal-${i}`,
        timestamp: date(2025, 1, 15),
        revenue: 100,
      })),
    ]

    const users: UserProfile[] = [
      ...Array.from({ length: 50 }, (_, i) => ({
        userId: `signal-${i}`,
        firstSeen: date(2024, 1),
      })),
      ...Array.from({ length: 200 }, (_, i) => ({
        userId: `control-${i}`,
        firstSeen: date(2024, 1),
      })),
    ]

    const result = computeSnapshots(signalEvents, conversionEvents, users, months)
    const w30 = result.get(30)!

    // Should have non-null significance
    expect(w30[0].statisticalSignificance).not.toBeNull()
    expect(w30[0].pValue).not.toBeNull()
    // 40% vs 0% should be highly significant
    expect(w30[0].statisticalSignificance!).toBeGreaterThan(90)
  })
})

// ── computeRetention ─────────────────────────────────────

describe('computeRetention', () => {
  const cohortStart = date(2025, 1)

  it('returns all retention combinations (users + events/revenue x total/avg/median)', () => {
    const result = computeRetention([], [], [], cohortStart, 9)

    // users:total + events:total/avg/median + revenue:total/avg/median = 7
    expect(result).toHaveLength(7)
    expect(result.find(r => r.tab === 'users')).toBeDefined()
    expect(result.filter(r => r.tab === 'events')).toHaveLength(3)
    expect(result.filter(r => r.tab === 'revenue')).toHaveLength(3)
  })

  it('computes user retention from events', () => {
    const signalUsers = ['u1', 'u2', 'u3']
    const retentionEvents: RetentionEvent[] = [
      // u1 active in M0, M1, M2
      { userId: 'u1', timestamp: date(2025, 1, 5) },
      { userId: 'u1', timestamp: date(2025, 2, 10) },
      { userId: 'u1', timestamp: date(2025, 3, 15) },
      // u2 active in M0, M1 (churns at M2)
      { userId: 'u2', timestamp: date(2025, 1, 8) },
      { userId: 'u2', timestamp: date(2025, 2, 12) },
      // u3 active in M0 only
      { userId: 'u3', timestamp: date(2025, 1, 20) },
    ]

    const result = computeRetention(signalUsers, [], retentionEvents, cohortStart, 4)
    const userRet = result.find(r => r.tab === 'users')!

    // M0: all 3 active = 100%
    expect(userRet.signalValues[0]).toBe(100)
    // M1: u1, u2 active = 66.7%
    expect(userRet.signalValues[1]).toBeCloseTo(66.7, 0)
    // M2: u1 only = 33.3%
    expect(userRet.signalValues[2]).toBeCloseTo(33.3, 0)
    // M3: nobody = 0%
    expect(userRet.signalValues[3]).toBe(0)
  })

  it('returns 9 values for M0-M8', () => {
    const result = computeRetention(['u1'], [], [], cohortStart, 9)
    const userRet = result.find(r => r.tab === 'users')!
    expect(userRet.signalValues).toHaveLength(9)
    expect(userRet.nosignalValues).toHaveLength(9)
  })
})

// ── computeConversionCurves ──────────────────────────────

describe('computeConversionCurves', () => {
  it('returns 13 period values (P0-P12)', () => {
    const result = computeConversionCurves([], [], [], 13)
    expect(result.signalPeriod).toHaveLength(13)
    expect(result.nosignalPeriod).toHaveLength(13)
    expect(result.signalCumulative).toHaveLength(13)
    expect(result.nosignalCumulative).toHaveLength(13)
  })

  it('cumulative is running sum of period', () => {
    const signalEvents: SignalEvent[] = [
      { userId: 'u1', timestamp: date(2025, 1, 1) },
      { userId: 'u2', timestamp: date(2025, 1, 1) },
    ]
    const conversionEvents: ConversionEvent[] = [
      { userId: 'u1', timestamp: date(2025, 1, 15) }, // same month = P0
      { userId: 'u2', timestamp: date(2025, 2, 15) }, // next month = P1
    ]

    const result = computeConversionCurves(signalEvents, conversionEvents, [], 3)

    // Cumulative should be monotonically non-decreasing
    for (let i = 1; i < result.signalCumulative.length; i++) {
      expect(result.signalCumulative[i]).toBeGreaterThanOrEqual(result.signalCumulative[i - 1])
    }
  })

  it('period values are non-negative percentages', () => {
    const result = computeConversionCurves(
      [{ userId: 'u1', timestamp: date(2025, 1, 1) }],
      [{ userId: 'u1', timestamp: date(2025, 1, 15) }],
      [],
      5
    )

    for (const v of result.signalPeriod) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })
})
