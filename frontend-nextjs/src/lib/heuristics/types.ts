/**
 * Types for the heuristics scoring engine
 */

export interface Signal {
  id: string
  account_id: string
  workspace_id: string
  type: string
  value: number | null
  details: Record<string, unknown>
  timestamp: string
  source: string | null
}

export interface Account {
  id: string
  workspace_id: string
  name: string | null
  domain: string | null
  arr: number
  plan: string
  status: 'active' | 'churned' | 'trial'
  health_score: number
  fit_score: number
  last_activity_at: string | null
}

export interface HeuristicScore {
  id: string
  account_id: string
  workspace_id: string
  score_type: 'health' | 'expansion' | 'churn_risk'
  score_value: number
  component_scores: Record<string, number>
  calculated_at: string
  valid_until: string | null
}

export interface ScoreResult {
  score: number
  componentScores: Record<string, number>
  grade: ConcreteGrade
}

export interface AllScores {
  health: number
  expansion: number
  churn_risk: number
}

export interface ScoreBreakdown {
  accountId: string
  scoreType: string
  scoreValue: number
  concreteGrade: ConcreteGradeDisplay
  componentScores: Record<string, number>
  calculatedAt: string
  validUntil: string | null
}

export interface ConcreteGrade {
  grade: string
  label: string
  minScore: number
  maxScore: number
  emoji: string
  color: string
  description: string
}

export interface ConcreteGradeDisplay {
  score: number
  grade: string
  label: string
  emoji: string
  color: string
  display: string
  short: string
}

export interface SignalConfig {
  weight: number
  category: 'expansion' | 'churn_risk' | 'health' | 'neutral'
  description: string
}

export interface ScoringConfig {
  scoring: {
    scale_min: number
    scale_max: number
    recency_decay_days: number
  }
  fit_multipliers: {
    icp_match: number
    near_icp: number
    poor_fit: number
  }
  thresholds: {
    expansion_threshold: number
    churn_risk_threshold: number
  }
  signal_processing: {
    max_signal_age_days: number
    recalculation_frequency_hours: number
  }
  opportunity_generation: {
    opportunity_cooldown_days: number
    expansion_value_multiplier: number
    churn_risk_value_multiplier: number
  }
  signals: Record<string, SignalConfig>
}

export interface OpportunitySummary {
  type: 'expansion' | 'churn_risk'
  score: number
  gradeDisplay: ConcreteGradeDisplay
  signals: string[]
  recommendation: string
}
