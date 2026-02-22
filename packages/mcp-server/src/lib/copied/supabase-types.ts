/**
 * Database types — copied from src/lib/supabase/types.ts
 * Keep in sync with the main app's generated types.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type AccountStatus = 'active' | 'churned' | 'trial'
export type OpportunityStage = 'detected' | 'qualified' | 'in_progress' | 'closed_won' | 'closed_lost'
export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'validating'
export type StatTestStatus = 'pending' | 'running' | 'completed' | 'failed'
export type BillingStatus = 'free' | 'card_required' | 'active' | 'past_due' | 'cancelled'

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
          website_url: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          billing_cycle_start: string | null
          next_billing_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          website_url?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          billing_cycle_start?: string | null
          next_billing_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          website_url?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          billing_cycle_start?: string | null
          next_billing_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          workspace_id: string
          user_id: string
          role: string
          joined_at: string
        }
        Insert: {
          workspace_id: string
          user_id: string
          role?: string
          joined_at?: string
        }
        Update: {
          workspace_id?: string
          user_id?: string
          role?: string
          joined_at?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          id: string
          workspace_id: string
          name: string | null
          domain: string | null
          arr: number
          plan: string
          status: AccountStatus
          health_score: number
          fit_score: number
          last_activity_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name?: string | null
          domain?: string | null
          arr?: number
          plan?: string
          status?: AccountStatus
          health_score?: number
          fit_score?: number
          last_activity_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string | null
          domain?: string | null
          arr?: number
          plan?: string
          status?: AccountStatus
          health_score?: number
          fit_score?: number
          last_activity_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          id: string
          workspace_id: string
          account_id: string
          type: string
          value: number | null
          details: Json
          timestamp: string
          source: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          account_id: string
          type: string
          value?: number | null
          details?: Json
          timestamp?: string
          source?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          account_id?: string
          type?: string
          value?: number | null
          details?: Json
          timestamp?: string
          source?: string | null
          created_at?: string
        }
        Relationships: []
      }
      heuristic_scores: {
        Row: {
          id: string
          workspace_id: string
          account_id: string
          score_type: string
          score_value: number
          component_scores: Json | null
          calculated_at: string
          valid_until: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          account_id: string
          score_type: string
          score_value: number
          component_scores?: Json | null
          calculated_at?: string
          valid_until?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          account_id?: string
          score_type?: string
          score_value?: number
          component_scores?: Json | null
          calculated_at?: string
          valid_until?: string | null
          created_at?: string
        }
        Relationships: []
      }
      integration_configs: {
        Row: {
          id: string
          workspace_id: string
          integration_name: string
          api_key_encrypted: string
          project_id_encrypted: string | null
          config_json: Json
          status: IntegrationStatus
          last_validated_at: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          integration_name: string
          api_key_encrypted: string
          project_id_encrypted?: string | null
          config_json?: Json
          status?: IntegrationStatus
          last_validated_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          integration_name?: string
          api_key_encrypted?: string
          project_id_encrypted?: string | null
          config_json?: Json
          status?: IntegrationStatus
          last_validated_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          key_hash: string
          name: string
          last_used_at: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          key_hash: string
          name?: string
          last_used_at?: string | null
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          user_id?: string
          key_hash?: string
          name?: string
          last_used_at?: string | null
          expires_at?: string
          created_at?: string
        }
        Relationships: []
      }
      signal_aggregates: {
        Row: {
          id: string
          workspace_id: string
          signal_type: string
          total_count: number
          count_last_7d: number
          count_last_30d: number
          avg_precision: number | null
          avg_recall: number | null
          avg_f1_score: number | null
          avg_lift: number | null
          avg_conversion_rate: number | null
          confidence_score: number | null
          quality_grade: string | null
          total_arr_influenced: number
          avg_deal_size: number | null
          win_rate: number | null
          avg_days_to_close: number | null
          last_calculated_at: string | null
          calculation_window_days: number
          sample_size: number | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
      workspace_billing: {
        Row: {
          id: string
          workspace_id: string
          status: BillingStatus
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          stripe_payment_method_id: string | null
          free_tier_mtu_limit: number
          billing_cycle_start: string | null
          billing_cycle_end: string | null
          current_cycle_mtu: number
          peak_mtu_this_cycle: number
          peak_mtu_date: string | null
          card_last_four: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
      eda_results: {
        Row: {
          id: string
          workspace_id: string
          table_id: string
          join_suggestions: Json | null
          metrics_discovery: Json | null
          table_stats: Json | null
          summary_text: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
      website_exploration_results: {
        Row: {
          id: string
          workspace_id: string
          is_b2b: boolean | null
          plg_type: string | null
          website_url: string | null
          product_assumptions: Json | null
          icp_description: string | null
          product_description: string | null
          pricing_model: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
      workspace_agent_sessions: {
        Row: {
          id: string
          session_id: string
          workspace_id: string
          status: string
          agent_app_name: string
          started_at: string | null
          completed_at: string | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_dashboard_metrics: {
        Args: {
          p_workspace_id: string
          p_lookback_days?: number
        }
        Returns: {
          total_accounts: number
          active_accounts: number
          total_signals: number
          signals_this_period: number
          avg_health_score: number
          total_arr: number
          expansion_opportunities: number
          churn_risks: number
        }[]
      }
      calculate_health_score: {
        Args: {
          p_account_id: string
          p_workspace_id: string
          p_lookback_days?: number
        }
        Returns: {
          score: number
          component_scores: Json
          signal_count: number
        }[]
      }
      calculate_expansion_score: {
        Args: {
          p_account_id: string
          p_workspace_id: string
          p_lookback_days?: number
        }
        Returns: {
          score: number
          expansion_signals: Json
        }[]
      }
      calculate_churn_risk_score: {
        Args: {
          p_account_id: string
          p_workspace_id: string
          p_lookback_days?: number
        }
        Returns: {
          score: number
          risk_signals: Json
        }[]
      }
      get_concrete_grade: {
        Args: {
          p_score: number
        }
        Returns: {
          grade: string
          label: string
          color: string
        }[]
      }
    }
    Enums: {
      account_status: AccountStatus
      integration_status: IntegrationStatus
    }
  }
}

// Helper types
export type Workspace = Database['public']['Tables']['workspaces']['Row']
export type Account = Database['public']['Tables']['accounts']['Row']
export type Signal = Database['public']['Tables']['signals']['Row']
export type IntegrationConfig = Database['public']['Tables']['integration_configs']['Row']
export type HeuristicScore = Database['public']['Tables']['heuristic_scores']['Row']
export type SignalAggregate = Database['public']['Tables']['signal_aggregates']['Row']
export type WorkspaceBilling = Database['public']['Tables']['workspace_billing']['Row']
