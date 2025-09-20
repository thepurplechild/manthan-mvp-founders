-- Manthan Platform Mandates & Deal Pipeline Tables
-- Idempotent migration for Supabase (Postgres 15)
-- Adds platform_mandates and deal_pipeline tables with blueprint requirements

-- 1) Create platform_mandates table with blueprint columns
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_mandates'
  ) THEN
    CREATE TABLE public.platform_mandates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      platform_name TEXT NOT NULL, -- e.g., 'Netflix', 'SonyLIV', 'Amazon Prime Video'
      mandate_description TEXT NOT NULL, -- Core market intelligence/mandate details
      tags TEXT[] DEFAULT '{}', -- Searchable tags array (blueprint requirement)
      source TEXT, -- How the intelligence was obtained (blueprint requirement)
      feedback_notes TEXT, -- Additional feedback/notes (blueprint requirement)
      created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

-- 2) Create deal_pipeline table with blueprint columns
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline'
  ) THEN
    CREATE TABLE public.deal_pipeline (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
      target_buyer_name TEXT NOT NULL, -- Name of the buyer/studio being pitched
      status TEXT NOT NULL DEFAULT 'introduced' CHECK (
        status IN ('introduced', 'in_discussion', 'under_review', 'passed', 'deal_closed', 'contract_signed')
      ),
      tags TEXT[] DEFAULT '{}', -- Searchable tags array (blueprint requirement)
      source TEXT, -- Source of the lead/contact (blueprint requirement)
      feedback_notes TEXT, -- Feedback from buyer/notes (blueprint requirement)
      priority_level TEXT DEFAULT 'medium' CHECK (priority_level IN ('low', 'medium', 'high', 'urgent')),
      expected_decision_date DATE,
      contact_person TEXT, -- Key contact at the buyer organization
      last_interaction_date DATE,
      next_followup_date DATE,
      deal_value_estimate NUMERIC(12,2), -- Estimated deal value
      probability_score INTEGER CHECK (probability_score BETWEEN 0 AND 100), -- Success probability %
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

-- 3) Add indexes for performance optimization (with table and column existence checks)
DO $$ BEGIN
  -- Platform mandates indexes (only if table and columns exist)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_mandates' AND column_name = 'platform_name'
  ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_platform_mandates_platform_name') THEN
    CREATE INDEX idx_platform_mandates_platform_name ON public.platform_mandates(platform_name);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_mandates' AND column_name = 'tags'
  ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_platform_mandates_tags') THEN
    CREATE INDEX idx_platform_mandates_tags ON public.platform_mandates USING GIN(tags);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_mandates' AND column_name = 'source'
  ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_platform_mandates_source') THEN
    CREATE INDEX idx_platform_mandates_source ON public.platform_mandates(source) WHERE source IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_mandates' AND column_name = 'created_by'
  ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_platform_mandates_created_by') THEN
    CREATE INDEX idx_platform_mandates_created_by ON public.platform_mandates(created_by);
  END IF;

  -- Deal pipeline indexes (only if table and columns exist)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'project_id'
  ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deal_pipeline_project_id') THEN
    CREATE INDEX idx_deal_pipeline_project_id ON public.deal_pipeline(project_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'status'
  ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deal_pipeline_status') THEN
    CREATE INDEX idx_deal_pipeline_status ON public.deal_pipeline(status);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'tags'
  ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deal_pipeline_tags') THEN
    CREATE INDEX idx_deal_pipeline_tags ON public.deal_pipeline USING GIN(tags);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'source'
  ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deal_pipeline_source') THEN
    CREATE INDEX idx_deal_pipeline_source ON public.deal_pipeline(source) WHERE source IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'target_buyer_name'
  ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deal_pipeline_target_buyer') THEN
    CREATE INDEX idx_deal_pipeline_target_buyer ON public.deal_pipeline(target_buyer_name);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'priority_level'
  ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deal_pipeline_priority') THEN
    CREATE INDEX idx_deal_pipeline_priority ON public.deal_pipeline(priority_level);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'expected_decision_date'
  ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deal_pipeline_expected_decision') THEN
    CREATE INDEX idx_deal_pipeline_expected_decision ON public.deal_pipeline(expected_decision_date) WHERE expected_decision_date IS NOT NULL;
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- If there's an issue with GIN indexes, fall back to regular indexes for arrays
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'platform_mandates' AND column_name = 'tags'
    ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_platform_mandates_tags') THEN
      CREATE INDEX idx_platform_mandates_tags ON public.platform_mandates(tags);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- If even regular index fails, continue
  END;

  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'tags'
    ) AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deal_pipeline_tags') THEN
      CREATE INDEX idx_deal_pipeline_tags ON public.deal_pipeline(tags);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- If even regular index fails, continue
  END;
END $$;

-- 4) Enable Row Level Security (with existence checks)
DO $$ BEGIN
  -- Enable RLS on platform_mandates if not already enabled
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_mandates'
  ) THEN
    ALTER TABLE public.platform_mandates ENABLE ROW LEVEL SECURITY;
  END IF;

  -- Enable RLS on deal_pipeline if not already enabled
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline'
  ) THEN
    ALTER TABLE public.deal_pipeline ENABLE ROW LEVEL SECURITY;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If RLS is already enabled, that's okay
  NULL;
END $$;

-- 5) RLS Policies for platform_mandates (Founder-only access)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'platform_mandates' AND policyname = 'platform_mandates_founder_all'
  ) THEN
    CREATE POLICY platform_mandates_founder_all ON public.platform_mandates
      FOR ALL TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'founder'
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'founder'
        )
      );
  END IF;
END $$;

-- Service role access for platform_mandates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'platform_mandates' AND policyname = 'platform_mandates_service_all'
  ) THEN
    CREATE POLICY platform_mandates_service_all ON public.platform_mandates
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6) RLS Policies for deal_pipeline (Founder-only access)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'deal_pipeline' AND policyname = 'deal_pipeline_founder_all'
  ) THEN
    CREATE POLICY deal_pipeline_founder_all ON public.deal_pipeline
      FOR ALL TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'founder'
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'founder'
        )
      );
  END IF;
END $$;

-- Service role access for deal_pipeline
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'deal_pipeline' AND policyname = 'deal_pipeline_service_all'
  ) THEN
    CREATE POLICY deal_pipeline_service_all ON public.deal_pipeline
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 7) Create updated_at triggers
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS platform_mandates_updated_at ON public.platform_mandates;
DROP TRIGGER IF EXISTS deal_pipeline_updated_at ON public.deal_pipeline;

-- Create triggers
CREATE TRIGGER platform_mandates_updated_at
  BEFORE UPDATE ON public.platform_mandates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER deal_pipeline_updated_at
  BEFORE UPDATE ON public.deal_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 8) Create helper functions for common operations

-- Function to get all platform mandates for a specific platform
CREATE OR REPLACE FUNCTION public.fn_get_platform_mandates(p_platform_name TEXT)
RETURNS TABLE (
  id UUID,
  platform_name TEXT,
  mandate_description TEXT,
  tags TEXT[],
  source TEXT,
  feedback_notes TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.id,
    pm.platform_name,
    pm.mandate_description,
    pm.tags,
    pm.source,
    pm.feedback_notes,
    pm.created_at
  FROM public.platform_mandates pm
  WHERE pm.platform_name ILIKE '%' || p_platform_name || '%'
  ORDER BY pm.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get deal pipeline summary for a project
CREATE OR REPLACE FUNCTION public.fn_get_deal_pipeline_summary(p_project_id UUID)
RETURNS TABLE (
  total_leads INTEGER,
  active_discussions INTEGER,
  closed_deals INTEGER,
  pass_rate NUMERIC,
  average_probability NUMERIC,
  estimated_total_value NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_leads,
    COUNT(CASE WHEN dp.status IN ('in_discussion', 'under_review') THEN 1 END)::INTEGER as active_discussions,
    COUNT(CASE WHEN dp.status IN ('deal_closed', 'contract_signed') THEN 1 END)::INTEGER as closed_deals,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND((COUNT(CASE WHEN dp.status = 'passed' THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0
    END as pass_rate,
    ROUND(AVG(dp.probability_score), 2) as average_probability,
    COALESCE(SUM(dp.deal_value_estimate), 0) as estimated_total_value
  FROM public.deal_pipeline dp
  WHERE dp.project_id = p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search platform mandates by tags
CREATE OR REPLACE FUNCTION public.fn_search_mandates_by_tags(p_tags TEXT[])
RETURNS TABLE (
  id UUID,
  platform_name TEXT,
  mandate_description TEXT,
  tags TEXT[],
  source TEXT,
  created_at TIMESTAMPTZ,
  tag_match_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.id,
    pm.platform_name,
    pm.mandate_description,
    pm.tags,
    pm.source,
    pm.created_at,
    (
      SELECT COUNT(*)::INTEGER
      FROM unnest(pm.tags) AS tag
      WHERE tag = ANY(p_tags)
    ) as tag_match_count
  FROM public.platform_mandates pm
  WHERE pm.tags && p_tags -- Arrays overlap operator
  ORDER BY tag_match_count DESC, pm.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9) Create materialized view for deal pipeline analytics
DO $$ BEGIN
  -- Check if materialized view doesn't exist AND deal_pipeline table exists with required columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mv_deal_pipeline_analytics'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'priority_level'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'probability_score'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'deal_value_estimate'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'last_interaction_date'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_pipeline' AND column_name = 'created_at'
  ) THEN
    CREATE MATERIALIZED VIEW public.mv_deal_pipeline_analytics AS
    SELECT
      dp.status,
      dp.priority_level,
      COUNT(*) as deal_count,
      AVG(dp.probability_score) as avg_probability,
      SUM(dp.deal_value_estimate) as total_estimated_value,
      AVG(EXTRACT(DAYS FROM (dp.last_interaction_date - dp.created_at::date))) as avg_days_to_interaction
    FROM public.deal_pipeline dp
    WHERE dp.created_at >= (CURRENT_DATE - INTERVAL '12 months')
    GROUP BY dp.status, dp.priority_level
    WITH NO DATA;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If materialized view creation fails, that's okay - it's not critical
  NULL;
END $$;

-- Refresh the materialized view (only if it exists and has data)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mv_deal_pipeline_analytics'
  ) THEN
    REFRESH MATERIALIZED VIEW public.mv_deal_pipeline_analytics;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If refresh fails (no data), that's okay
  NULL;
END $$;

-- Create index on materialized view
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_mv_deal_pipeline_analytics_status_priority') THEN
    CREATE INDEX idx_mv_deal_pipeline_analytics_status_priority
    ON public.mv_deal_pipeline_analytics(status, priority_level);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If materialized view doesn't exist yet, that's okay
  NULL;
END $$;

-- 10) Insert sample data for testing (safe for production)
DO $$ BEGIN
  -- Only insert sample data if the table exists and is empty, and there are users
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_mandates'
  ) AND EXISTS (
    SELECT 1 FROM auth.users LIMIT 1
  ) AND NOT EXISTS (
    SELECT 1 FROM public.platform_mandates
    WHERE platform_name = 'Netflix India'
    AND mandate_description LIKE '%regional content%'
  ) THEN
    INSERT INTO public.platform_mandates (platform_name, mandate_description, tags, source, feedback_notes, created_by)
    VALUES (
      'Netflix India',
      'Focus on regional content with strong family drama elements. Looking for 6-8 episode limited series format.',
      ARRAY['regional', 'family-drama', 'limited-series', 'netflix'],
      'Industry networking event - Mumbai',
      'Prefer Hindi/English bilingual content. Budget range 15-25 Cr per series.',
      (SELECT id FROM auth.users WHERE email LIKE '%@%' LIMIT 1)
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If insertion fails, that's okay for sample data
  NULL;
END $$;

-- Create notification function for deal status changes
CREATE OR REPLACE FUNCTION public.fn_notify_deal_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      metadata
    )
    SELECT
      p.owner_id,
      'Deal Status Update',
      format('Deal with %s changed from %s to %s', NEW.target_buyer_name, OLD.status, NEW.status),
      'deal_update',
      jsonb_build_object(
        'deal_id', NEW.id,
        'project_id', NEW.project_id,
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    FROM public.projects p
    WHERE p.id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for deal status notifications (only if notifications table exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'notifications' AND table_schema = 'public'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'deal_pipeline' AND table_schema = 'public'
  ) THEN
    -- Drop trigger if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.triggers
      WHERE trigger_name = 'deal_status_change_notification'
      AND event_object_table = 'deal_pipeline'
    ) THEN
      DROP TRIGGER deal_status_change_notification ON public.deal_pipeline;
    END IF;

    -- Create the trigger
    CREATE TRIGGER deal_status_change_notification
      AFTER UPDATE ON public.deal_pipeline
      FOR EACH ROW EXECUTE FUNCTION public.fn_notify_deal_status_change();
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If trigger creation fails, that's okay
  NULL;
END $$;

-- END MIGRATION