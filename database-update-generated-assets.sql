-- Update generated_assets table to support the new AI packaging workflow
-- Run this in Supabase SQL Editor after database-setup.sql

-- Update the generated_assets table structure to include new required columns
ALTER TABLE public.generated_assets
ADD COLUMN IF NOT EXISTS ingestion_id UUID REFERENCES public.ingestions(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'generating',
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Update the asset_url column to be nullable (since we now use file_path)
ALTER TABLE public.generated_assets ALTER COLUMN asset_url DROP NOT NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_generated_assets_ingestion_id ON public.generated_assets(ingestion_id);
CREATE INDEX IF NOT EXISTS idx_generated_assets_project_status ON public.generated_assets(project_id, status);

-- Add policy for inserting assets (needed for the AI packaging agent)
DROP POLICY IF EXISTS "Service can insert assets" ON public.generated_assets;
CREATE POLICY "Service can insert assets"
ON public.generated_assets FOR INSERT
WITH CHECK (true); -- This allows the service role to insert assets

-- Add policy for updating assets
DROP POLICY IF EXISTS "Service can update assets" ON public.generated_assets;
CREATE POLICY "Service can update assets"
ON public.generated_assets FOR UPDATE
USING (true); -- This allows the service role to update assets

-- Founders can view all generated assets
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

-- Add comments for documentation
COMMENT ON TABLE public.generated_assets IS 'Stores AI-generated assets like pitch decks, character bibles, and series outlines';
COMMENT ON COLUMN public.generated_assets.ingestion_id IS 'Links to the ingestion job that generated this asset';
COMMENT ON COLUMN public.generated_assets.file_path IS 'Path to the generated file in Supabase Storage';
COMMENT ON COLUMN public.generated_assets.file_name IS 'Original filename of the generated asset';
COMMENT ON COLUMN public.generated_assets.status IS 'Status of asset generation: generating, completed, failed';
COMMENT ON COLUMN public.generated_assets.metadata IS 'Additional metadata about the generated asset';