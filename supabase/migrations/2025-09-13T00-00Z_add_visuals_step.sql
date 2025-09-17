-- Add 'visuals' to step_name enum for ingestion_steps
DO $$ BEGIN
  ALTER TYPE public.step_name ADD VALUE IF NOT EXISTS 'visuals';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

