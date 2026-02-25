/**
 * Statistical helper functions for signal analytics.
 */

/**
 * Chi-squared test on a 2x2 contingency table.
 * Returns { chiSquared, pValue }.
 *
 * Table layout:
 *        | Converted | Not Converted
 * Signal |     a     |      b
 * None   |     c     |      d
 */
export function chiSquaredTest(a: number, b: number, c: number, d: number): {
  chiSquared: number
  pValue: number
} {
  const n = a + b + c + d
  if (n === 0) return { chiSquared: 0, pValue: 1 }

  // Expected values
  const rowSignal = a + b
  const rowNone = c + d
  const colConverted = a + c
  const colNot = b + d

  if (rowSignal === 0 || rowNone === 0 || colConverted === 0 || colNot === 0) {
    return { chiSquared: 0, pValue: 1 }
  }

  const eA = (rowSignal * colConverted) / n
  const eB = (rowSignal * colNot) / n
  const eC = (rowNone * colConverted) / n
  const eD = (rowNone * colNot) / n

  const chi2 = ((a - eA) ** 2) / eA
    + ((b - eB) ** 2) / eB
    + ((c - eC) ** 2) / eC
    + ((d - eD) ** 2) / eD

  // p-value from chi-squared distribution with 1 degree of freedom
  // Using the complementary error function approximation
  const pValue = chi2PValue(chi2)

  return { chiSquared: chi2, pValue }
}

/**
 * Approximate p-value for chi-squared distribution with df=1.
 * Uses the relationship: chi2(1) = Z^2, so P(chi2 > x) = 2 * (1 - Phi(sqrt(x)))
 */
function chi2PValue(chi2: number): number {
  if (chi2 <= 0) return 1
  const z = Math.sqrt(chi2)
  // Standard normal CDF approximation (Abramowitz & Stegun 26.2.17)
  return 2 * (1 - normalCDF(z))
}

/**
 * Standard normal CDF approximation.
 * Accurate to ~1e-7 for |z| < 7.
 */
function normalCDF(z: number): number {
  if (z < -8) return 0
  if (z > 8) return 1

  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2

  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

  return 0.5 * (1.0 + sign * y)
}

/**
 * Convert p-value to significance percentage (0-100).
 */
export function pValueToSignificance(pValue: number): number {
  return Math.max(0, Math.min(100, (1 - pValue) * 100))
}
