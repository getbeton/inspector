/**
 * Concrete quality grading system
 * Uses standard concrete compressive strength grade nomenclature (M-grade)
 * as a pun on "Beton" (French for concrete)
 */

import type { ConcreteGrade, ConcreteGradeDisplay } from './types'

/**
 * All concrete grade definitions
 */
export const CONCRETE_GRADES: ConcreteGrade[] = [
  {
    grade: 'M100',
    label: 'Premium Grade',
    minScore: 80,
    maxScore: 100,
    emoji: '🏗️',
    color: '#10b981',
    description: 'Exceptional account health. High engagement, strong fit, expansion ready.',
  },
  {
    grade: 'M75',
    label: 'Good Quality',
    minScore: 60,
    maxScore: 79,
    emoji: '✅',
    color: '#3b82f6',
    description: 'Healthy account. Solid engagement and potential for growth.',
  },
  {
    grade: 'M50',
    label: 'Standard',
    minScore: 40,
    maxScore: 59,
    emoji: '⚠️',
    color: '#f59e0b',
    description: 'Moderate health. Account is stable but could use attention.',
  },
  {
    grade: 'M25',
    label: 'Below Standard',
    minScore: 20,
    maxScore: 39,
    emoji: '⚡',
    color: '#ef4444',
    description: 'At risk. Account showing warning signs, needs intervention.',
  },
  {
    grade: 'M10',
    label: 'Poor Quality',
    minScore: 0,
    maxScore: 19,
    emoji: '🚧',
    color: '#991b1b',
    description: 'Critical condition. High churn risk, immediate action required.',
  },
]

/**
 * Convert numerical score (0-100) to concrete quality grade
 */
export function getConcreteGrade(score: number): string {
  if (score >= 80) return 'M100'
  if (score >= 60) return 'M75'
  if (score >= 40) return 'M50'
  if (score >= 20) return 'M25'
  return 'M10'
}

/**
 * Get descriptive label for concrete grade
 */
export function getGradeLabel(score: number): string {
  if (score >= 80) return 'Premium Grade'
  if (score >= 60) return 'Good Quality'
  if (score >= 40) return 'Standard'
  if (score >= 20) return 'Below Standard'
  return 'Poor Quality'
}

/**
 * Get emoji representing concrete grade quality
 */
export function getGradeEmoji(score: number): string {
  if (score >= 80) return '🏗️'
  if (score >= 60) return '✅'
  if (score >= 40) return '⚠️'
  if (score >= 20) return '⚡'
  return '🚧'
}

/**
 * Get color code for concrete grade display
 */
export function getGradeColor(score: number): string {
  if (score >= 80) return '#10b981' // Green (premium)
  if (score >= 60) return '#3b82f6' // Blue (good)
  if (score >= 40) return '#f59e0b' // Amber (standard)
  if (score >= 20) return '#ef4444' // Red (below standard)
  return '#991b1b' // Dark red (poor)
}

/**
 * Get detailed description of what the grade means
 */
export function getGradeDescription(score: number): string {
  if (score >= 80) {
    return 'Premium grade concrete - exceptional account health. High engagement, strong fit, expansion ready.'
  }
  if (score >= 60) {
    return 'Good quality concrete - healthy account. Solid engagement and potential for growth.'
  }
  if (score >= 40) {
    return 'Standard grade concrete - moderate health. Account is stable but could use attention.'
  }
  if (score >= 20) {
    return 'Below standard concrete - at risk. Account showing warning signs, needs intervention.'
  }
  return 'Poor quality concrete - critical condition. High churn risk, immediate action required.'
}

/**
 * Format score for display with concrete grading theme
 */
export function formatScoreDisplay(score: number, includeEmoji = true): ConcreteGradeDisplay {
  const grade = getConcreteGrade(score)
  const label = getGradeLabel(score)
  const emoji = includeEmoji ? getGradeEmoji(score) : ''
  const color = getGradeColor(score)

  return {
    score: Math.round(score * 10) / 10,
    grade,
    label,
    emoji,
    color,
    display: includeEmoji ? `${emoji} ${grade} - ${label}` : `${grade} - ${label}`,
    short: includeEmoji ? `${emoji} ${grade}` : grade,
  }
}

/**
 * Get the full grade definition for a score
 */
export function getGradeDefinition(score: number): ConcreteGrade {
  const grade = CONCRETE_GRADES.find(
    (g) => score >= g.minScore && score <= g.maxScore
  )
  return grade || CONCRETE_GRADES[CONCRETE_GRADES.length - 1]
}

/**
 * Get all concrete grade definitions
 */
export function getAllGrades(): ConcreteGrade[] {
  return [...CONCRETE_GRADES]
}
