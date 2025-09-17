-- Manthan: India-context fields + Trends/Network + Ingestion Pipeline
-- Safe, backward-compatible; assumes Postgres 15 (Supabase default)

-- 1) Extend `projects` with India-specific optional arrays
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS regional_focus text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cultural_themes text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS festival_tie_ins text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mythology_elements text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS social_issues text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS collaboration_preferences text[] DEFAULT NULL;

-- 2) Market Trends table (read for all authenticated, write admin only)
CREATE TABLE IF NOT EXISTS public.indian_market_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL,
  trending_genres jsonb NOT NULL DEFAULT '[]'::jsonb,
  seasonal_prefs jsonb NOT NULL DEFAULT '[]'::jsonb,
  platform_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Creator Network table (row-level ownership)
CREATE TABLE IF NOT EXISTS public.creator_network (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collaborations jsonb NOT NULL DEFAULT '[]'::jsonb,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  hub text,
  mentorship jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Ingestion Pipeline tables
DO $$ BEGIN
  CREATE TYPE public.ingestion_status AS ENUM ('queued','running','paused','failed','succeeded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.step_name AS ENUM (
    'script_preprocess','core_extraction','character_bible','market_adaptation','package_assembly','final_package'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.step_status AS ENUM ('queued','running','failed','succeeded','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ingestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_file_url text NOT NULL,
  mime_type text,
  status public.ingestion_status NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ingestion_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_id uuid NOT NULL REFERENCES public.ingestions(id) ON DELETE CASCADE,
  name public.step_name NOT NULL,
  status public.step_status NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  attempt integer NOT NULL DEFAULT 0,
  output jsonb DEFAULT '{}'::jsonb,
  error text
);

CREATE TABLE IF NOT EXISTS public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_id uuid NOT NULL REFERENCES public.ingestions(id) ON DELETE CASCADE,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  deck_url text,
  document_url text,
  artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5) RLS Policies
ALTER TABLE public.indian_market_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_network ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

-- Authenticated can read trends; only service role/admin can write
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'indian_market_trends' AND policyname = 'indian_market_trends_read'
  ) THEN
    CREATE POLICY indian_market_trends_read ON public.indian_market_trends
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'indian_market_trends' AND policyname = 'indian_market_trends_admin_write'
  ) THEN
    CREATE POLICY indian_market_trends_admin_write ON public.indian_market_trends
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Creator network: owner RW, others no access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'creator_network' AND policyname = 'creator_network_owner_rw'
  ) THEN
    CREATE POLICY creator_network_owner_rw ON public.creator_network
      FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Ingestions: owner RW
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'ingestions' AND policyname = 'ingestions_owner_rw'
  ) THEN
    CREATE POLICY ingestions_owner_rw ON public.ingestions
      FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Steps: visible via parent ingestion ownership
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'ingestion_steps' AND policyname = 'ingestion_steps_owner_r'
  ) THEN
    CREATE POLICY ingestion_steps_owner_r ON public.ingestion_steps
      FOR SELECT TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.ingestions i WHERE i.id = ingestion_id AND i.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'ingestion_steps' AND policyname = 'ingestion_steps_owner_w'
  ) THEN
    CREATE POLICY ingestion_steps_owner_w ON public.ingestion_steps
      FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.ingestions i WHERE i.id = ingestion_id AND i.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'ingestion_steps' AND policyname = 'ingestion_steps_owner_u'
  ) THEN
    CREATE POLICY ingestion_steps_owner_u ON public.ingestion_steps
      FOR UPDATE TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.ingestions i WHERE i.id = ingestion_id AND i.user_id = auth.uid()
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.ingestions i WHERE i.id = ingestion_id AND i.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Packages: owner R, insert by owner, updates typically by server
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'packages' AND policyname = 'packages_owner_r'
  ) THEN
    CREATE POLICY packages_owner_r ON public.packages
      FOR SELECT TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.ingestions i WHERE i.id = ingestion_id AND i.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'packages' AND policyname = 'packages_owner_w'
  ) THEN
    CREATE POLICY packages_owner_w ON public.packages
      FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.ingestions i WHERE i.id = ingestion_id AND i.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 6) Realtime triggers (for UI updates)
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ingestions_touch ON public.ingestions;
CREATE TRIGGER ingestions_touch BEFORE UPDATE ON public.ingestions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7) Seed minimal trends (safe examples)
INSERT INTO public.indian_market_trends (region, trending_genres, seasonal_prefs, platform_patterns, success_metrics)
VALUES
  ('Mumbai', '["Bollywood Drama","Thriller/Crime","Web Series"]'::jsonb,
   '[{"season":"Diwali","content":"Family drama"}]'::jsonb,
   '[{"platform":"Disney+ Hotstar","note":"Festive family titles"}]'::jsonb,
   '{"avg_watch_time": 38}'::jsonb),
  ('Chennai', '["Regional Cinema (Tamil)","Action/Adventure","Romance"]'::jsonb,
   '[{"season":"Pongal","content":"Action dramas"}]'::jsonb,
   '[{"platform":"Prime Video India","note":"Tamil originals"}]'::jsonb,
   '{"avg_watch_time": 41}'::jsonb)
ON CONFLICT DO NOTHING;

-- 8) Helper view: simple recommendations (genre by region)
CREATE OR REPLACE VIEW public.v_region_genre_hints AS
SELECT region,
       jsonb_agg(DISTINCT g)::jsonb AS suggested_genres
FROM (
  SELECT region, jsonb_array_elements_text(trending_genres) AS g
  FROM public.indian_market_trends
) s
GROUP BY region;

-- 9) Additional insights: platform patterns by region
CREATE OR REPLACE VIEW public.v_platform_patterns_by_region AS
SELECT region,
       jsonb_agg(DISTINCT (p->>'platform')) FILTER (WHERE p ? 'platform') AS platforms,
       count(*) AS pattern_count
FROM (
  SELECT region, jsonb_array_elements(platform_patterns) AS p
  FROM public.indian_market_trends
) t
GROUP BY region;

-- 10) Seasonal opportunities (materialized for speed)
DROP MATERIALIZED VIEW IF EXISTS public.mv_seasonal_opportunities;
CREATE MATERIALIZED VIEW public.mv_seasonal_opportunities AS
SELECT region,
       (pref->>'season') AS season,
       jsonb_agg(DISTINCT (pref->>'content')) FILTER (WHERE pref ? 'content') AS contents,
       count(*) AS occurrences
FROM (
  SELECT region, jsonb_array_elements(seasonal_prefs) AS pref
  FROM public.indian_market_trends
) x
GROUP BY region, season
WITH NO DATA;

-- 11) Creator network aggregates (skills) — expose anonymized counts
CREATE OR REPLACE FUNCTION public.creator_skills_aggregate()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  SELECT coalesce(jsonb_object_agg(skill, cnt), '{}'::jsonb) INTO result
  FROM (
    SELECT val::text AS skill, count(*) AS cnt
    FROM (
      SELECT jsonb_array_elements_text(skills) AS val
      FROM public.creator_network
    ) s
    GROUP BY val
  ) agg;
  RETURN result;
END;$$ LANGUAGE plpgsql;

-- 12) Recommend content RPC (region/language/genre)
CREATE OR REPLACE FUNCTION public.recommend_content(region text, language text, genre text)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE hints jsonb;
DECLARE platforms jsonb;
DECLARE seasons jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(suggested_genres)::jsonb, '[]'::jsonb)
    INTO hints
  FROM public.v_region_genre_hints WHERE region = recommend_content.region;

  SELECT coalesce(jsonb_agg(platforms)::jsonb, '[]'::jsonb)
    INTO platforms
  FROM public.v_platform_patterns_by_region WHERE region = recommend_content.region;

  SELECT coalesce(jsonb_agg(jsonb_build_object('season', season, 'contents', contents))::jsonb, '[]'::jsonb)
    INTO seasons
  FROM public.mv_seasonal_opportunities WHERE region = recommend_content.region;

  RETURN jsonb_build_object(
    'region', region,
    'input', jsonb_build_object('language', language, 'genre', genre),
    'genres', coalesce(hints, '[]'::jsonb),
    'platforms', coalesce(platforms, '[]'::jsonb),
    'seasonal', coalesce(seasons, '[]'::jsonb)
  );
END;$$ LANGUAGE plpgsql;

-- END
