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
        };
        Insert: {
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
        };
        Update: {
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
      settings: {
        Row: { id: number; sla: Json; updated_at: string };
        Insert: { id?: number; sla: Json; updated_at?: string };
        Update: { id?: number; sla?: Json; updated_at?: string };
        Relationships: [];
      };
      team_members: {
        Row: {
          created_at: string;
          email: string;
          escalation: boolean;
          id: string;
          name: string;
          phone: string;
          role: string;
          slack_user_id: string;
        };
        Insert: {
          created_at?: string;
          email?: string;
          escalation?: boolean;
          id: string;
          name: string;
          phone?: string;
          role?: string;
          slack_user_id?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          escalation?: boolean;
          id?: string;
          name?: string;
          phone?: string;
          role?: string;
          slack_user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      current_member_role: { Args: never; Returns: string };
      is_team_member: { Args: never; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
