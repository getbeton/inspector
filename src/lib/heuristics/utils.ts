/**
 * Utility functions for heuristics scoring
 */

import type { ScoringConfig } from './types'

/**
 * Calculate recency decay factor for a signal based on its age.
 * Older signals have less weight to reflect current state.
 *
 * Formula: decay = exp(-age_days / decay_days * ln(2))
 * This creates a half-life decay where signals lose 50% weight after decay_days.
 */
export function calculateRecencyDecay(timestamp: Date | string, config: ScoringConfig): number {
  const signalDate = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  const now = new Date()
  const ageDays = Math.floor((now.getTime() - signalDate.getTime()) / (1000 * 60 * 60 * 24))
  const decayDays = config.scoring.recency_decay_days

  // Half-life exponential decay
  const decay = Math.exp((-ageDays / decayDays) * Math.log(2))

  return Math.max(0.0, Math.min(1.0, decay))
}

/**
 * Convert ICP fit score (0-1) to scoring multiplier.
 */
export function calculateFitMultiplier(fitScore: number, config: ScoringConfig): number {
  const multipliers = config.fit_multipliers

  if (fitScore >= 0.8) {
    return multipliers.icp_match
  }
  if (fitScore >= 0.5) {
    return multipliers.near_icp
  }
  return multipliers.poor_fit
}

/**
 * Clamp score to configured min/max range.
 */
export function clampScore(score: number, config: ScoringConfig): number {
  const minScore = config.scoring.scale_min
  const maxScore = config.scoring.scale_max

  return Math.max(minScore, Math.min(maxScore, score))
}

/**
 * Normalize a raw score to the configured scale (default 0-100).
 *
 * Maps raw scores (can be negative) to the scale using tanh for smooth clamping.
 */
export function normalizeScore(rawScore: number, config: ScoringConfig): number {
  const scaleMax = config.scoring.scale_max
  const scaleMin = config.scoring.scale_min

  // Map raw score to scale
  // Assume raw scores typically range from -100 to +100
  // Map 0 to middle of scale, positive scores above, negative below
  const midPoint = (scaleMax + scaleMin) / 2
  const scaleRange = scaleMax - scaleMin

  // Sigmoid-like normalization using tanh
  const normalized = midPoint + (scaleRange / 2) * Math.tanh(rawScore / 100)

  return clampScore(normalized, config)
}

/**
 * Check if a user title matches any of the given patterns.
 */
export function matchesTitlePattern(title: string | null | undefined, patterns: string[]): boolean {
  if (!title) return false

  const titleLower = title.toLowerCase()
  return patterns.some((pattern) => titleLower.includes(pattern.toLowerCase()))
}

/**
 * Calculate percentage change between two values.
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) {
    return newValue > 0 ? 1.0 : 0.0
  }

  return (newValue - oldValue) / oldValue
}

/**
 * Check if a title indicates director level or above.
 */
export function isDirectorLevel(title: string | null | undefined): boolean {
  const directorPatterns = [
    'director',
    'vp',
    'vice president',
    'head of',
    'chief',
    'c-level',
    'cto',
    'ceo',
    'cfo',
    'coo',
    'cmo',
    'svp',
    'senior vice president',
    'evp',
    'executive vp',
  ]

  return matchesTitlePattern(title, directorPatterns)
}

/**
 * Get the cutoff date for signal processing based on config.
 */
export function getSignalCutoffDate(config: ScoringConfig): Date {
  const maxAgeDays = config.signal_processing.max_signal_age_days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - maxAgeDays)
  return cutoff
}

/**
 * Calculate validity end time for a score.
 */
export function getScoreValidUntil(config: ScoringConfig): Date {
  const validityHours = config.signal_processing.recalculation_frequency_hours
  const validUntil = new Date()
  validUntil.setHours(validUntil.getHours() + validityHours)
  return validUntil
}
