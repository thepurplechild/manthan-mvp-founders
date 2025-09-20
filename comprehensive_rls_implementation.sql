-- Comprehensive Row-Level Security (RLS) Implementation
-- For Manthan MVP Database with Creator/Founder Role-Based Access Control
--
-- USAGE: Run this script in Supabase SQL Editor after ensuring user profiles exist
--
-- ROLES:
-- - 'creator': Can only access their own data (owner_id = auth.uid())
-- - 'founder': Has administrative access to all data

-- =====================================================================================
-- PHASE 1: HELPER FUNCTIONS
-- =====================================================================================

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get user role from profiles table
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = auth.uid();

  -- Return role or 'anonymous' if not found
  RETURN COALESCE(user_role, 'anonymous');
END;
$$;

-- Helper function to check if current user is a founder
CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'founder'
  );
END;
$$;

-- Helper function to check if current user owns a project
CREATE OR REPLACE FUNCTION public.user_owns_project(project_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = project_uuid AND owner_id = auth.uid()
  );
END;
$$;

-- =====================================================================================
-- PHASE 2: TABLE RLS ENABLEMENT (ENSURE ALL TABLES HAVE RLS ENABLED)
-- =====================================================================================

-- Enable RLS on all target tables (idempotent)
DO $$
BEGIN
  -- Core tables
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
    ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'script_uploads') THEN
    ALTER TABLE public.script_uploads ENABLE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'generated_assets') THEN
    ALTER TABLE public.generated_assets ENABLE ROW LEVEL SECURITY;
  END IF;

  -- Founder-only tables
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_mandates') THEN
    ALTER TABLE public.platform_mandates ENABLE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deal_pipeline') THEN
    ALTER TABLE public.deal_pipeline ENABLE ROW LEVEL SECURITY;
  END IF;

  -- Pipeline tables
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ingestions') THEN
    ALTER TABLE public.ingestions ENABLE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ingestion_steps') THEN
    ALTER TABLE public.ingestion_steps ENABLE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'packages') THEN
    ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- =====================================================================================
-- PHASE 3: COMPREHENSIVE RLS POLICIES
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- PROFILES TABLE POLICIES
-- -------------------------------------------------------------------------------------

-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all_founder" ON public.profiles;

-- Users can view their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "profiles_insert_own" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Founders can view all profiles
CREATE POLICY "profiles_select_all_founder" ON public.profiles
FOR SELECT TO authenticated
USING (public.is_founder());

-- -------------------------------------------------------------------------------------
-- PROJECTS TABLE POLICIES (Creator: own projects, Founder: all projects)
-- -------------------------------------------------------------------------------------

-- Drop existing policies
DROP POLICY IF EXISTS "projects_select_creator" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_creator" ON public.projects;
DROP POLICY IF EXISTS "projects_update_creator" ON public.projects;
DROP POLICY IF EXISTS "projects_delete_creator" ON public.projects;
DROP POLICY IF EXISTS "projects_all_founder" ON public.projects;

-- Creators can view their own projects
CREATE POLICY "projects_select_creator" ON public.projects
FOR SELECT TO authenticated
USING (auth.uid() = owner_id);

-- Creators can insert projects (must set themselves as owner)
CREATE POLICY "projects_insert_creator" ON public.projects
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Creators can update their own projects
CREATE POLICY "projects_update_creator" ON public.projects
FOR UPDATE TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Creators can delete their own projects
CREATE POLICY "projects_delete_creator" ON public.projects
FOR DELETE TO authenticated
USING (auth.uid() = owner_id);

-- Founders have full access to all projects
CREATE POLICY "projects_all_founder" ON public.projects
FOR ALL TO authenticated
USING (public.is_founder())
WITH CHECK (public.is_founder());

-- -------------------------------------------------------------------------------------
-- SCRIPT_UPLOADS TABLE POLICIES (Access via project ownership)
-- -------------------------------------------------------------------------------------

-- Drop existing policies
DROP POLICY IF EXISTS "script_uploads_select_creator" ON public.script_uploads;
DROP POLICY IF EXISTS "script_uploads_insert_creator" ON public.script_uploads;
DROP POLICY IF EXISTS "script_uploads_update_creator" ON public.script_uploads;
DROP POLICY IF EXISTS "script_uploads_delete_creator" ON public.script_uploads;
DROP POLICY IF EXISTS "script_uploads_all_founder" ON public.script_uploads;

-- Creators can view uploads for their projects
CREATE POLICY "script_uploads_select_creator" ON public.script_uploads
FOR SELECT TO authenticated
USING (public.user_owns_project(project_id));

-- Creators can insert uploads for their projects
CREATE POLICY "script_uploads_insert_creator" ON public.script_uploads
FOR INSERT TO authenticated
WITH CHECK (public.user_owns_project(project_id));

-- Creators can update uploads for their projects
CREATE POLICY "script_uploads_update_creator" ON public.script_uploads
FOR UPDATE TO authenticated
USING (public.user_owns_project(project_id))
WITH CHECK (public.user_owns_project(project_id));

-- Creators can delete uploads for their projects
CREATE POLICY "script_uploads_delete_creator" ON public.script_uploads
FOR DELETE TO authenticated
USING (public.user_owns_project(project_id));

-- Founders have full access to all script uploads
CREATE POLICY "script_uploads_all_founder" ON public.script_uploads
FOR ALL TO authenticated
USING (public.is_founder())
WITH CHECK (public.is_founder());

-- -------------------------------------------------------------------------------------
-- GENERATED_ASSETS TABLE POLICIES (Access via project ownership)
-- -------------------------------------------------------------------------------------

-- Drop existing policies
DROP POLICY IF EXISTS "generated_assets_select_creator" ON public.generated_assets;
DROP POLICY IF EXISTS "generated_assets_insert_creator" ON public.generated_assets;
DROP POLICY IF EXISTS "generated_assets_update_creator" ON public.generated_assets;
DROP POLICY IF EXISTS "generated_assets_delete_creator" ON public.generated_assets;
DROP POLICY IF EXISTS "generated_assets_all_founder" ON public.generated_assets;

-- Creators can view assets for their projects
CREATE POLICY "generated_assets_select_creator" ON public.generated_assets
FOR SELECT TO authenticated
USING (public.user_owns_project(project_id));

-- Creators can insert assets for their projects
CREATE POLICY "generated_assets_insert_creator" ON public.generated_assets
FOR INSERT TO authenticated
WITH CHECK (public.user_owns_project(project_id));

-- Creators can update assets for their projects
CREATE POLICY "generated_assets_update_creator" ON public.generated_assets
FOR UPDATE TO authenticated
USING (public.user_owns_project(project_id))
WITH CHECK (public.user_owns_project(project_id));

-- Creators can delete assets for their projects
CREATE POLICY "generated_assets_delete_creator" ON public.generated_assets
FOR DELETE TO authenticated
USING (public.user_owns_project(project_id));

-- Founders have full access to all generated assets
CREATE POLICY "generated_assets_all_founder" ON public.generated_assets
FOR ALL TO authenticated
USING (public.is_founder())
WITH CHECK (public.is_founder());

-- -------------------------------------------------------------------------------------
-- PLATFORM_MANDATES TABLE POLICIES (Founder-only access)
-- -------------------------------------------------------------------------------------

-- Drop existing policies
DROP POLICY IF EXISTS "platform_mandates_founder_only" ON public.platform_mandates;

-- Only founders can access platform mandates (full CRUD)
CREATE POLICY "platform_mandates_founder_only" ON public.platform_mandates
FOR ALL TO authenticated
USING (public.is_founder())
WITH CHECK (public.is_founder());

-- -------------------------------------------------------------------------------------
-- DEAL_PIPELINE TABLE POLICIES (Founder-only access)
-- -------------------------------------------------------------------------------------

-- Drop existing policies
DROP POLICY IF EXISTS "deal_pipeline_founder_only" ON public.deal_pipeline;

-- Only founders can access deal pipeline (full CRUD)
CREATE POLICY "deal_pipeline_founder_only" ON public.deal_pipeline
FOR ALL TO authenticated
USING (public.is_founder())
WITH CHECK (public.is_founder());

-- -------------------------------------------------------------------------------------
-- INGESTIONS TABLE POLICIES (User owns ingestions directly)
-- -------------------------------------------------------------------------------------

-- Drop existing policies
DROP POLICY IF EXISTS "ingestions_select_creator" ON public.ingestions;
DROP POLICY IF EXISTS "ingestions_insert_creator" ON public.ingestions;
DROP POLICY IF EXISTS "ingestions_update_creator" ON public.ingestions;
DROP POLICY IF EXISTS "ingestions_delete_creator" ON public.ingestions;
DROP POLICY IF EXISTS "ingestions_all_founder" ON public.ingestions;

-- Creators can view their own ingestions
CREATE POLICY "ingestions_select_creator" ON public.ingestions
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Creators can insert their own ingestions
CREATE POLICY "ingestions_insert_creator" ON public.ingestions
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Creators can update their own ingestions
CREATE POLICY "ingestions_update_creator" ON public.ingestions
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Creators can delete their own ingestions
CREATE POLICY "ingestions_delete_creator" ON public.ingestions
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Founders have full access to all ingestions
CREATE POLICY "ingestions_all_founder" ON public.ingestions
FOR ALL TO authenticated
USING (public.is_founder())
WITH CHECK (public.is_founder());

-- -------------------------------------------------------------------------------------
-- INGESTION_STEPS TABLE POLICIES (Access via ingestion ownership)
-- -------------------------------------------------------------------------------------

-- Drop existing policies
DROP POLICY IF EXISTS "ingestion_steps_select_creator" ON public.ingestion_steps;
DROP POLICY IF EXISTS "ingestion_steps_insert_creator" ON public.ingestion_steps;
DROP POLICY IF EXISTS "ingestion_steps_update_creator" ON public.ingestion_steps;
DROP POLICY IF EXISTS "ingestion_steps_delete_creator" ON public.ingestion_steps;
DROP POLICY IF EXISTS "ingestion_steps_all_founder" ON public.ingestion_steps;

-- Creators can view steps for their ingestions
CREATE POLICY "ingestion_steps_select_creator" ON public.ingestion_steps
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ingestions
    WHERE ingestions.id = ingestion_steps.ingestion_id
    AND ingestions.user_id = auth.uid()
  )
);

-- Creators can insert steps for their ingestions
CREATE POLICY "ingestion_steps_insert_creator" ON public.ingestion_steps
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ingestions
    WHERE ingestions.id = ingestion_steps.ingestion_id
    AND ingestions.user_id = auth.uid()
  )
);

-- Creators can update steps for their ingestions
CREATE POLICY "ingestion_steps_update_creator" ON public.ingestion_steps
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ingestions
    WHERE ingestions.id = ingestion_steps.ingestion_id
    AND ingestions.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ingestions
    WHERE ingestions.id = ingestion_steps.ingestion_id
    AND ingestions.user_id = auth.uid()
  )
);

-- Creators can delete steps for their ingestions
CREATE POLICY "ingestion_steps_delete_creator" ON public.ingestion_steps
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ingestions
    WHERE ingestions.id = ingestion_steps.ingestion_id
    AND ingestions.user_id = auth.uid()
  )
);

-- Founders have full access to all ingestion steps
CREATE POLICY "ingestion_steps_all_founder" ON public.ingestion_steps
FOR ALL TO authenticated
USING (public.is_founder())
WITH CHECK (public.is_founder());

-- -------------------------------------------------------------------------------------
-- PACKAGES TABLE POLICIES (Access via ingestion ownership)
-- -------------------------------------------------------------------------------------

-- Drop existing policies
DROP POLICY IF EXISTS "packages_select_creator" ON public.packages;
DROP POLICY IF EXISTS "packages_insert_creator" ON public.packages;
DROP POLICY IF EXISTS "packages_update_creator" ON public.packages;
DROP POLICY IF EXISTS "packages_delete_creator" ON public.packages;
DROP POLICY IF EXISTS "packages_all_founder" ON public.packages;

-- Creators can view packages for their ingestions
CREATE POLICY "packages_select_creator" ON public.packages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ingestions
    WHERE ingestions.id = packages.ingestion_id
    AND ingestions.user_id = auth.uid()
  )
);

-- Creators can insert packages for their ingestions
CREATE POLICY "packages_insert_creator" ON public.packages
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ingestions
    WHERE ingestions.id = packages.ingestion_id
    AND ingestions.user_id = auth.uid()
  )
);

-- Creators can update packages for their ingestions
CREATE POLICY "packages_update_creator" ON public.packages
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ingestions
    WHERE ingestions.id = packages.ingestion_id
    AND ingestions.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ingestions
    WHERE ingestions.id = packages.ingestion_id
    AND ingestions.user_id = auth.uid()
  )
);

-- Creators can delete packages for their ingestions
CREATE POLICY "packages_delete_creator" ON public.packages
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ingestions
    WHERE ingestions.id = packages.ingestion_id
    AND ingestions.user_id = auth.uid()
  )
);

-- Founders have full access to all packages
CREATE POLICY "packages_all_founder" ON public.packages
FOR ALL TO authenticated
USING (public.is_founder())
WITH CHECK (public.is_founder());

-- =====================================================================================
-- PHASE 4: SERVICE ROLE POLICIES (For backend operations)
-- =====================================================================================

-- Service role needs full access for backend operations
CREATE POLICY "service_role_full_access_profiles" ON public.profiles
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_projects" ON public.projects
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_script_uploads" ON public.script_uploads
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_generated_assets" ON public.generated_assets
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_platform_mandates" ON public.platform_mandates
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_deal_pipeline" ON public.deal_pipeline
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_ingestions" ON public.ingestions
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_ingestion_steps" ON public.ingestion_steps
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_packages" ON public.packages
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================================
-- PHASE 5: VERIFICATION AND SUMMARY
-- =====================================================================================

-- Function to get policy summary for verification
CREATE OR REPLACE FUNCTION public.get_rls_summary()
RETURNS TABLE (
  table_name TEXT,
  rls_enabled BOOLEAN,
  policy_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.tablename::TEXT,
    t.rowsecurity,
    COUNT(p.policyname)
  FROM pg_tables t
  LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
  WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'profiles', 'projects', 'script_uploads', 'generated_assets',
    'platform_mandates', 'deal_pipeline', 'ingestions', 'ingestion_steps', 'packages'
  )
  GROUP BY t.tablename, t.rowsecurity
  ORDER BY t.tablename;
END;
$$;

-- Display summary
SELECT
  '=== RLS IMPLEMENTATION SUMMARY ===' as status,
  current_timestamp as completed_at;

SELECT * FROM public.get_rls_summary();

-- =====================================================================================
-- COMPLETED: COMPREHENSIVE RLS IMPLEMENTATION
-- =====================================================================================
--
-- SUMMARY OF POLICIES CREATED:
--
-- 1. PROFILES: Own profile access + founder views all
-- 2. PROJECTS: Owner access + founder full access
-- 3. SCRIPT_UPLOADS: Project-based access + founder full access
-- 4. GENERATED_ASSETS: Project-based access + founder full access
-- 5. PLATFORM_MANDATES: Founder-only access
-- 6. DEAL_PIPELINE: Founder-only access
-- 7. INGESTIONS: Owner access + founder full access
-- 8. INGESTION_STEPS: Ingestion-based access + founder full access
-- 9. PACKAGES: Ingestion-based access + founder full access
-- 10. SERVICE_ROLE: Full access to all tables for backend operations
--
-- TOTAL POLICIES: ~35+ policies across 9 tables
-- ROLES SUPPORTED: creator, founder, service_role
--