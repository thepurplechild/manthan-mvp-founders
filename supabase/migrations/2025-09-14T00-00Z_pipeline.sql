-- Manthan Pipeline: status, content, assets, storage, and helpers
-- Idempotent migration designed for Supabase (Postgres 15)

-- 1) projects: augment with pipeline fields
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS processing_status text,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz;

-- 2) ai_processing_status table
CREATE TABLE IF NOT EXISTS public.ai_processing_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('extract','characters','market','pitch','visuals','assembly')),
  status text NOT NULL CHECK (status IN ('pending','running','completed','failed','skipped')),
  started_at timestamptz,
  finished_at timestamptz,
  error jsonb,
  retry_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_processing_status_uniq UNIQUE (project_id, step)
);

-- 3) generated_content table
CREATE TABLE IF NOT EXISTS public.generated_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  step text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4) generated_assets table (augment or create)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema='public' AND table_name='generated_assets'
  ) THEN
    CREATE TABLE public.generated_assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('pdf_pitch','pptx_pitch','exec_summary')),
      storage_path text NOT NULL,
      bytes int,
      sha256 text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    -- Add/align columns for existing table
    ALTER TABLE public.generated_assets
      ADD COLUMN IF NOT EXISTS kind text,
      ADD COLUMN IF NOT EXISTS storage_path text,
      ADD COLUMN IF NOT EXISTS bytes int,
      ADD COLUMN IF NOT EXISTS sha256 text;
    -- Backfill defaults for NOT NULL without breaking existing data
    UPDATE public.generated_assets
      SET kind = COALESCE(kind, CASE WHEN asset_type IS NOT NULL THEN 
        CASE asset_type
          WHEN 'pitch_deck' THEN 'pptx_pitch'
          WHEN 'pdf_deck' THEN 'pdf_pitch'
          WHEN 'exec_summary' THEN 'exec_summary'
          ELSE 'pdf_pitch' END
      ELSE 'pdf_pitch' END),
          storage_path = COALESCE(storage_path, COALESCE(asset_url, ''));
    ALTER TABLE public.generated_assets
      ALTER COLUMN kind SET NOT NULL,
      ALTER COLUMN storage_path SET NOT NULL,
      ADD CONSTRAINT generated_assets_kind_chk CHECK (kind IN ('pdf_pitch','pptx_pitch','exec_summary'));
  END IF;
END $$;

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_ai_processing_status_project_step ON public.ai_processing_status(project_id, step);
CREATE INDEX IF NOT EXISTS idx_generated_content_project_step ON public.generated_content(project_id, step);
CREATE INDEX IF NOT EXISTS idx_generated_assets_project_kind ON public.generated_assets(project_id, kind);

-- 6) Storage bucket for pipeline outputs
INSERT INTO storage.buckets (id, name, public)
SELECT 'manthan-assets', 'manthan-assets', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'manthan-assets');

-- 7) RLS enablement
ALTER TABLE public.ai_processing_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_assets ENABLE ROW LEVEL SECURITY;
-- projects RLS assumed enabled by base schema

-- 8) Policies: owner-only access via projects.owner_id
-- ai_processing_status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_processing_status' AND policyname='ai_status_owner_read'
  ) THEN
    CREATE POLICY ai_status_owner_read ON public.ai_processing_status
      FOR SELECT TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = ai_processing_status.project_id AND p.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_processing_status' AND policyname='ai_status_owner_write'
  ) THEN
    CREATE POLICY ai_status_owner_write ON public.ai_processing_status
      FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = ai_processing_status.project_id AND p.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_processing_status' AND policyname='ai_status_owner_update'
  ) THEN
    CREATE POLICY ai_status_owner_update ON public.ai_processing_status
      FOR UPDATE TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = ai_processing_status.project_id AND p.owner_id = auth.uid()
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = ai_processing_status.project_id AND p.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- generated_content
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generated_content' AND policyname='gen_content_owner_read'
  ) THEN
    CREATE POLICY gen_content_owner_read ON public.generated_content
      FOR SELECT TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = generated_content.project_id AND p.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generated_content' AND policyname='gen_content_owner_write'
  ) THEN
    CREATE POLICY gen_content_owner_write ON public.generated_content
      FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = generated_content.project_id AND p.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generated_content' AND policyname='gen_content_owner_update'
  ) THEN
    CREATE POLICY gen_content_owner_update ON public.generated_content
      FOR UPDATE TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = generated_content.project_id AND p.owner_id = auth.uid()
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = generated_content.project_id AND p.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- generated_assets
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generated_assets' AND policyname='gen_assets_owner_read'
  ) THEN
    CREATE POLICY gen_assets_owner_read ON public.generated_assets
      FOR SELECT TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = generated_assets.project_id AND p.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generated_assets' AND policyname='gen_assets_owner_write'
  ) THEN
    CREATE POLICY gen_assets_owner_write ON public.generated_assets
      FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = generated_assets.project_id AND p.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generated_assets' AND policyname='gen_assets_owner_update'
  ) THEN
    CREATE POLICY gen_assets_owner_update ON public.generated_assets
      FOR UPDATE TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = generated_assets.project_id AND p.owner_id = auth.uid()
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = generated_assets.project_id AND p.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 9) Service role bypass policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_processing_status' AND policyname='ai_status_service_all'
  ) THEN
    CREATE POLICY ai_status_service_all ON public.ai_processing_status FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generated_content' AND policyname='gen_content_service_all'
  ) THEN
    CREATE POLICY gen_content_service_all ON public.generated_content FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generated_assets' AND policyname='gen_assets_service_all'
  ) THEN
    CREATE POLICY gen_assets_service_all ON public.generated_assets FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 10) Storage policies for 'manthan-assets' bucket (owner-only via first path segment = user id)
CREATE POLICY IF NOT EXISTS manthan_assets_owner_rw
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'manthan-assets' AND
  (split_part(name, '/', 1))::uuid = auth.uid()
)
WITH CHECK (
  bucket_id = 'manthan-assets' AND
  (split_part(name, '/', 1))::uuid = auth.uid()
);

-- Allow service role full access to bucket
CREATE POLICY IF NOT EXISTS manthan_assets_service_all
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'manthan-assets') WITH CHECK (bucket_id = 'manthan-assets');

-- 11) RPC helpers
CREATE OR REPLACE FUNCTION public.fn_mark_step(p_project_id uuid, p_step text, p_status text, p_error jsonb DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO public.ai_processing_status (project_id, step, status, started_at, finished_at, error, retry_count)
  VALUES (p_project_id, p_step, p_status,
          CASE WHEN p_status = 'running' THEN now() ELSE NULL END,
          CASE WHEN p_status IN ('completed','failed','skipped') THEN now() ELSE NULL END,
          p_error,
          CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END)
  ON CONFLICT (project_id, step)
  DO UPDATE SET
    status = EXCLUDED.status,
    started_at = COALESCE(ai_processing_status.started_at, EXCLUDED.started_at),
    finished_at = CASE WHEN EXCLUDED.status IN ('completed','failed','skipped') THEN now() ELSE ai_processing_status.finished_at END,
    error = EXCLUDED.error,
    retry_count = CASE WHEN EXCLUDED.status = 'failed' THEN ai_processing_status.retry_count + 1 ELSE ai_processing_status.retry_count END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_create_asset_record(p_project_id uuid, p_kind text, p_storage_path text, p_bytes int, p_sha256 text)
RETURNS uuid AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.generated_assets (project_id, kind, storage_path, bytes, sha256)
  VALUES (p_project_id, p_kind, p_storage_path, p_bytes, p_sha256)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

