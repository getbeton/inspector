/**
 * Default scoring configuration
 * Can be overridden with workspace-specific settings from database
 */

import type { ScoringConfig } from './types'

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  scoring: {
    scale_min: 0,
    scale_max: 100,
    recency_decay_days: 30,
  },

  fit_multipliers: {
    icp_match: 1.5, // 50% boost for ICP match (fit >= 0.8)
    near_icp: 1.0, // No boost for near ICP (0.5-0.8)
    poor_fit: 0.5, // 50% penalty for poor fit (< 0.5)
  },

  thresholds: {
    expansion_threshold: 70, // Score above this triggers expansion opportunity
    churn_risk_threshold: 30, // Risk score above this triggers churn alert
  },

  signal_processing: {
    max_signal_age_days: 90, // Signals older than this are ignored
    recalculation_frequency_hours: 24, // How often to recalculate scores
  },

  opportunity_generation: {
    opportunity_cooldown_days: 30, // Don't create duplicate opportunities within this period
    expansion_value_multiplier: 0.3, // Expansion value = ARR * 30%
    churn_risk_value_multiplier: 1.0, // At-risk value = full ARR
  },

  signals: {
    // Expansion signals (positive)
    usage_spike: {
      weight: 15,
      category: 'expansion',
      description: 'Significant increase in product usage',
    },
    nearing_paywall: {
      weight: 20,
      category: 'expansion',
      description: 'Approaching usage limits on current plan',
    },
    director_signup: {
      weight: 25,
      category: 'expansion',
      description: 'Director-level or above signed up',
    },
    invites_sent: {
      weight: 10,
      category: 'expansion',
      description: 'User invited new team members',
    },
    new_department: {
      weight: 18,
      category: 'expansion',
      description: 'Usage spreading to new department',
    },
    high_nps: {
      weight: 12,
      category: 'expansion',
      description: 'High NPS score (promoter)',
    },
    upgrade_page_visit: {
      weight: 15,
      category: 'expansion',
      description: 'Visited pricing/upgrade page',
    },
    approaching_seat_limit: {
      weight: 18,
      category: 'expansion',
      description: 'Near seat limit on current plan',
    },
    overage: {
      weight: 22,
      category: 'expansion',
      description: 'Usage overage detected',
    },

    // Churn risk signals (negative)
    usage_drop: {
      weight: -20,
      category: 'churn_risk',
      description: 'Significant decrease in product usage',
    },
    low_nps: {
      weight: -15,
      category: 'churn_risk',
      description: 'Low NPS score (detractor)',
    },
    inactivity: {
      weight: -25,
      category: 'churn_risk',
      description: 'Extended period of no activity',
    },
    usage_wow_decline: {
      weight: -12,
      category: 'churn_risk',
      description: 'Week-over-week usage decline',
    },
    trial_ending: {
      weight: -10,
      category: 'churn_risk',
      description: 'Trial period ending soon',
    },
    health_score_decrease: {
      weight: -15,
      category: 'churn_risk',
      description: 'Health score dropped significantly',
    },
    arr_decrease: {
      weight: -18,
      category: 'churn_risk',
      description: 'ARR decreased (downgrade)',
    },
    incomplete_onboarding: {
      weight: -8,
      category: 'churn_risk',
      description: 'Onboarding not completed',
    },
    future_cancellation: {
      weight: -30,
      category: 'churn_risk',
      description: 'Cancellation scheduled',
    },

    // Neutral/context signals
    upcoming_renewal: {
      weight: 5,
      category: 'neutral',
      description: 'Contract renewal approaching',
    },
    free_decision_maker: {
      weight: 8,
      category: 'neutral',
      description: 'Decision maker on free plan',
    },
  },
}

/**
 * Get scoring config, optionally merging with custom overrides
 */
export function getScoringConfig(overrides?: Partial<ScoringConfig>): ScoringConfig {
  if (!overrides) {
    return DEFAULT_SCORING_CONFIG
  }

  return {
    ...DEFAULT_SCORING_CONFIG,
    ...overrides,
    scoring: {
      ...DEFAULT_SCORING_CONFIG.scoring,
      ...(overrides.scoring || {}),
    },
    fit_multipliers: {
      ...DEFAULT_SCORING_CONFIG.fit_multipliers,
      ...(overrides.fit_multipliers || {}),
    },
    thresholds: {
      ...DEFAULT_SCORING_CONFIG.thresholds,
      ...(overrides.thresholds || {}),
    },
    signal_processing: {
      ...DEFAULT_SCORING_CONFIG.signal_processing,
      ...(overrides.signal_processing || {}),
    },
    opportunity_generation: {
      ...DEFAULT_SCORING_CONFIG.opportunity_generation,
      ...(overrides.opportunity_generation || {}),
    },
    signals: {
      ...DEFAULT_SCORING_CONFIG.signals,
      ...(overrides.signals || {}),
    },
  }
}

/**
 * Get the signal config for a specific signal type
 */
export function getSignalConfig(signalType: string, config?: ScoringConfig) {
  const scoringConfig = config || DEFAULT_SCORING_CONFIG
  return (
    scoringConfig.signals[signalType] || {
      weight: 0,
      category: 'neutral' as const,
      description: signalType,
    }
  )
}
