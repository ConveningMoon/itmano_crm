// GENERADO — no editar a mano. Se regenera con `npm run types:db`.
//
// Correrlo DESPUÉS de cada migración que cambie columnas: este archivo es el
// espejo del esquema real y lo que hace que `columns()` pueda validar los
// .select() (ver src/lib/supabase/columns.ts para el porqué).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acquisition_channels: {
        Row: {
          active: boolean
          agent_id: string | null
          archived_at: string | null
          channel_type: string
          created_at: string
          email_sequence_id: string | null
          hosted_page: Json | null
          id: string
          metadata: Json
          name: string
          public_id: string
          slug: string
          tenant_id: string
        }
        Insert: {
          active?: boolean
          agent_id?: string | null
          archived_at?: string | null
          channel_type: string
          created_at?: string
          email_sequence_id?: string | null
          hosted_page?: Json | null
          id?: string
          metadata?: Json
          name: string
          public_id: string
          slug: string
          tenant_id: string
        }
        Update: {
          active?: boolean
          agent_id?: string | null
          archived_at?: string | null
          channel_type?: string
          created_at?: string
          email_sequence_id?: string | null
          hosted_page?: Json | null
          id?: string
          metadata?: Json
          name?: string
          public_id?: string
          slug?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acquisition_channels_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acquisition_channels_email_sequence_id_fkey"
            columns: ["email_sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acquisition_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          accent_color: string
          active: boolean
          avatar_initials: string
          cover_photo_cutout: boolean
          cover_photo_url: string | null
          created_at: string | null
          description: string | null
          email: string
          email_signature: string | null
          id: string
          language: string
          languages: string[]
          name: string
          phone: string | null
          specialty: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          accent_color: string
          active?: boolean
          avatar_initials: string
          cover_photo_cutout?: boolean
          cover_photo_url?: string | null
          created_at?: string | null
          description?: string | null
          email: string
          email_signature?: string | null
          id: string
          language: string
          languages: string[]
          name: string
          phone?: string | null
          specialty?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          accent_color?: string
          active?: boolean
          avatar_initials?: string
          cover_photo_cutout?: boolean
          cover_photo_url?: string | null
          created_at?: string | null
          description?: string | null
          email?: string
          email_signature?: string | null
          id?: string
          language?: string
          languages?: string[]
          name?: string
          phone?: string | null
          specialty?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_briefings: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          lead_id: string
          next_action: string | null
          next_action_when: string | null
          read: string | null
          reason: string | null
          score_at: number | null
          status_at: string | null
          talking_points: Json
          tenant_id: string
          watch_out: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          next_action?: string | null
          next_action_when?: string | null
          read?: string | null
          reason?: string | null
          score_at?: number | null
          status_at?: string | null
          talking_points?: Json
          tenant_id: string
          watch_out?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          next_action?: string | null
          next_action_when?: string | null
          read?: string | null
          reason?: string | null
          score_at?: number | null
          status_at?: string | null
          talking_points?: Json
          tenant_id?: string
          watch_out?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_briefings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_briefings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_briefings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_briefings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          agent_id: string | null
          cache_creation_tokens: number
          cache_read_tokens: number
          cost_usd: number
          created_at: string
          feature: string
          id: string
          input_tokens: number
          metadata: Json | null
          model: string
          output_tokens: number
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          cache_creation_tokens?: number
          cache_read_tokens?: number
          cost_usd?: number
          created_at?: string
          feature: string
          id?: string
          input_tokens?: number
          metadata?: Json | null
          model: string
          output_tokens?: number
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          cache_creation_tokens?: number
          cache_read_tokens?: number
          cost_usd?: number
          created_at?: string
          feature?: string
          id?: string
          input_tokens?: number
          metadata?: Json | null
          model?: string
          output_tokens?: number
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_page_views: {
        Row: {
          channel_id: string
          created_at: string
          edition_id: string | null
          id: string
          tenant_id: string
          traffic_source: string | null
          utm_data: Json
          visitor_fingerprint: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          edition_id?: string | null
          id?: string
          tenant_id: string
          traffic_source?: string | null
          utm_data?: Json
          visitor_fingerprint: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          edition_id?: string | null
          id?: string
          tenant_id?: string
          traffic_source?: string | null
          utm_data?: Json
          visitor_fingerprint?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_page_views_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "acquisition_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_page_views_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "newsletter_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_page_views_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sends: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          resend_email_id: string
          resend_template_id: string | null
          send_type: string
          sent_at: string
          sequence_run_id: string | null
          step_order: number | null
          subject: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          resend_email_id: string
          resend_template_id?: string | null
          send_type?: string
          sent_at?: string
          sequence_run_id?: string | null
          step_order?: number | null
          subject?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          resend_email_id?: string
          resend_template_id?: string | null
          send_type?: string
          sent_at?: string
          sequence_run_id?: string | null
          step_order?: number | null
          subject?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_sequence_run_id_fkey"
            columns: ["sequence_run_id"]
            isOneToOne: false
            referencedRelation: "lead_sequence_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_steps: {
        Row: {
          active: boolean
          body_html: string | null
          body_json: Json | null
          delay_hours: number
          id: string
          resend_template_id: string | null
          sequence_id: string
          step_order: number
          subject: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          body_html?: string | null
          body_json?: Json | null
          delay_hours?: number
          id?: string
          resend_template_id?: string | null
          sequence_id: string
          step_order: number
          subject?: string | null
          tenant_id: string
        }
        Update: {
          active?: boolean
          body_html?: string | null
          body_json?: Json | null
          delay_hours?: number
          id?: string
          resend_template_id?: string | null
          sequence_id?: string
          step_order?: number
          subject?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequences: {
        Row: {
          activation_type: string
          active: boolean
          agent_id: string | null
          created_at: string
          description: string | null
          id: string
          language: string
          name: string
          tenant_id: string
        }
        Insert: {
          activation_type?: string
          active?: boolean
          agent_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          language?: string
          name: string
          tenant_id: string
        }
        Update: {
          activation_type?: string
          active?: boolean
          agent_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          language?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequences_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          answers: Json
          channel_id: string
          created_at: string
          id: string
          lead_id: string
          responded: boolean
          responded_at: string | null
          submitted_at: string
          tenant_id: string
        }
        Insert: {
          answers?: Json
          channel_id: string
          created_at?: string
          id?: string
          lead_id: string
          responded?: boolean
          responded_at?: string | null
          submitted_at?: string
          tenant_id: string
        }
        Update: {
          answers?: Json
          channel_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          responded?: boolean
          responded_at?: string | null
          submitted_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "acquisition_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          agent_id: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          role: string
          status: string
          tenant_id: string
        }
        Insert: {
          accepted_at?: string | null
          agent_id?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role: string
          status?: string
          tenant_id: string
        }
        Update: {
          accepted_at?: string | null
          agent_id?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_email_replies: {
        Row: {
          body_text: string | null
          created_at: string
          from_email: string
          id: string
          lead_id: string
          provider_message_id: string | null
          received_at: string
          subject: string | null
          tenant_id: string
        }
        Insert: {
          body_text?: string | null
          created_at?: string
          from_email: string
          id?: string
          lead_id: string
          provider_message_id?: string | null
          received_at: string
          subject?: string | null
          tenant_id: string
        }
        Update: {
          body_text?: string | null
          created_at?: string
          from_email?: string
          id?: string
          lead_id?: string
          provider_message_id?: string | null
          received_at?: string
          subject?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_email_replies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_email_replies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_email_replies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          actor_user_id: string | null
          created_at: string | null
          dedup_key: string | null
          description: string
          id: string
          lead_id: string
          metadata: Json | null
          points: number | null
          tenant_id: string
          type: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string | null
          dedup_key?: string | null
          description: string
          id?: string
          lead_id: string
          metadata?: Json | null
          points?: number | null
          tenant_id: string
          type: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string | null
          dedup_key?: string | null
          description?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          points?: number | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_score_rules: {
        Row: {
          category: string
          decays: boolean
          dimension: string
          event_type: string | null
          id: string
          is_active: boolean
          label: string | null
          match_value: string | null
          points: number
          side_effect: string | null
          tenant_id: string | null
        }
        Insert: {
          category: string
          decays?: boolean
          dimension: string
          event_type?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          match_value?: string | null
          points: number
          side_effect?: string | null
          tenant_id?: string | null
        }
        Update: {
          category?: string
          decays?: boolean
          dimension?: string
          event_type?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          match_value?: string | null
          points?: number
          side_effect?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_score_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sequence_runs: {
        Row: {
          cancelled_reason: string | null
          completed_at: string | null
          current_step_order: number
          id: string
          last_sent_at: string | null
          lead_id: string
          next_send_at: string | null
          sequence_id: string
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          cancelled_reason?: string | null
          completed_at?: string | null
          current_step_order?: number
          id?: string
          last_sent_at?: string | null
          lead_id: string
          next_send_at?: string | null
          sequence_id: string
          started_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          cancelled_reason?: string | null
          completed_at?: string | null
          current_step_order?: number
          id?: string
          last_sent_at?: string | null
          lead_id?: string
          next_send_at?: string | null
          sequence_id?: string
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sequence_runs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sequence_runs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sequence_runs_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_status_history: {
        Row: {
          changed_at: string
          from_status: string | null
          id: string
          lead_id: string
          source: string
          tenant_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          from_status?: string | null
          id?: string
          lead_id: string
          source?: string
          tenant_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          from_status?: string | null
          id?: string
          lead_id?: string
          source?: string
          tenant_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_status_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_status_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_status_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          acquisition_channel_id: string | null
          agent_id: string
          budget_amount: number | null
          created_at: string | null
          current_score: number | null
          email: string
          email_blocked: boolean
          email_blocked_reason: string | null
          engagement_score: number | null
          first_name: string
          fit_profile: Json
          fit_score: number | null
          id: string
          language: string
          last_event_at: string | null
          last_name: string
          last_signal_at: string | null
          last_signal_type: string | null
          lender: string | null
          manual_score: number | null
          metadata: Json | null
          notes: string | null
          peak_score: number | null
          phone: string | null
          quality_score: number | null
          score_updated_at: string | null
          search_text: string | null
          stage: string
          tenant_id: string
          traffic_source: string | null
          traffic_source_detail: Json | null
          updated_at: string | null
        }
        Insert: {
          acquisition_channel_id?: string | null
          agent_id: string
          budget_amount?: number | null
          created_at?: string | null
          current_score?: number | null
          email: string
          email_blocked?: boolean
          email_blocked_reason?: string | null
          engagement_score?: number | null
          first_name: string
          fit_profile?: Json
          fit_score?: number | null
          id: string
          language: string
          last_event_at?: string | null
          last_name: string
          last_signal_at?: string | null
          last_signal_type?: string | null
          lender?: string | null
          manual_score?: number | null
          metadata?: Json | null
          notes?: string | null
          peak_score?: number | null
          phone?: string | null
          quality_score?: number | null
          score_updated_at?: string | null
          search_text?: string | null
          stage?: string
          tenant_id: string
          traffic_source?: string | null
          traffic_source_detail?: Json | null
          updated_at?: string | null
        }
        Update: {
          acquisition_channel_id?: string | null
          agent_id?: string
          budget_amount?: number | null
          created_at?: string | null
          current_score?: number | null
          email?: string
          email_blocked?: boolean
          email_blocked_reason?: string | null
          engagement_score?: number | null
          first_name?: string
          fit_profile?: Json
          fit_score?: number | null
          id?: string
          language?: string
          last_event_at?: string | null
          last_name?: string
          last_signal_at?: string | null
          last_signal_type?: string | null
          lender?: string | null
          manual_score?: number | null
          metadata?: Json | null
          notes?: string | null
          peak_score?: number | null
          phone?: string | null
          quality_score?: number | null
          score_updated_at?: string | null
          search_text?: string | null
          stage?: string
          tenant_id?: string
          traffic_source?: string | null
          traffic_source_detail?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_acquisition_channel_id_fkey"
            columns: ["acquisition_channel_id"]
            isOneToOne: false
            referencedRelation: "acquisition_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_dossiers: {
        Row: {
          created_at: string
          domains: string[]
          findings: Json
          id: string
          language: string
          period: string
          searches: number
          summary: string
          tenant_id: string
          topic: string
          topic_key: string
        }
        Insert: {
          created_at?: string
          domains?: string[]
          findings?: Json
          id?: string
          language: string
          period: string
          searches?: number
          summary: string
          tenant_id: string
          topic: string
          topic_key: string
        }
        Update: {
          created_at?: string
          domains?: string[]
          findings?: Json
          id?: string
          language?: string
          period?: string
          searches?: number
          summary?: string
          tenant_id?: string
          topic?: string
          topic_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_dossiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_editions: {
        Row: {
          ai_generated: boolean
          ai_run: Json | null
          author_agent_id: string | null
          author_avatar_url: string | null
          author_name: string | null
          author_org_name: string | null
          author_title: string | null
          category: string
          channel_id: string
          content: Json
          cover_image_url: string
          cover_source: string
          created_at: string
          created_by_agent_id: string | null
          created_by_user_id: string | null
          data_as_of: string | null
          dek: string | null
          id: string
          language: string
          published_at: string | null
          slug: string
          sources: Json
          status: string
          tenant_id: string
          title: string
          translation_group_id: string | null
          unpublished_by_billing: boolean
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          ai_run?: Json | null
          author_agent_id?: string | null
          author_avatar_url?: string | null
          author_name?: string | null
          author_org_name?: string | null
          author_title?: string | null
          category?: string
          channel_id: string
          content?: Json
          cover_image_url: string
          cover_source?: string
          created_at?: string
          created_by_agent_id?: string | null
          created_by_user_id?: string | null
          data_as_of?: string | null
          dek?: string | null
          id?: string
          language?: string
          published_at?: string | null
          slug: string
          sources?: Json
          status?: string
          tenant_id: string
          title: string
          translation_group_id?: string | null
          unpublished_by_billing?: boolean
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          ai_run?: Json | null
          author_agent_id?: string | null
          author_avatar_url?: string | null
          author_name?: string | null
          author_org_name?: string | null
          author_title?: string | null
          category?: string
          channel_id?: string
          content?: Json
          cover_image_url?: string
          cover_source?: string
          created_at?: string
          created_by_agent_id?: string | null
          created_by_user_id?: string | null
          data_as_of?: string | null
          dek?: string | null
          id?: string
          language?: string
          published_at?: string | null
          slug?: string
          sources?: Json
          status?: string
          tenant_id?: string
          title?: string
          translation_group_id?: string | null
          unpublished_by_billing?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_editions_author_agent_id_fkey"
            columns: ["author_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_editions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "acquisition_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_editions_created_by_agent_id_fkey"
            columns: ["created_by_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_editions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          message: string
          read: boolean
          telegram_sent: boolean
          telegram_sent_at: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          message: string
          read?: boolean
          telegram_sent?: boolean
          telegram_sent_at?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          message?: string
          read?: boolean
          telegram_sent?: boolean
          telegram_sent_at?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      paddle_webhook_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          occurred_at: string
          payload: Json
          processed_at: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          occurred_at: string
          payload: Json
          processed_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paddle_webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_requests: {
        Row: {
          category: string | null
          company: string | null
          created_at: string
          id: string
          kind: string
          message: string
          metadata: Json
          requester_email: string
          requester_name: string | null
          requester_role: string | null
          responded: boolean
          responded_at: string | null
          subject: string | null
          tenant_id: string | null
          tenant_name: string | null
        }
        Insert: {
          category?: string | null
          company?: string | null
          created_at?: string
          id?: string
          kind: string
          message: string
          metadata?: Json
          requester_email: string
          requester_name?: string | null
          requester_role?: string | null
          responded?: boolean
          responded_at?: string | null
          subject?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
        }
        Update: {
          category?: string | null
          company?: string | null
          created_at?: string
          id?: string
          kind?: string
          message?: string
          metadata?: Json
          requester_email?: string
          requester_name?: string | null
          requester_role?: string | null
          responded?: boolean
          responded_at?: string | null
          subject?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string
          bathrooms: number | null
          bathrooms_full: number | null
          bathrooms_half: number | null
          bedrooms: number | null
          city: string | null
          content_languages: string[]
          created_at: string
          created_by_agent_id: string | null
          created_by_user_id: string | null
          description_en: string | null
          description_es: string | null
          descriptions: Json
          detail_pdf_url: string | null
          external_url: string | null
          features_en: string[] | null
          features_es: string[] | null
          features_i18n: Json
          floor_plans: string[] | null
          gallery: string[] | null
          garage_spaces: number | null
          id: string
          image_url: string | null
          list_price: number | null
          lot_sqft: number | null
          mls_number: string | null
          name: string | null
          neighborhood: string | null
          notes: string | null
          property_type: string
          published_to_web: boolean
          slug: string | null
          sqft: number | null
          state: string | null
          status: string
          tenant_id: string
          unpublished_by_billing: boolean
          updated_at: string
          year_built: number | null
        }
        Insert: {
          address: string
          bathrooms?: number | null
          bathrooms_full?: number | null
          bathrooms_half?: number | null
          bedrooms?: number | null
          city?: string | null
          content_languages?: string[]
          created_at?: string
          created_by_agent_id?: string | null
          created_by_user_id?: string | null
          description_en?: string | null
          description_es?: string | null
          descriptions?: Json
          detail_pdf_url?: string | null
          external_url?: string | null
          features_en?: string[] | null
          features_es?: string[] | null
          features_i18n?: Json
          floor_plans?: string[] | null
          gallery?: string[] | null
          garage_spaces?: number | null
          id?: string
          image_url?: string | null
          list_price?: number | null
          lot_sqft?: number | null
          mls_number?: string | null
          name?: string | null
          neighborhood?: string | null
          notes?: string | null
          property_type: string
          published_to_web?: boolean
          slug?: string | null
          sqft?: number | null
          state?: string | null
          status?: string
          tenant_id: string
          unpublished_by_billing?: boolean
          updated_at?: string
          year_built?: number | null
        }
        Update: {
          address?: string
          bathrooms?: number | null
          bathrooms_full?: number | null
          bathrooms_half?: number | null
          bedrooms?: number | null
          city?: string | null
          content_languages?: string[]
          created_at?: string
          created_by_agent_id?: string | null
          created_by_user_id?: string | null
          description_en?: string | null
          description_es?: string | null
          descriptions?: Json
          detail_pdf_url?: string | null
          external_url?: string | null
          features_en?: string[] | null
          features_es?: string[] | null
          features_i18n?: Json
          floor_plans?: string[] | null
          gallery?: string[] | null
          garage_spaces?: number | null
          id?: string
          image_url?: string | null
          list_price?: number | null
          lot_sqft?: number | null
          mls_number?: string | null
          name?: string | null
          neighborhood?: string | null
          notes?: string | null
          property_type?: string
          published_to_web?: boolean
          slug?: string | null
          sqft?: number | null
          state?: string | null
          status?: string
          tenant_id?: string
          unpublished_by_billing?: boolean
          updated_at?: string
          year_built?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_created_by_agent_id_fkey"
            columns: ["created_by_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_email_templates: {
        Row: {
          agent_id: string
          body_json: Json | null
          id: string
          language: string
          milestone: string
          resend_template_id: string
          subject: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          body_json?: Json | null
          id?: string
          language: string
          milestone: string
          resend_template_id?: string
          subject?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          body_json?: Json | null
          id?: string
          language?: string
          milestone?: string
          resend_template_id?: string
          subject?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_email_templates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_processes: {
        Row: {
          address: string
          closing_date: string | null
          completed_at: string | null
          created_at: string | null
          email_completed_sent: boolean
          email_preclose_sent: boolean
          email_start_sent: boolean
          id: string
          lead_id: string
          loan_type: string
          notes: string | null
          tenant_id: string
        }
        Insert: {
          address: string
          closing_date?: string | null
          completed_at?: string | null
          created_at?: string | null
          email_completed_sent?: boolean
          email_preclose_sent?: boolean
          email_start_sent?: boolean
          id?: string
          lead_id: string
          loan_type: string
          notes?: string | null
          tenant_id: string
        }
        Update: {
          address?: string
          closing_date?: string | null
          completed_at?: string | null
          created_at?: string | null
          email_completed_sent?: boolean
          email_preclose_sent?: boolean
          email_start_sent?: boolean
          id?: string
          lead_id?: string
          loan_type?: string
          notes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_processes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_processes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_processes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_images: {
        Row: {
          agent_id: string | null
          aspect: string
          background_path: string | null
          cost_usd: number
          created_at: string
          created_by: string | null
          error_message: string | null
          form_json: Json
          id: string
          palette: string[] | null
          property_id: string | null
          recipe: string
          reference_path: string | null
          reference_paths: string[] | null
          reference_role: string | null
          rendered_path: string | null
          scene_prompt: string | null
          source_mode: string
          status: string
          style: string
          template: string | null
          template_snapshot: Json | null
          tenant_id: string
          text_zone: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          aspect: string
          background_path?: string | null
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          form_json: Json
          id?: string
          palette?: string[] | null
          property_id?: string | null
          recipe: string
          reference_path?: string | null
          reference_paths?: string[] | null
          reference_role?: string | null
          rendered_path?: string | null
          scene_prompt?: string | null
          source_mode?: string
          status?: string
          style: string
          template?: string | null
          template_snapshot?: Json | null
          tenant_id: string
          text_zone?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          aspect?: string
          background_path?: string | null
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          form_json?: Json
          id?: string
          palette?: string[] | null
          property_id?: string | null
          recipe?: string
          reference_path?: string | null
          reference_paths?: string[] | null
          reference_role?: string | null
          rendered_path?: string | null
          scene_prompt?: string | null
          source_mode?: string
          status?: string
          style?: string
          template?: string | null
          template_snapshot?: Json | null
          tenant_id?: string
          text_zone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_images_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_images_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_images_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_templates: {
        Row: {
          aspects: string[]
          created_at: string
          css: string
          hint: string
          html: string
          ideal_photos: number
          key: string
          label: string
          recipes: string[]
          slots: Json
          thumb_path: string | null
          updated_at: string
        }
        Insert: {
          aspects?: string[]
          created_at?: string
          css?: string
          hint?: string
          html?: string
          ideal_photos?: number
          key: string
          label: string
          recipes?: string[]
          slots?: Json
          thumb_path?: string | null
          updated_at?: string
        }
        Update: {
          aspects?: string[]
          created_at?: string
          css?: string
          hint?: string
          html?: string
          ideal_photos?: number
          key?: string
          label?: string
          recipes?: string[]
          slots?: Json
          thumb_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle: string | null
          billing_exempt: boolean
          cancel_at: string | null
          created_at: string
          current_period_end: string | null
          degraded_at: string | null
          id: string
          last_event_at: string | null
          paddle_customer_id: string | null
          paddle_price_id: string | null
          paddle_subscription_id: string | null
          plan: string
          requested_plan: string | null
          started_at: string
          status: string
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: string | null
          billing_exempt?: boolean
          cancel_at?: string | null
          created_at?: string
          current_period_end?: string | null
          degraded_at?: string | null
          id?: string
          last_event_at?: string | null
          paddle_customer_id?: string | null
          paddle_price_id?: string | null
          paddle_subscription_id?: string | null
          plan?: string
          requested_plan?: string | null
          started_at?: string
          status?: string
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: string | null
          billing_exempt?: boolean
          cancel_at?: string | null
          created_at?: string
          current_period_end?: string | null
          degraded_at?: string | null
          id?: string
          last_event_at?: string | null
          paddle_customer_id?: string | null
          paddle_price_id?: string | null
          paddle_subscription_id?: string | null
          plan?: string
          requested_plan?: string | null
          started_at?: string
          status?: string
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_quality_bands: {
        Row: {
          active_leads: number
          computed_at: string
          p20: number
          p40: number
          p60: number
          p80: number
          tenant_id: string
        }
        Insert: {
          active_leads: number
          computed_at?: string
          p20: number
          p40: number
          p60: number
          p80: number
          tenant_id: string
        }
        Update: {
          active_leads?: number
          computed_at?: string
          p20?: number
          p40?: number
          p60?: number
          p80?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_quality_bands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          ai_lead_scoring_enabled: boolean
          ai_monthly_limit_usd: number
          ai_unlimited: boolean
          budget_entry_max: number | null
          budget_premium_min: number | null
          commission_buy: number | null
          commission_model: string | null
          commission_sell: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          domain_records: Json | null
          domain_status: string
          email_from_address: string | null
          id: string
          logo_url: string | null
          name: string
          newsletter_canonical_template: string | null
          newsletter_source_domains: string[] | null
          pages_managed_by_itmano: boolean
          primary_areas: string[] | null
          primary_color: string
          public_site_url: string | null
          resend_account: string
          resend_domain_id: string | null
          secondary_areas: string[] | null
          sending_domain: string | null
          slug: string
        }
        Insert: {
          ai_lead_scoring_enabled?: boolean
          ai_monthly_limit_usd?: number
          ai_unlimited?: boolean
          budget_entry_max?: number | null
          budget_premium_min?: number | null
          commission_buy?: number | null
          commission_model?: string | null
          commission_sell?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          domain_records?: Json | null
          domain_status?: string
          email_from_address?: string | null
          id: string
          logo_url?: string | null
          name: string
          newsletter_canonical_template?: string | null
          newsletter_source_domains?: string[] | null
          pages_managed_by_itmano?: boolean
          primary_areas?: string[] | null
          primary_color?: string
          public_site_url?: string | null
          resend_account?: string
          resend_domain_id?: string | null
          secondary_areas?: string[] | null
          sending_domain?: string | null
          slug: string
        }
        Update: {
          ai_lead_scoring_enabled?: boolean
          ai_monthly_limit_usd?: number
          ai_unlimited?: boolean
          budget_entry_max?: number | null
          budget_premium_min?: number | null
          commission_buy?: number | null
          commission_model?: string | null
          commission_sell?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          domain_records?: Json | null
          domain_status?: string
          email_from_address?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          newsletter_canonical_template?: string | null
          newsletter_source_domains?: string[] | null
          pages_managed_by_itmano?: boolean
          primary_areas?: string[] | null
          primary_color?: string
          public_site_url?: string | null
          resend_account?: string
          resend_domain_id?: string | null
          secondary_areas?: string[] | null
          sending_domain?: string | null
          slug?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string | null
          id: string
          role: string
          telegram_chat_id: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          role: string
          telegram_chat_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          telegram_chat_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leads_list: {
        Row: {
          acquisition_channel_id: string | null
          agent_id: string | null
          budget_amount: number | null
          created_at: string | null
          current_score: number | null
          email: string | null
          email_blocked: boolean | null
          email_blocked_reason: string | null
          engagement_score: number | null
          first_name: string | null
          fit_profile: Json | null
          fit_score: number | null
          id: string | null
          is_imported: boolean | null
          is_subscriber: boolean | null
          language: string | null
          last_event_at: string | null
          last_name: string | null
          last_signal_at: string | null
          last_signal_type: string | null
          lender: string | null
          manual_score: number | null
          metadata: Json | null
          notes: string | null
          peak_score: number | null
          phone: string | null
          quality_band: string | null
          quality_score: number | null
          score_updated_at: string | null
          search_text: string | null
          stage: string | null
          tenant_id: string | null
          traffic_source: string | null
          traffic_source_detail: Json | null
          updated_at: string | null
          urgency: string | null
          urgency_rank: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_acquisition_channel_id_fkey"
            columns: ["acquisition_channel_id"]
            isOneToOne: false
            referencedRelation: "acquisition_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      channel_metrics: {
        Args: { p_channel_ids: string[]; p_window_days?: number }
        Returns: Json
      }
      decay_lead_scores: {
        Args: { p_dry_run?: boolean }
        Returns: {
          affected_lead_id: string
          lead_tenant_id: string
          new_score: number
          new_stage: string
          old_score: number
          old_stage: string
          stage_changed: boolean
        }[]
      }
      get_my_tenant_id: { Args: never; Returns: string }
      is_super_admin: { Args: never; Returns: boolean }
      lead_analytics_stats: {
        Args: { p_agent_id?: string; p_months?: number; p_tenant_id?: string }
        Returns: Json
      }
      lead_dashboard_stats: {
        Args: { p_agent_id?: string; p_tenant_id?: string }
        Returns: Json
      }
      lead_response_time_stats: {
        Args: {
          p_action_types?: string[]
          p_agent_id?: string
          p_days?: number
          p_tenant_id?: string
        }
        Returns: Json
      }
      recalc_lead_score: { Args: { p_lead_id: string }; Returns: undefined }
      recompute_lead_score: { Args: { p_lead_id: string }; Returns: undefined }
      refresh_quality_bands: { Args: never; Returns: number }
      rls_jwt_base64url_encode: { Args: { data: string }; Returns: string }
      rls_jwt_sign: { Args: { payload: Json; secret: string }; Returns: string }
      rls_test_create_user: {
        Args: { p_email: string; p_password: string }
        Returns: string
      }
      rls_test_delete_user: { Args: { p_email: string }; Returns: undefined }
      rls_test_get_user_id: { Args: { p_email: string }; Returns: string }
      rls_test_mint_jwt:
        | { Args: { p_email: string }; Returns: string }
        | { Args: { p_email: string; p_secret: string }; Returns: string }
      schema_snapshot: { Args: never; Returns: Json }
      sequence_eligible_leads: {
        Args: {
          p_agent_filter?: string
          p_agent_id?: string
          p_language?: string
          p_limit?: number
          p_search?: string
          p_sequence_id: string
          p_stage?: string
          p_tenant_id?: string
        }
        Returns: Json
      }
      tenant_hub_stats: { Args: { p_days?: number }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
