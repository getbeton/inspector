import { describe, it, expect } from 'vitest'
import { chiSquaredTest, pValueToSignificance } from './stats'

describe('chiSquaredTest', () => {
  it('returns p=1 for empty table', () => {
    const result = chiSquaredTest(0, 0, 0, 0)
    expect(result.chiSquared).toBe(0)
    expect(result.pValue).toBe(1)
  })

  it('returns p=1 when one row is zero', () => {
    const result = chiSquaredTest(10, 5, 0, 0)
    expect(result.pValue).toBe(1)
  })

  it('returns p=1 when one column is zero', () => {
    const result = chiSquaredTest(0, 10, 0, 5)
    expect(result.pValue).toBe(1)
  })

  it('detects significant difference in a clear 2x2 table', () => {
    // Signal: 30 converted, 70 not = 30% rate
    // Control: 10 converted, 90 not = 10% rate
    const result = chiSquaredTest(30, 70, 10, 90)
    expect(result.chiSquared).toBeGreaterThan(3.84) // chi2 > 3.84 => p < 0.05
    expect(result.pValue).toBeLessThan(0.05)
  })

  it('detects non-significant difference when groups are similar', () => {
    // Signal: 11 converted, 89 not = 11% rate
    // Control: 10 converted, 90 not = 10% rate
    const result = chiSquaredTest(11, 89, 10, 90)
    expect(result.pValue).toBeGreaterThan(0.05)
  })

  it('produces correct chi-squared for known values', () => {
    // Classic textbook example: 2x2 table
    // Signal: 40 converted, 60 not
    // Control: 20 converted, 80 not
    const result = chiSquaredTest(40, 60, 20, 80)
    // Expected chi2 ≈ 9.52
    expect(result.chiSquared).toBeGreaterThan(8)
    expect(result.chiSquared).toBeLessThan(11)
    expect(result.pValue).toBeLessThan(0.01)
  })

  it('handles large samples correctly', () => {
    // 1000 signal users, 5000 control
    // Signal: 200/1000 = 20% conversion
    // Control: 500/5000 = 10% conversion
    const result = chiSquaredTest(200, 800, 500, 4500)
    expect(result.pValue).toBeLessThan(0.001)
  })

  it('symmetric results for swapped rows', () => {
    const r1 = chiSquaredTest(30, 70, 10, 90)
    const r2 = chiSquaredTest(10, 90, 30, 70)
    // Chi-squared should be the same (symmetric test)
    expect(r1.chiSquared).toBeCloseTo(r2.chiSquared, 5)
    expect(r1.pValue).toBeCloseTo(r2.pValue, 5)
  })
})

describe('pValueToSignificance', () => {
  it('converts p=0 to 100%', () => {
    expect(pValueToSignificance(0)).toBe(100)
  })

  it('converts p=1 to 0%', () => {
    expect(pValueToSignificance(1)).toBe(0)
  })

  it('converts p=0.05 to 95%', () => {
    expect(pValueToSignificance(0.05)).toBe(95)
  })

  it('converts p=0.01 to 99%', () => {
    expect(pValueToSignificance(0.01)).toBe(99)
  })

  it('clamps negative p-values to 100%', () => {
    expect(pValueToSignificance(-0.1)).toBe(100)
  })

  it('clamps p > 1 to 0%', () => {
    expect(pValueToSignificance(1.5)).toBe(0)
  })
})
