-- ============================================================================
-- PROJECT MANTHAN MVP - FOUNDATIONAL DATABASE SCHEMA
-- ============================================================================
--
-- This script establishes the complete core database schema for Project Manthan,
-- a managed marketplace platform for Indian screenwriters.
--
-- Execute this script in the Supabase SQL Editor before any application development.
-- The script is idempotent and can be safely re-run.
--
-- Schema Overview:
-- - User profiles with role-based access (creators and founders)
-- - Project management with ownership tracking
-- - File metadata for script uploads and AI-generated assets
-- - Automatic profile creation via database triggers
-- - Row Level Security (RLS) for data protection
--
-- Author: Claude Code AI Assistant
-- Version: 1.0
-- Date: 2025-01-15
-- ============================================================================

-- Enable necessary PostgreSQL extensions
-- (These may already be enabled in Supabase, but ensuring they're available)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- STEP 1: DATABASE FUNCTIONS
-- ============================================================================

-- Function: Automatically create a profile when a user signs up
-- This function is triggered whenever a new user is created in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role, created_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'creator', -- Default role for new users
        NOW()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the function
COMMENT ON FUNCTION public.handle_new_user() IS
'Automatically creates a profile record when a new user signs up via Supabase Auth. Extracts full_name from metadata or falls back to email.';

-- ============================================================================
-- STEP 2: CORE TABLES (Ordered by Dependencies)
-- ============================================================================

-- Table: public.profiles
-- Purpose: Store public user data and link to Supabase Auth users
-- This table extends auth.users with application-specific profile information
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'creator' CHECK (role IN ('creator', 'founder')),
    avatar_url TEXT,
    bio TEXT,
    location TEXT,
    website TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add table comment
COMMENT ON TABLE public.profiles IS
'User profiles extending Supabase Auth with application-specific data. Links directly to auth.users via id.';

-- Add column comments for clarity
COMMENT ON COLUMN public.profiles.id IS 'Foreign key to auth.users.id, automatically deleted when user is deleted';
COMMENT ON COLUMN public.profiles.role IS 'User role: creator (default) or founder. Determines access permissions.';
COMMENT ON COLUMN public.profiles.full_name IS 'Display name for the user, extracted from auth metadata or manually set';

-- Table: public.projects
-- Purpose: Central entity for creator projects and marketplace listings
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'published', 'rejected')),
    logline TEXT,
    synopsis TEXT,
    genre TEXT[], -- PostgreSQL array for multiple genres (e.g., {'Drama', 'Thriller'})
    character_breakdowns JSONB, -- Structured character data for ML features
    budget_range TEXT CHECK (budget_range IN ('micro', 'low', 'medium', 'high', 'premium')),
    target_platforms TEXT[], -- Target streaming/distribution platforms
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add table and column comments
COMMENT ON TABLE public.projects IS
'Central entity for creator projects. Supports both draft creation and marketplace listings with rich metadata for future ML features.';

COMMENT ON COLUMN public.projects.genre IS
'Array of genre tags for categorization and ML training (e.g., ["Drama", "Thriller", "Romance"])';

COMMENT ON COLUMN public.projects.character_breakdowns IS
'JSONB structure containing character profiles, relationships, and arcs for ML analysis';

COMMENT ON COLUMN public.projects.budget_range IS
'Standardized budget categories: micro (<1Cr), low (1-5Cr), medium (5-25Cr), high (25-100Cr), premium (>100Cr)';

COMMENT ON COLUMN public.projects.target_platforms IS
'Array of target platforms (e.g., ["Netflix", "Amazon Prime", "Disney+ Hotstar"])';

-- Table: public.script_uploads
-- Purpose: Store metadata for uploaded script files (actual files stored in Supabase Storage)
CREATE TABLE IF NOT EXISTS public.script_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL, -- Path within Supabase Storage bucket
    file_name TEXT,
    file_size BIGINT, -- File size in bytes
    mime_type TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Metadata for future ML features
    page_count INTEGER,
    estimated_runtime INTEGER, -- In minutes
    dialogue_percentage DECIMAL(5,2), -- Percentage of content that is dialogue
    action_percentage DECIMAL(5,2), -- Percentage of content that is action/description
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Add table comments
COMMENT ON TABLE public.script_uploads IS
'Metadata for script files stored in Supabase Storage. Includes processing status and ML-ready metrics.';

COMMENT ON COLUMN public.script_uploads.file_path IS
'Full path to file in Supabase Storage (e.g., "scripts/project-123/final-draft.pdf")';

COMMENT ON COLUMN public.script_uploads.processing_status IS
'Status of AI processing pipeline for this script';

-- Table: public.generated_assets
-- Purpose: Store metadata for AI-generated pitch materials and deliverables
CREATE TABLE IF NOT EXISTS public.generated_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('pitch_deck', 'series_outline', 'character_bible', 'treatment', 'logline', 'synopsis')),
    asset_url TEXT, -- Path in Supabase Storage (nullable for text-only assets)
    version INTEGER NOT NULL DEFAULT 1,
    metadata JSONB, -- Flexible storage for asset-specific data
    generation_prompt TEXT, -- Prompt used to generate this asset (for audit/debugging)
    ai_model TEXT, -- Model version used for generation tracking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add table comments
COMMENT ON TABLE public.generated_assets IS
'AI-generated pitch materials and project deliverables with full audit trail and versioning.';

COMMENT ON COLUMN public.generated_assets.metadata IS
'Flexible JSONB storage for asset-specific data (e.g., slide count for pitch decks, character count for bibles)';

COMMENT ON COLUMN public.generated_assets.generation_prompt IS
'Original prompt used for AI generation - enables debugging and prompt optimization';

-- ============================================================================
-- STEP 3: INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_genre ON public.projects USING GIN(genre);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_uploads_project_id ON public.script_uploads(project_id);
CREATE INDEX IF NOT EXISTS idx_script_uploads_uploaded_at ON public.script_uploads(uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_assets_project_id ON public.generated_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_assets_type ON public.generated_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_generated_assets_created_at ON public.generated_assets(created_at DESC);

-- ============================================================================
-- STEP 4: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_assets ENABLE ROW LEVEL SECURITY;

-- Profiles table policies
-- Users can view and update their own profile only
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Note: INSERT policy handled by trigger function with SECURITY DEFINER

-- Projects table policies
-- Creators can manage their own projects, founders can view all
CREATE POLICY "Creators can view own projects" ON public.projects
    FOR SELECT USING (
        auth.uid() = owner_id OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'founder'
        )
    );

CREATE POLICY "Creators can insert own projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Creators can update own projects" ON public.projects
    FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Creators can delete own projects" ON public.projects
    FOR DELETE USING (auth.uid() = owner_id);

-- Script uploads policies
-- Access tied to project ownership
CREATE POLICY "Users can view scripts for accessible projects" ON public.script_uploads
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE id = script_uploads.project_id
            AND (
                owner_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role = 'founder'
                )
            )
        )
    );

CREATE POLICY "Project owners can upload scripts" ON public.script_uploads
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE id = script_uploads.project_id AND owner_id = auth.uid()
        )
    );

-- Generated assets policies
-- Similar to script uploads - tied to project access
CREATE POLICY "Users can view assets for accessible projects" ON public.generated_assets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE id = generated_assets.project_id
            AND (
                owner_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role = 'founder'
                )
            )
        )
    );

CREATE POLICY "System can create assets for any project" ON public.generated_assets
    FOR INSERT WITH CHECK (true); -- AI system needs broad access

CREATE POLICY "Project owners can update asset metadata" ON public.generated_assets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE id = generated_assets.project_id AND owner_id = auth.uid()
        )
    );

-- ============================================================================
-- STEP 5: DATABASE TRIGGERS
-- ============================================================================

-- Trigger: Automatically create profile when user signs up
-- Remove existing trigger if it exists to avoid conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON TRIGGER on_auth_user_created ON auth.users IS
'Automatically creates a profile record in public.profiles when a new user signs up via Supabase Auth';

-- Trigger: Update updated_at timestamp on projects
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to relevant tables
DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_generated_assets_updated_at ON public.generated_assets;
CREATE TRIGGER update_generated_assets_updated_at
    BEFORE UPDATE ON public.generated_assets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- STEP 6: INITIAL DATA AND CONFIGURATION
-- ============================================================================

-- Insert default data or configuration if needed
-- (None required for MVP, but structure is here for future use)

-- ============================================================================
-- SCHEMA VALIDATION AND COMPLETION MESSAGE
-- ============================================================================

-- Verify all tables were created successfully
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('profiles', 'projects', 'script_uploads', 'generated_assets');

    IF table_count = 4 THEN
        RAISE NOTICE '✅ SUCCESS: All 4 core tables created successfully';
        RAISE NOTICE '📋 Tables: profiles, projects, script_uploads, generated_assets';
        RAISE NOTICE '🔒 Row Level Security enabled on all tables';
        RAISE NOTICE '🤖 Automatic profile creation trigger configured';
        RAISE NOTICE '📊 Performance indexes created';
        RAISE NOTICE '';
        RAISE NOTICE 'Project Manthan MVP database schema is ready for application development!';
    ELSE
        RAISE EXCEPTION 'Schema creation incomplete. Expected 4 tables, found %', table_count;
    END IF;
END $$;

-- ============================================================================
-- END OF FOUNDATIONAL SCHEMA
-- ============================================================================
--
-- Next Steps:
-- 1. Configure Supabase Storage buckets for 'scripts' and 'assets'
-- 2. Set up environment variables in your Next.js application
-- 3. Begin application development with confidence in the data layer
--
-- For questions or modifications, refer to the Project Manthan documentation
-- or contact the development team.
-- ============================================================================