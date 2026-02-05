/**
 * HeuristicsEngine - Core scoring engine
 *
 * Calculates health scores using weighted scoring with fit multipliers and recency decay.
 * Formula: Score = (Signal_Sum * Fit_Multiplier) * Recency_Decay
 */

import type { Signal, Account, ScoringConfig, ScoreResult, AllScores, OpportunitySummary } from './types'
import { calculateRecencyDecay, calculateFitMultiplier, normalizeScore, getSignalCutoffDate } from './utils'
import { formatScoreDisplay, getGradeDefinition } from './concrete-grades'
import { getScoringConfig, getSignalConfig } from './scoring-config'

export interface HeuristicsEngineOptions {
  config?: Partial<ScoringConfig>
}

export class HeuristicsEngine {
  private config: ScoringConfig

  constructor(options: HeuristicsEngineOptions = {}) {
    this.config = getScoringConfig(options.config)
  }

  /**
   * Calculate overall health score for an account
   *
   * @param signals - Array of signals for the account
   * @param account - Account data (for fit score)
   * @returns Health score result with component breakdown
   */
  calculateHealthScore(signals: Signal[], account: Account): ScoreResult {
    const cutoffDate = getSignalCutoffDate(this.config)
    const relevantSignals = this.filterSignalsByDate(signals, cutoffDate)

    if (relevantSignals.length === 0) {
      // Neutral score if no signals
      return {
        score: 50.0,
        componentScores: {},
        grade: getGradeDefinition(50.0),
      }
    }

    // Calculate weighted signal sum with recency decay
    let signalSum = 0.0
    const componentScores: Record<string, number> = {}

    for (const signal of relevantSignals) {
      const signalConfig = getSignalConfig(signal.type, this.config)
      const weight = signalConfig.weight

      // Apply recency decay
      const decayFactor = calculateRecencyDecay(signal.timestamp, this.config)

      // Calculate contribution
      const contribution = weight * decayFactor
      signalSum += contribution

      // Track component contributions
      if (!componentScores[signal.type]) {
        componentScores[signal.type] = 0
      }
      componentScores[signal.type] += contribution
    }

    // Apply fit multiplier
    const fitMultiplier = calculateFitMultiplier(account.fit_score, this.config)
    const adjustedSum = signalSum * fitMultiplier

    // Normalize to 0-100 scale
    const healthScore = normalizeScore(adjustedSum, this.config)

    return {
      score: healthScore,
      componentScores,
      grade: getGradeDefinition(healthScore),
    }
  }

  /**
   * Calculate expansion opportunity score
   * Focuses on positive signals indicating growth potential
   */
  calculateExpansionScore(signals: Signal[], account: Account): ScoreResult {
    const cutoffDate = getSignalCutoffDate(this.config)
    const relevantSignals = this.filterSignalsByDate(signals, cutoffDate)

    let expansionSum = 0.0
    const componentScores: Record<string, number> = {}

    for (const signal of relevantSignals) {
      const signalConfig = getSignalConfig(signal.type, this.config)

      if (signalConfig.category === 'expansion') {
        const weight = signalConfig.weight
        const decayFactor = calculateRecencyDecay(signal.timestamp, this.config)
        const contribution = weight * decayFactor
        expansionSum += contribution

        if (!componentScores[signal.type]) {
          componentScores[signal.type] = 0
        }
        componentScores[signal.type] += contribution
      }
    }

    // Apply fit multiplier
    const fitMultiplier = calculateFitMultiplier(account.fit_score, this.config)
    const adjustedSum = expansionSum * fitMultiplier

    const expansionScore = normalizeScore(adjustedSum, this.config)

    return {
      score: expansionScore,
      componentScores,
      grade: getGradeDefinition(expansionScore),
    }
  }

  /**
   * Calculate churn risk score
   * Focuses on negative signals indicating retention issues
   */
  calculateChurnRiskScore(signals: Signal[], account: Account): ScoreResult {
    const cutoffDate = getSignalCutoffDate(this.config)
    const relevantSignals = this.filterSignalsByDate(signals, cutoffDate)

    let riskSum = 0.0
    const componentScores: Record<string, number> = {}

    for (const signal of relevantSignals) {
      const signalConfig = getSignalConfig(signal.type, this.config)

      if (signalConfig.category === 'churn_risk') {
        // Use absolute value for churn risk weights
        const weight = Math.abs(signalConfig.weight)
        const decayFactor = calculateRecencyDecay(signal.timestamp, this.config)
        const contribution = weight * decayFactor
        riskSum += contribution

        if (!componentScores[signal.type]) {
          componentScores[signal.type] = 0
        }
        componentScores[signal.type] += contribution
      }
    }

    // Higher fit score means churn is more costly, so multiply
    const fitMultiplier = calculateFitMultiplier(account.fit_score, this.config)
    const adjustedSum = riskSum * fitMultiplier

    const churnRiskScore = normalizeScore(adjustedSum, this.config)

    return {
      score: churnRiskScore,
      componentScores,
      grade: getGradeDefinition(churnRiskScore),
    }
  }

  /**
   * Calculate all score types for an account
   */
  calculateAllScores(signals: Signal[], account: Account): AllScores {
    return {
      health: this.calculateHealthScore(signals, account).score,
      expansion: this.calculateExpansionScore(signals, account).score,
      churn_risk: this.calculateChurnRiskScore(signals, account).score,
    }
  }

  /**
   * Check if scores should trigger opportunities
   */
  shouldTriggerOpportunities(scores: AllScores): {
    expansion: boolean
    churnRisk: boolean
  } {
    return {
      expansion: scores.expansion >= this.config.thresholds.expansion_threshold,
      churnRisk: scores.churn_risk >= this.config.thresholds.churn_risk_threshold,
    }
  }

  /**
   * Generate opportunity summary
   */
  generateOpportunitySummary(
    type: 'expansion' | 'churn_risk',
    score: number,
    signals: Signal[]
  ): OpportunitySummary {
    const gradeDisplay = formatScoreDisplay(score)
    const relevantSignals: string[] = []

    for (const signal of signals.slice(0, 5)) {
      const signalConfig = getSignalConfig(signal.type, this.config)
      if (
        (type === 'expansion' && signalConfig.category === 'expansion') ||
        (type === 'churn_risk' && signalConfig.category === 'churn_risk')
      ) {
        relevantSignals.push(signalConfig.description)
      }
    }

    const recommendation =
      type === 'expansion'
        ? 'Schedule expansion conversation to discuss upgrade options.'
        : 'Immediate intervention required to prevent churn.'

    return {
      type,
      score,
      gradeDisplay,
      signals: relevantSignals.slice(0, 3),
      recommendation,
    }
  }

  /**
   * Calculate estimated opportunity value
   */
  calculateOpportunityValue(account: Account, type: 'expansion' | 'churn_risk'): number {
    const multiplier =
      type === 'expansion'
        ? this.config.opportunity_generation.expansion_value_multiplier
        : this.config.opportunity_generation.churn_risk_value_multiplier

    return account.arr * multiplier
  }

  /**
   * Filter signals by cutoff date
   */
  private filterSignalsByDate(signals: Signal[], cutoffDate: Date): Signal[] {
    return signals.filter((signal) => new Date(signal.timestamp) >= cutoffDate)
  }

  /**
   * Get the current scoring configuration
   */
  getConfig(): ScoringConfig {
    return this.config
  }

  /**
   * Update scoring configuration
   */
  updateConfig(overrides: Partial<ScoringConfig>): void {
    this.config = getScoringConfig(overrides)
  }
}

/**
 * Create a new HeuristicsEngine instance
 */
export function createHeuristicsEngine(options?: HeuristicsEngineOptions): HeuristicsEngine {
  return new HeuristicsEngine(options)
}

/**
 * Convenience function to calculate health score without creating an engine instance
 */
export function calculateHealthScore(
  signals: Signal[],
  account: Account,
  config?: Partial<ScoringConfig>
): ScoreResult {
  const engine = new HeuristicsEngine({ config })
  return engine.calculateHealthScore(signals, account)
}

/**
 * Convenience function to calculate all scores
 */
export function calculateAllScores(
  signals: Signal[],
  account: Account,
  config?: Partial<ScoringConfig>
): AllScores {
  const engine = new HeuristicsEngine({ config })
  return engine.calculateAllScores(signals, account)
}
