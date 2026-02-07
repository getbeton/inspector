/**
 * Heuristics Engine
 *
 * Scoring and signal processing for account health, expansion, and churn risk.
 * Uses concrete grading theme (M100, M75, M50, M25, M10) as a pun on "Beton".
 */

// Types
export * from './types'

// Concrete grades
export {
  CONCRETE_GRADES,
  getConcreteGrade,
  getGradeLabel,
  getGradeEmoji,
  getGradeColor,
  getGradeDescription,
  formatScoreDisplay,
  getGradeDefinition,
  getAllGrades,
} from './concrete-grades'

// Utility functions
export {
  calculateRecencyDecay,
  calculateFitMultiplier,
  clampScore,
  normalizeScore,
  matchesTitlePattern,
  calculatePercentageChange,
  isDirectorLevel,
  getSignalCutoffDate,
  getScoreValidUntil,
} from './utils'

// Scoring configuration
export { DEFAULT_SCORING_CONFIG, getScoringConfig, getSignalConfig } from './scoring-config'

// Engine
export {
  HeuristicsEngine,
  createHeuristicsEngine,
  calculateHealthScore,
  calculateAllScores,
  type HeuristicsEngineOptions,
} from './engine'
