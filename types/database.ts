/**
 * Database Types for Project Manthan MVP
 *
 * This file contains TypeScript type definitions for the Supabase database schema.
 * These types ensure type safety when working with database operations.
 *
 * Generated from Supabase schema and manually maintained.
 * Update this file when database schema changes.
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          role: string
          avatar_url: string | null
          bio: string | null
          location: string | null
          website: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          role?: string
          avatar_url?: string | null
          bio?: string | null
          location?: string | null
          website?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          role?: string
          avatar_url?: string | null
          bio?: string | null
          location?: string | null
          website?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          owner_id: string
          title: string
          status: string
          logline: string | null
          synopsis: string | null
          genre: string[] | null
          character_breakdowns: any | null
          budget_range: string | null
          target_platforms: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          title: string
          status?: string
          logline?: string | null
          synopsis?: string | null
          genre?: string[] | null
          character_breakdowns?: any | null
          budget_range?: string | null
          target_platforms?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          title?: string
          status?: string
          logline?: string | null
          synopsis?: string | null
          genre?: string[] | null
          character_breakdowns?: any | null
          budget_range?: string | null
          target_platforms?: string[] | null
          created_at?: string
          updated_at?: string
        }
      }
      script_uploads: {
        Row: {
          id: string
          project_id: string
          file_path: string
          file_name: string | null
          file_size: number | null
          mime_type: string | null
          uploaded_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          file_path: string
          file_name?: string | null
          file_size?: number | null
          mime_type?: string | null
          uploaded_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          file_path?: string
          file_name?: string | null
          file_size?: number | null
          mime_type?: string | null
          uploaded_at?: string
          updated_at?: string
        }
      }
      generated_assets: {
        Row: {
          id: string
          project_id: string
          asset_type: string
          asset_url: string | null
          version: number
          metadata: any | null
          generation_prompt: string | null
          ai_model: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          asset_type: string
          asset_url?: string | null
          version?: number
          metadata?: any | null
          generation_prompt?: string | null
          ai_model?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          asset_type?: string
          asset_url?: string | null
          version?: number
          metadata?: any | null
          generation_prompt?: string | null
          ai_model?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      ingestions: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          source_file_url: string
          mime_type: string | null
          status: string
          progress: number
          error: string | null
          output: any | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id?: string | null
          source_file_url: string
          mime_type?: string | null
          status?: string
          progress?: number
          error?: string | null
          output?: any | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string | null
          source_file_url?: string
          mime_type?: string | null
          status?: string
          progress?: number
          error?: string | null
          output?: any | null
          created_at?: string
          updated_at?: string
        }
      }
      ingestion_steps: {
        Row: {
          id: string
          ingestion_id: string
          name: string
          status: string
          started_at: string | null
          finished_at: string | null
          error: string | null
          output: any | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          ingestion_id: string
          name: string
          status?: string
          started_at?: string | null
          finished_at?: string | null
          error?: string | null
          output?: any | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ingestion_id?: string
          name?: string
          status?: string
          started_at?: string | null
          finished_at?: string | null
          error?: string | null
          output?: any | null
          created_at?: string
          updated_at?: string
        }
      }
      packages: {
        Row: {
          id: string
          ingestion_id: string
          summary: any
          deck_url: string | null
          document_url: string | null
          artifacts: any
          created_at: string
        }
        Insert: {
          id?: string
          ingestion_id: string
          summary?: any
          deck_url?: string | null
          document_url?: string | null
          artifacts?: any
          created_at?: string
        }
        Update: {
          id?: string
          ingestion_id?: string
          summary?: any
          deck_url?: string | null
          document_url?: string | null
          artifacts?: any
          created_at?: string
        }
      }
      platform_mandates: {
        Row: {
          id: string
          platform_name: string
          mandate_description: string
          tags: string[] | null
          source: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          platform_name: string
          mandate_description: string
          tags?: string[] | null
          source?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          platform_name?: string
          mandate_description?: string
          tags?: string[] | null
          source?: string | null
          created_by?: string
          created_at?: string
        }
      }
      deal_pipeline: {
        Row: {
          id: string
          project_id: string
          target_buyer_name: string
          status: string
          feedback_notes: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          target_buyer_name: string
          status?: string
          feedback_notes?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          target_buyer_name?: string
          status?: string
          feedback_notes?: string | null
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}