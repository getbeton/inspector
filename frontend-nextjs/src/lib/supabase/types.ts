/**
 * Database types generated from Supabase schema
 * These types correspond to the tables defined in supabase/migrations/
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

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
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
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          billing_cycle_start?: string | null
          next_billing_date?: string | null
          created_at?: string
          updated_at?: string
        }
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
      }
      account_users: {
        Row: {
          id: string
          workspace_id: string
          account_id: string
          email: string | null
          name: string | null
          role: string | null
          title: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          account_id: string
          email?: string | null
          name?: string | null
          role?: string | null
          title?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          account_id?: string
          email?: string | null
          name?: string | null
          role?: string | null
          title?: string | null
          created_at?: string
        }
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
      }
      opportunities: {
        Row: {
          id: string
          workspace_id: string
          account_id: string
          stage: OpportunityStage
          value: number
          ai_summary: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          account_id: string
          stage?: OpportunityStage
          value?: number
          ai_summary?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          account_id?: string
          stage?: OpportunityStage
          value?: number
          ai_summary?: string | null
          created_at?: string
          updated_at?: string
        }
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
      }
      integration_configs: {
        Row: {
          id: string
          workspace_id: string
          integration_name: string
          api_key_encrypted: string
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
          config_json?: Json
          status?: IntegrationStatus
          last_validated_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      posthog_workspace_config: {
        Row: {
          id: string
          workspace_id: string
          posthog_api_key: string
          posthog_workspace_name: string | null
          posthog_project_id: string
          is_validated: boolean
          validated_at: string | null
          validation_error: string | null
          last_sync: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          posthog_api_key: string
          posthog_workspace_name?: string | null
          posthog_project_id: string
          is_validated?: boolean
          validated_at?: string | null
          validation_error?: string | null
          last_sync?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          posthog_api_key?: string
          posthog_workspace_name?: string | null
          posthog_project_id?: string
          is_validated?: boolean
          validated_at?: string | null
          validation_error?: string | null
          last_sync?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
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
        Insert: {
          id?: string
          workspace_id: string
          signal_type: string
          total_count?: number
          count_last_7d?: number
          count_last_30d?: number
          avg_precision?: number | null
          avg_recall?: number | null
          avg_f1_score?: number | null
          avg_lift?: number | null
          avg_conversion_rate?: number | null
          confidence_score?: number | null
          quality_grade?: string | null
          total_arr_influenced?: number
          avg_deal_size?: number | null
          win_rate?: number | null
          avg_days_to_close?: number | null
          last_calculated_at?: string | null
          calculation_window_days?: number
          sample_size?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          signal_type?: string
          total_count?: number
          count_last_7d?: number
          count_last_30d?: number
          avg_precision?: number | null
          avg_recall?: number | null
          avg_f1_score?: number | null
          avg_lift?: number | null
          avg_conversion_rate?: number | null
          confidence_score?: number | null
          quality_grade?: string | null
          total_arr_influenced?: number
          avg_deal_size?: number | null
          win_rate?: number | null
          avg_days_to_close?: number | null
          last_calculated_at?: string | null
          calculation_window_days?: number
          sample_size?: number | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_workspaces: {
        Args: Record<string, never>
        Returns: string[]
      }
      has_workspace_access: {
        Args: {
          workspace_uuid: string
        }
        Returns: boolean
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
      get_signal_types_summary: {
        Args: {
          p_workspace_id: string
          p_lookback_days?: number
        }
        Returns: {
          signal_type: string
          count: number
          avg_value: number
          latest_at: string
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
      opportunity_stage: OpportunityStage
      integration_status: IntegrationStatus
      stat_test_status: StatTestStatus
    }
  }
}

// Helper types for easier usage
export type Workspace = Database['public']['Tables']['workspaces']['Row']
export type WorkspaceInsert = Database['public']['Tables']['workspaces']['Insert']
export type WorkspaceMember = Database['public']['Tables']['workspace_members']['Row']
export type Account = Database['public']['Tables']['accounts']['Row']
export type AccountInsert = Database['public']['Tables']['accounts']['Insert']
export type Signal = Database['public']['Tables']['signals']['Row']
export type SignalInsert = Database['public']['Tables']['signals']['Insert']
export type Opportunity = Database['public']['Tables']['opportunities']['Row']
export type HeuristicScore = Database['public']['Tables']['heuristic_scores']['Row']
export type IntegrationConfig = Database['public']['Tables']['integration_configs']['Row']
export type PosthogWorkspaceConfig = Database['public']['Tables']['posthog_workspace_config']['Row']
export type ApiKey = Database['public']['Tables']['api_keys']['Row']
export type SignalAggregate = Database['public']['Tables']['signal_aggregates']['Row']
