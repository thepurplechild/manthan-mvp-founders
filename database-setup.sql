-- Project Manthan Database Schema
-- Run this in Supabase SQL Editor

-- Create the profiles table to store public user data
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'creator',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Set up Row Level Security for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Create the projects table (central entity)
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    logline TEXT,
    synopsis TEXT,
    genre TEXT[], -- Array of genres
    character_breakdowns JSONB, -- Stores structured character data
    budget_range TEXT, -- e.g., 'Below 1 Cr', '1-5 Cr'
    target_platforms TEXT[], -- e.g., {'Netflix', 'YouTube'}
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Set up RLS for projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;
CREATE POLICY "Users can view their own projects"
ON public.projects FOR SELECT
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert their own projects" ON public.projects;
CREATE POLICY "Users can insert their own projects"
ON public.projects FOR INSERT
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
CREATE POLICY "Users can update their own projects"
ON public.projects FOR UPDATE
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;
CREATE POLICY "Users can delete their own projects"
ON public.projects FOR DELETE
USING (auth.uid() = owner_id);

-- Founder can view all projects
DROP POLICY IF EXISTS "Founders can view all projects" ON public.projects;
CREATE POLICY "Founders can view all projects"
ON public.projects FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'founder'
    )
);

-- Create the script_uploads table
CREATE TABLE IF NOT EXISTS public.script_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT,
    file_size BIGINT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Set up RLS for script_uploads
ALTER TABLE public.script_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view uploads for their projects" ON public.script_uploads;
CREATE POLICY "Users can view uploads for their projects"
ON public.script_uploads FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = script_uploads.project_id
        AND projects.owner_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Users can insert uploads for their projects" ON public.script_uploads;
CREATE POLICY "Users can insert uploads for their projects"
ON public.script_uploads FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = script_uploads.project_id
        AND projects.owner_id = auth.uid()
    )
);

-- Founder can view all uploads
DROP POLICY IF EXISTS "Founders can view all uploads" ON public.script_uploads;
CREATE POLICY "Founders can view all uploads"
ON public.script_uploads FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'founder'
    )
);

-- Create the generated_assets table
CREATE TABLE IF NOT EXISTS public.generated_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL, -- 'pitch_deck', 'series_outline', 'character_bible'
    asset_url TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Set up RLS for generated_assets
ALTER TABLE public.generated_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view assets for their projects" ON public.generated_assets;
CREATE POLICY "Users can view assets for their projects"
ON public.generated_assets FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = generated_assets.project_id
        AND projects.owner_id = auth.uid()
    )
);

-- Founder can view all assets
DROP POLICY IF EXISTS "Founders can view all assets" ON public.generated_assets;
CREATE POLICY "Founders can view all assets"
ON public.generated_assets FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'founder'
    )
);

-- Create the platform_mandates table (Founder-only)
CREATE TABLE IF NOT EXISTS public.platform_mandates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_name TEXT NOT NULL, -- e.g., 'Netflix', 'SonyLIV'
    mandate_description TEXT NOT NULL, -- The core market intelligence
    tags TEXT[], -- Searchable tags
    source TEXT, -- How the intelligence was obtained
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Set up RLS for platform_mandates (Founder-only access)
ALTER TABLE public.platform_mandates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only founders can access platform mandates" ON public.platform_mandates;
CREATE POLICY "Only founders can access platform mandates"
ON public.platform_mandates FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'founder'
    )
);

-- Create the deal_pipeline table (Founder-only)
CREATE TABLE IF NOT EXISTS public.deal_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    target_buyer_name TEXT NOT NULL, -- Name of the buyer/studio being pitched
    status TEXT NOT NULL DEFAULT 'introduced', -- 'introduced', 'passed', 'in_discussion', 'deal_closed'
    feedback_notes TEXT, -- Logs feedback from the buyer
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Set up RLS for deal_pipeline (Founder-only access)
ALTER TABLE public.deal_pipeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only founders can access deal pipeline" ON public.deal_pipeline;
CREATE POLICY "Only founders can access deal pipeline"
ON public.deal_pipeline FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'founder'
    )
);

-- Create a trigger to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'creator');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage buckets for files
INSERT INTO storage.buckets (id, name, public)
VALUES ('scripts', 'scripts', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-assets', 'generated-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies
DROP POLICY IF EXISTS "Users can upload scripts for their projects" ON storage.objects;
CREATE POLICY "Users can upload scripts for their projects"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'scripts' AND
    EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.owner_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Users can view their own script uploads" ON storage.objects;
CREATE POLICY "Users can view their own script uploads"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'scripts' AND
    EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.owner_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Founders can view all scripts" ON storage.objects;
CREATE POLICY "Founders can view all scripts"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'scripts' AND
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'founder'
    )
);

DROP POLICY IF EXISTS "System can manage generated assets" ON storage.objects;
CREATE POLICY "System can manage generated assets"
ON storage.objects FOR ALL
USING (bucket_id = 'generated-assets');

-- Create the ingestions table for file processing pipeline
CREATE TABLE IF NOT EXISTS public.ingestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    source_file_url TEXT NOT NULL,
    mime_type TEXT,
    status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'running', 'succeeded', 'failed'
    progress INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    result_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Set up RLS for ingestions
ALTER TABLE public.ingestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own ingestions" ON public.ingestions;
CREATE POLICY "Users can view their own ingestions"
ON public.ingestions FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own ingestions" ON public.ingestions;
CREATE POLICY "Users can insert their own ingestions"
ON public.ingestions FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own ingestions" ON public.ingestions;
CREATE POLICY "Users can update their own ingestions"
ON public.ingestions FOR UPDATE
USING (auth.uid() = user_id);

-- Founders can view all ingestions
DROP POLICY IF EXISTS "Founders can view all ingestions" ON public.ingestions;
CREATE POLICY "Founders can view all ingestions"
ON public.ingestions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'founder'
    )
);

-- Create the ingestion_steps table for tracking pipeline progress
CREATE TABLE IF NOT EXISTS public.ingestion_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingestion_id UUID NOT NULL REFERENCES public.ingestions(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- 'script_preprocess', 'core_extraction', etc.
    status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'running', 'succeeded', 'failed'
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    output_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Set up RLS for ingestion_steps
ALTER TABLE public.ingestion_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view steps for their own ingestions" ON public.ingestion_steps;
CREATE POLICY "Users can view steps for their own ingestions"
ON public.ingestion_steps FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.ingestions
        WHERE ingestions.id = ingestion_steps.ingestion_id
        AND ingestions.user_id = auth.uid()
    )
);

-- Founders can view all ingestion steps
DROP POLICY IF EXISTS "Founders can view all ingestion steps" ON public.ingestion_steps;
CREATE POLICY "Founders can view all ingestion steps"
ON public.ingestion_steps FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'founder'
    )
);

-- Create updated_at trigger for ingestions table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ingestions_updated_at ON public.ingestions;
CREATE TRIGGER update_ingestions_updated_at
    BEFORE UPDATE ON public.ingestions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create the packages table for final output from AI pipeline
CREATE TABLE IF NOT EXISTS public.packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingestion_id UUID NOT NULL REFERENCES public.ingestions(id) ON DELETE CASCADE,
    summary JSONB NOT NULL DEFAULT '{}',
    deck_url TEXT,
    document_url TEXT,
    artifacts JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Set up RLS for packages
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view packages for their own ingestions" ON public.packages;
CREATE POLICY "Users can view packages for their own ingestions"
ON public.packages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.ingestions
        WHERE ingestions.id = packages.ingestion_id
        AND ingestions.user_id = auth.uid()
    )
);

-- Founders can view all packages
DROP POLICY IF EXISTS "Founders can view all packages" ON public.packages;
CREATE POLICY "Founders can view all packages"
ON public.packages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'founder'
    )
);