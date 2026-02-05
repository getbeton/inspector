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

// Billing enums
export type BillingStatus = 'free' | 'card_required' | 'active' | 'past_due' | 'cancelled'
export type ThresholdNotificationType = 'threshold_90' | 'threshold_95' | 'threshold_exceeded' | 'card_linked' | 'payment_failed' | 'payment_success'
export type BillingEventType = 'mtu_recorded' | 'threshold_reached' | 'card_linked' | 'card_removed' | 'subscription_created' | 'subscription_updated' | 'subscription_cancelled' | 'payment_succeeded' | 'payment_failed' | 'refund_issued' | 'usage_reported' | 'immediate_charge_success' | 'immediate_charge_failed'

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
        Relationships: [
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'accounts_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'account_users_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'account_users_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'signals_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'signals_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'opportunities_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunities_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'heuristic_scores_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'heuristic_scores_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'integration_configs_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'posthog_workspace_config_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'api_keys_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'signal_aggregates_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
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
          last_90_threshold_sent_at: string | null
          last_95_threshold_sent_at: string | null
          last_exceeded_threshold_sent_at: string | null
          card_last_four: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          status?: BillingStatus
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_payment_method_id?: string | null
          free_tier_mtu_limit?: number
          billing_cycle_start?: string | null
          billing_cycle_end?: string | null
          current_cycle_mtu?: number
          peak_mtu_this_cycle?: number
          peak_mtu_date?: string | null
          last_90_threshold_sent_at?: string | null
          last_95_threshold_sent_at?: string | null
          last_exceeded_threshold_sent_at?: string | null
          card_last_four?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          status?: BillingStatus
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_payment_method_id?: string | null
          free_tier_mtu_limit?: number
          billing_cycle_start?: string | null
          billing_cycle_end?: string | null
          current_cycle_mtu?: number
          peak_mtu_this_cycle?: number
          peak_mtu_date?: string | null
          last_90_threshold_sent_at?: string | null
          last_95_threshold_sent_at?: string | null
          last_exceeded_threshold_sent_at?: string | null
          card_last_four?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workspace_billing_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: true
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
      }
      mtu_tracking: {
        Row: {
          id: string
          workspace_id: string
          tracking_date: string
          mtu_count: number
          mtu_by_source: Json
          billing_cycle_start: string | null
          billing_cycle_end: string | null
          cycle_total_mtu: number | null
          reported_to_stripe: boolean
          reported_at: string | null
          stripe_usage_record_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          tracking_date: string
          mtu_count?: number
          mtu_by_source?: Json
          billing_cycle_start?: string | null
          billing_cycle_end?: string | null
          cycle_total_mtu?: number | null
          reported_to_stripe?: boolean
          reported_at?: string | null
          stripe_usage_record_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          tracking_date?: string
          mtu_count?: number
          mtu_by_source?: Json
          billing_cycle_start?: string | null
          billing_cycle_end?: string | null
          cycle_total_mtu?: number | null
          reported_to_stripe?: boolean
          reported_at?: string | null
          stripe_usage_record_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'mtu_tracking_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
      }
      billing_events: {
        Row: {
          id: string
          workspace_id: string | null
          event_type: string
          event_data: Json
          stripe_event_id: string | null
          stripe_object_type: string | null
          stripe_object_id: string | null
          user_id: string | null
          idempotency_key: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          event_type: string
          event_data?: Json
          stripe_event_id?: string | null
          stripe_object_type?: string | null
          stripe_object_id?: string | null
          user_id?: string | null
          idempotency_key?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          event_type?: string
          event_data?: Json
          stripe_event_id?: string | null
          stripe_object_type?: string | null
          stripe_object_id?: string | null
          user_id?: string | null
          idempotency_key?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'billing_events_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
      }
      threshold_notifications: {
        Row: {
          id: string
          workspace_id: string
          notification_type: ThresholdNotificationType
          billing_cycle_start: string
          mtu_at_notification: number | null
          threshold_percentage: number | null
          sent_to_email: string | null
          sent_at: string
          email_provider_id: string | null
          delivery_status: string
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          notification_type: ThresholdNotificationType
          billing_cycle_start: string
          mtu_at_notification?: number | null
          threshold_percentage?: number | null
          sent_to_email?: string | null
          sent_at?: string
          email_provider_id?: string | null
          delivery_status?: string
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          notification_type?: ThresholdNotificationType
          billing_cycle_start?: string
          mtu_at_notification?: number | null
          threshold_percentage?: number | null
          sent_to_email?: string | null
          sent_at?: string
          email_provider_id?: string | null
          delivery_status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'threshold_notifications_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
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
        Insert: {
          id?: string
          workspace_id: string
          table_id: string
          join_suggestions?: Json | null
          metrics_discovery?: Json | null
          table_stats?: Json | null
          summary_text?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          table_id?: string
          join_suggestions?: Json | null
          metrics_discovery?: Json | null
          table_stats?: Json | null
          summary_text?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'eda_results_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
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
        Insert: {
          id?: string
          workspace_id: string
          is_b2b?: boolean | null
          plg_type?: string | null
          website_url?: string | null
          product_assumptions?: Json | null
          icp_description?: string | null
          product_description?: string | null
          pricing_model?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          is_b2b?: boolean | null
          plg_type?: string | null
          website_url?: string | null
          product_assumptions?: Json | null
          icp_description?: string | null
          product_description?: string | null
          pricing_model?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'website_exploration_results_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: true
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
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
        Insert: {
          id?: string
          session_id: string
          workspace_id: string
          status?: string
          agent_app_name?: string
          started_at?: string | null
          completed_at?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          workspace_id?: string
          status?: string
          agent_app_name?: string
          started_at?: string | null
          completed_at?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workspace_agent_sessions_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          }
        ]
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
      billing_status: BillingStatus
      threshold_notification_type: ThresholdNotificationType
      billing_event_type: BillingEventType
      agent_session_status: 'created' | 'running' | 'completed' | 'failed' | 'closed'
    }
  }
}

// Helper types for easier usage
export type Workspace = Database['public']['Tables']['workspaces']['Row']
export type WorkspaceInsert = Database['public']['Tables']['workspaces']['Insert']
export type WorkspaceMember = Database['public']['Tables']['workspace_members']['Row']
export type WorkspaceMemberInsert = Database['public']['Tables']['workspace_members']['Insert']
export type Account = Database['public']['Tables']['accounts']['Row']
export type AccountInsert = Database['public']['Tables']['accounts']['Insert']
export type AccountUpdate = Database['public']['Tables']['accounts']['Update']
export type Signal = Database['public']['Tables']['signals']['Row']
export type SignalInsert = Database['public']['Tables']['signals']['Insert']
export type Opportunity = Database['public']['Tables']['opportunities']['Row']
export type HeuristicScore = Database['public']['Tables']['heuristic_scores']['Row']
export type HeuristicScoreInsert = Database['public']['Tables']['heuristic_scores']['Insert']
export type IntegrationConfig = Database['public']['Tables']['integration_configs']['Row']
export type IntegrationConfigInsert = Database['public']['Tables']['integration_configs']['Insert']
export type IntegrationConfigUpdate = Database['public']['Tables']['integration_configs']['Update']
export type PosthogWorkspaceConfig = Database['public']['Tables']['posthog_workspace_config']['Row']
export type ApiKey = Database['public']['Tables']['api_keys']['Row']
export type ApiKeyInsert = Database['public']['Tables']['api_keys']['Insert']
export type SignalAggregate = Database['public']['Tables']['signal_aggregates']['Row']

// Billing types
export type WorkspaceBilling = Database['public']['Tables']['workspace_billing']['Row']
export type WorkspaceBillingInsert = Database['public']['Tables']['workspace_billing']['Insert']
export type WorkspaceBillingUpdate = Database['public']['Tables']['workspace_billing']['Update']
export type MtuTracking = Database['public']['Tables']['mtu_tracking']['Row']
export type MtuTrackingInsert = Database['public']['Tables']['mtu_tracking']['Insert']
export type BillingEvent = Database['public']['Tables']['billing_events']['Row']
export type BillingEventInsert = Database['public']['Tables']['billing_events']['Insert']
export type ThresholdNotification = Database['public']['Tables']['threshold_notifications']['Row']
export type ThresholdNotificationInsert = Database['public']['Tables']['threshold_notifications']['Insert']

// Function return types
export type HealthScoreResult = Database['public']['Functions']['calculate_health_score']['Returns'][0]
export type ExpansionScoreResult = Database['public']['Functions']['calculate_expansion_score']['Returns'][0]
export type ChurnRiskResult = Database['public']['Functions']['calculate_churn_risk_score']['Returns'][0]
export type DashboardMetricsResult = Database['public']['Functions']['get_dashboard_metrics']['Returns'][0]
export type SignalTypesSummaryResult = Database['public']['Functions']['get_signal_types_summary']['Returns'][0]
export type ConcreteGradeResult = Database['public']['Functions']['get_concrete_grade']['Returns'][0]
