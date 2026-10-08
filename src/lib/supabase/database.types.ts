// Generated from the live schema (Supabase project eloznbkkmkdfgjajambo). Regenerate after schema changes.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      announcements: {
        Row: { business_id: string; data: Json; id: string; updated_at: string };
        Insert: { business_id: string; data: Json; id: string; updated_at?: string };
        Update: { business_id?: string; data?: Json; id?: string; updated_at?: string };
        Relationships: [
          {
            foreignKeyName: "announcements_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: { color: string; created_at: string; id: string; name: string };
        Insert: { color?: string; created_at?: string; id?: string; name: string };
        Update: { color?: string; created_at?: string; id?: string; name?: string };
        Relationships: [];
      };
      clients: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string;
          business_id: string;
          created_at: string;
          email: string;
          ghl_contact_id: string | null;
          id: string;
          name: string;
          notes: string;
          owner_id: string | null;
          phone: string;
          project: string;
          stage: string | null;
          stage_changed_at: string | null;
        };
        Insert: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string;
          business_id: string;
          created_at?: string;
          email?: string;
          ghl_contact_id?: string | null;
          id: string;
          name: string;
          notes?: string;
          owner_id?: string | null;
          phone?: string;
          project?: string;
          stage?: string | null;
          stage_changed_at?: string | null;
        };
        Update: {
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string;
          business_id?: string;
          created_at?: string;
          email?: string;
          ghl_contact_id?: string | null;
          id?: string;
          name?: string;
          notes?: string;
          owner_id?: string | null;
          phone?: string;
          project?: string;
          stage?: string | null;
          stage_changed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clients_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "team_members";
            referencedColumns: ["id"];
          },
        ];
      };
      client_stage_history: {
        Row: { changed_at: string; changed_by: string; client_id: string; from_stage: string | null; id: string; to_stage: string | null };
        Insert: { changed_at?: string; changed_by?: string; client_id: string; from_stage?: string | null; id?: string; to_stage?: string | null };
        Update: { changed_at?: string; changed_by?: string; client_id?: string; from_stage?: string | null; id?: string; to_stage?: string | null };
        Relationships: [];
      };
      contacts: {
        Row: {
          assignee_id: string | null;
          channel: string;
          client_id: string;
          created_at: string;
          escalations: Json;
          first_response_at: string | null;
          ghl_message_id: string | null;
          history: Json;
          id: string;
          priority: string;
          received_at: string;
          reminded_at: string | null;
          resolved_at: string | null;
          responded_by_id: string;
          source: string;
          status: string;
          summary: string;
          updated_at: string;
        };
        Insert: {
          assignee_id?: string | null;
          channel: string;
          client_id: string;
          created_at?: string;
          escalations?: Json;
          first_response_at?: string | null;
          ghl_message_id?: string | null;
          history?: Json;
          id: string;
          priority?: string;
          received_at: string;
          reminded_at?: string | null;
          resolved_at?: string | null;
          responded_by_id?: string;
          source?: string;
          status?: string;
          summary?: string;
          updated_at?: string;
        };
        Update: {
          assignee_id?: string | null;
          channel?: string;
          client_id?: string;
          created_at?: string;
          escalations?: Json;
          first_response_at?: string | null;
          ghl_message_id?: string | null;
          history?: Json;
          id?: string;
          priority?: string;
          received_at?: string;
          reminded_at?: string | null;
          resolved_at?: string | null;
          responded_by_id?: string;
          source?: string;
          status?: string;
          summary?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "team_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      ghl_users: {
        Row: { email: string; id: string; name: string; updated_at: string };
        Insert: { email?: string; id: string; name?: string; updated_at?: string };
        Update: { email?: string; id?: string; name?: string; updated_at?: string };
        Relationships: [];
      };
      ghl_messages: {
        Row: { contact_id: string | null; direction: string; id: string; processed_at: string };
        Insert: { contact_id?: string | null; direction: string; id: string; processed_at?: string };
        Update: { contact_id?: string | null; direction?: string; id?: string; processed_at?: string };
        Relationships: [
          {
            foreignKeyName: "ghl_messages_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_state: {
        Row: { key: string; updated_at: string; value: Json };
        Insert: { key: string; updated_at?: string; value?: Json };
        Update: { key?: string; updated_at?: string; value?: Json };
        Relationships: [];
      };
      messages: {
        Row: {
          attachments: Json;
          body: string;
          call_status: string;
          channel: string;
          client_id: string;
          conversation_id: string;
          created_at: string;
          direction: string;
          duration_seconds: number | null;
          email_meta: Json | null;
          ghl_user_id: string;
          id: string;
          occurred_at: string;
          sent_by_user: boolean;
          source: string;
          status: string;
        };
        Insert: {
          attachments?: Json;
          body?: string;
          call_status?: string;
          channel: string;
          client_id: string;
          conversation_id?: string;
          created_at?: string;
          direction: string;
          duration_seconds?: number | null;
          email_meta?: Json | null;
          ghl_user_id?: string;
          id: string;
          occurred_at: string;
          sent_by_user?: boolean;
          source?: string;
          status?: string;
        };
        Update: {
          attachments?: Json;
          body?: string;
          call_status?: string;
          channel?: string;
          client_id?: string;
          conversation_id?: string;
          created_at?: string;
          direction?: string;
          duration_seconds?: number | null;
          email_meta?: Json | null;
          ghl_user_id?: string;
          id?: string;
          occurred_at?: string;
          sent_by_user?: boolean;
          source?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          attempts: number;
          body: string;
          client_id: string | null;
          contact_id: string | null;
          created_at: string;
          delivery_error: string;
          email_status: string;
          id: string;
          kind: string;
          link: string;
          read_at: string | null;
          recipient_id: string;
          slack_status: string;
          title: string;
          urgent: boolean;
        };
        Insert: {
          attempts?: number;
          body?: string;
          client_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          delivery_error?: string;
          email_status?: string;
          id?: string;
          kind: string;
          link?: string;
          read_at?: string | null;
          recipient_id: string;
          slack_status?: string;
          title: string;
          urgent?: boolean;
        };
        Update: {
          attempts?: number;
          body?: string;
          client_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          delivery_error?: string;
          email_status?: string;
          id?: string;
          kind?: string;
          link?: string;
          read_at?: string | null;
          recipient_id?: string;
          slack_status?: string;
          title?: string;
          urgent?: boolean;
        };
        Relationships: [];
      };
      notification_prefs: {
        Row: { email: boolean; member_id: string; new_messages: boolean; reminders: boolean; slack: boolean; updated_at: string };
        Insert: { email?: boolean; member_id: string; new_messages?: boolean; reminders?: boolean; slack?: boolean; updated_at?: string };
        Update: { email?: boolean; member_id?: string; new_messages?: boolean; reminders?: boolean; slack?: boolean; updated_at?: string };
        Relationships: [];
      };
      settings: {
        Row: { allowed_domains: string[]; blocked_emails: string[]; id: number; sla: Json; updated_at: string };
        Insert: { allowed_domains?: string[]; blocked_emails?: string[]; id?: number; sla: Json; updated_at?: string };
        Update: { allowed_domains?: string[]; blocked_emails?: string[]; id?: number; sla?: Json; updated_at?: string };
        Relationships: [];
      };
      team_notes: {
        Row: { author_id: string | null; body: string; client_id: string | null; created_at: string; flagged_for: string | null; id: string; mentions: string[] };
        Insert: { author_id?: string | null; body: string; client_id?: string | null; created_at?: string; flagged_for?: string | null; id?: string; mentions?: string[] };
        Update: { author_id?: string | null; body?: string; client_id?: string | null; created_at?: string; flagged_for?: string | null; id?: string; mentions?: string[] };
        Relationships: [];
      };
      team_members: {
        Row: {
          created_at: string;
          department: string;
          email: string;
          escalation: boolean;
          ghl_contact_id: string | null;
          id: string;
          name: string;
          phone: string;
          role: string;
          slack_user_id: string;
        };
        Insert: {
          created_at?: string;
          department?: string;
          email?: string;
          escalation?: boolean;
          ghl_contact_id?: string | null;
          id: string;
          name: string;
          phone?: string;
          role?: string;
          slack_user_id?: string;
        };
        Update: {
          created_at?: string;
          department?: string;
          email?: string;
          escalation?: boolean;
          ghl_contact_id?: string | null;
          id?: string;
          name?: string;
          phone?: string;
          role?: string;
          slack_user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      client_overview: {
        Row: {
          archive_reason: string | null;
          archived_at: string | null;
          business_id: string;
          email: string;
          id: string;
          last_body: string | null;
          last_channel: string | null;
          last_direction: string | null;
          last_message_at: string | null;
          name: string;
          owner_id: string | null;
          phone: string;
          project: string;
          stage: string | null;
          waiting: number;
          last_in_at: string | null;
          last_in_channel: string | null;
          last_in_body: string | null;
          last_in_source: string | null;
          last_in_attachments: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      current_member_id: { Args: never; Returns: string };
      current_member_role: { Args: never; Returns: string };
      is_team_member: { Args: never; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
