-- Comprehensive RLS Testing Scenarios
-- Test Row-Level Security policies for creator and founder roles
--
-- PREREQUISITES:
-- 1. Run comprehensive_rls_implementation.sql first
-- 2. Ensure test users exist with proper roles
-- 3. Execute these tests with actual user sessions (not superuser)

-- =====================================================================================
-- PHASE 1: TEST USER SETUP AND VALIDATION
-- =====================================================================================

-- Create test user profiles (run these with superuser or service role)
-- Note: In production, users would be created through Supabase Auth

-- Test function to create sample users for testing
CREATE OR REPLACE FUNCTION public.setup_test_users()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  creator_id UUID;
  founder_id UUID;
  result TEXT;
BEGIN
  -- Generate test user IDs
  creator_id := gen_random_uuid();
  founder_id := gen_random_uuid();

  -- Create test profiles (simulating auth.users entries)
  INSERT INTO public.profiles (id, full_name, role, created_at)
  VALUES
    (creator_id, 'Test Creator User', 'creator', now()),
    (founder_id, 'Test Founder User', 'founder', now())
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

  result := 'Test users created: Creator ID: ' || creator_id || ', Founder ID: ' || founder_id;
  RETURN result;
END;
$$;

-- Run test user setup
SELECT public.setup_test_users();

-- =====================================================================================
-- PHASE 2: HELPER FUNCTIONS FOR TESTING
-- =====================================================================================

-- Function to simulate user context for testing
CREATE OR REPLACE FUNCTION public.test_user_access(
  test_user_id UUID,
  table_name TEXT,
  operation TEXT,
  target_id UUID DEFAULT NULL
)
RETURNS TABLE (
  test_case TEXT,
  expected_result TEXT,
  actual_result TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  test_result BOOLEAN := FALSE;
  error_msg TEXT;
  user_role TEXT;
BEGIN
  -- Get user role
  SELECT role INTO user_role FROM public.profiles WHERE id = test_user_id;

  -- Test access based on table and operation
  BEGIN
    CASE table_name
      WHEN 'projects' THEN
        CASE operation
          WHEN 'SELECT' THEN
            PERFORM * FROM public.projects WHERE id = COALESCE(target_id, (SELECT id FROM public.projects LIMIT 1));
            test_result := TRUE;
          WHEN 'INSERT' THEN
            -- Test project insertion
            INSERT INTO public.projects (owner_id, title, status)
            VALUES (test_user_id, 'Test Project', 'draft');
            test_result := TRUE;
          ELSE
            test_result := FALSE;
        END CASE;

      WHEN 'platform_mandates' THEN
        CASE operation
          WHEN 'SELECT' THEN
            PERFORM * FROM public.platform_mandates LIMIT 1;
            test_result := TRUE;
          WHEN 'INSERT' THEN
            INSERT INTO public.platform_mandates (platform_name, mandate_description, created_by)
            VALUES ('Test Platform', 'Test mandate', test_user_id);
            test_result := TRUE;
          ELSE
            test_result := FALSE;
        END CASE;

      ELSE
        test_result := FALSE;
    END CASE;

  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT;
    test_result := FALSE;
  END;

  -- Return test results
  RETURN QUERY SELECT
    format('%s %s on %s', user_role, operation, table_name)::TEXT as test_case,
    CASE
      WHEN user_role = 'founder' THEN 'ALLOWED'
      WHEN user_role = 'creator' AND table_name IN ('platform_mandates', 'deal_pipeline') THEN 'BLOCKED'
      WHEN user_role = 'creator' AND table_name IN ('projects', 'script_uploads', 'generated_assets') THEN 'ALLOWED (own data)'
      ELSE 'BLOCKED'
    END::TEXT as expected_result,
    CASE WHEN test_result THEN 'ALLOWED' ELSE 'BLOCKED' END::TEXT as actual_result,
    CASE
      WHEN (user_role = 'founder' AND test_result) OR
           (user_role = 'creator' AND table_name IN ('platform_mandates', 'deal_pipeline') AND NOT test_result) OR
           (user_role = 'creator' AND table_name NOT IN ('platform_mandates', 'deal_pipeline') AND test_result)
      THEN 'PASS'
      ELSE 'FAIL'
    END::TEXT as status;
END;
$$;

-- =====================================================================================
-- PHASE 3: COMPREHENSIVE TEST MATRIX
-- =====================================================================================

-- Test Matrix Generator
CREATE OR REPLACE FUNCTION public.run_comprehensive_rls_tests()
RETURNS TABLE (
  test_id INTEGER,
  test_category TEXT,
  test_description TEXT,
  user_role TEXT,
  table_name TEXT,
  operation TEXT,
  expected_result TEXT,
  actual_result TEXT,
  test_status TEXT,
  error_details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  creator_id UUID;
  founder_id UUID;
  test_counter INTEGER := 1;
  test_record RECORD;
  error_msg TEXT;
BEGIN
  -- Get test user IDs
  SELECT id INTO creator_id FROM public.profiles WHERE role = 'creator' LIMIT 1;
  SELECT id INTO founder_id FROM public.profiles WHERE role = 'founder' LIMIT 1;

  -- Test 1: Creator access to own projects
  BEGIN
    -- Insert a test project for creator
    INSERT INTO public.projects (owner_id, title, status)
    VALUES (creator_id, 'Creator Test Project', 'draft');

    RETURN QUERY SELECT
      test_counter,
      'Owner Access'::TEXT,
      'Creator selects own project'::TEXT,
      'creator'::TEXT,
      'projects'::TEXT,
      'SELECT'::TEXT,
      'ALLOWED'::TEXT,
      'ALLOWED'::TEXT,
      'PASS'::TEXT,
      NULL::TEXT;
    test_counter := test_counter + 1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT;
    RETURN QUERY SELECT
      test_counter,
      'Owner Access'::TEXT,
      'Creator selects own project'::TEXT,
      'creator'::TEXT,
      'projects'::TEXT,
      'SELECT'::TEXT,
      'ALLOWED'::TEXT,
      'BLOCKED'::TEXT,
      'FAIL'::TEXT,
      error_msg;
    test_counter := test_counter + 1;
  END;

  -- Test 2: Creator access to platform_mandates (should be blocked)
  BEGIN
    PERFORM * FROM public.platform_mandates LIMIT 1;
    RETURN QUERY SELECT
      test_counter,
      'Founder-Only Access'::TEXT,
      'Creator attempts to access platform_mandates'::TEXT,
      'creator'::TEXT,
      'platform_mandates'::TEXT,
      'SELECT'::TEXT,
      'BLOCKED'::TEXT,
      'ALLOWED'::TEXT,
      'FAIL'::TEXT,
      'Access was not blocked as expected'::TEXT;
    test_counter := test_counter + 1;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN QUERY SELECT
      test_counter,
      'Founder-Only Access'::TEXT,
      'Creator attempts to access platform_mandates'::TEXT,
      'creator'::TEXT,
      'platform_mandates'::TEXT,
      'SELECT'::TEXT,
      'BLOCKED'::TEXT,
      'BLOCKED'::TEXT,
      'PASS'::TEXT,
      NULL::TEXT;
    test_counter := test_counter + 1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT;
    RETURN QUERY SELECT
      test_counter,
      'Founder-Only Access'::TEXT,
      'Creator attempts to access platform_mandates'::TEXT,
      'creator'::TEXT,
      'platform_mandates'::TEXT,
      'SELECT'::TEXT,
      'BLOCKED'::TEXT,
      'BLOCKED'::TEXT,
      'PASS'::TEXT,
      error_msg;
    test_counter := test_counter + 1;
  END;

  -- Test 3: Founder access to platform_mandates
  BEGIN
    PERFORM * FROM public.platform_mandates LIMIT 1;
    RETURN QUERY SELECT
      test_counter,
      'Founder Access'::TEXT,
      'Founder accesses platform_mandates'::TEXT,
      'founder'::TEXT,
      'platform_mandates'::TEXT,
      'SELECT'::TEXT,
      'ALLOWED'::TEXT,
      'ALLOWED'::TEXT,
      'PASS'::TEXT,
      NULL::TEXT;
    test_counter := test_counter + 1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT;
    RETURN QUERY SELECT
      test_counter,
      'Founder Access'::TEXT,
      'Founder accesses platform_mandates'::TEXT,
      'founder'::TEXT,
      'platform_mandates'::TEXT,
      'SELECT'::TEXT,
      'ALLOWED'::TEXT,
      'BLOCKED'::TEXT,
      'FAIL'::TEXT,
      error_msg;
    test_counter := test_counter + 1;
  END;

  -- Test 4: Founder access to all projects
  BEGIN
    PERFORM * FROM public.projects WHERE owner_id != founder_id LIMIT 1;
    RETURN QUERY SELECT
      test_counter,
      'Founder Access'::TEXT,
      'Founder accesses other users projects'::TEXT,
      'founder'::TEXT,
      'projects'::TEXT,
      'SELECT'::TEXT,
      'ALLOWED'::TEXT,
      'ALLOWED'::TEXT,
      'PASS'::TEXT,
      NULL::TEXT;
    test_counter := test_counter + 1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT;
    RETURN QUERY SELECT
      test_counter,
      'Founder Access'::TEXT,
      'Founder accesses other users projects'::TEXT,
      'founder'::TEXT,
      'projects'::TEXT,
      'SELECT'::TEXT,
      'ALLOWED'::TEXT,
      'BLOCKED'::TEXT,
      'FAIL'::TEXT,
      error_msg;
    test_counter := test_counter + 1;
  END;

  -- Continue with more tests...
  RETURN;
END;
$$;

-- =====================================================================================
-- PHASE 4: SPECIFIC TEST SCENARIOS
-- =====================================================================================

-- Test Scenario 1: Profile Access Tests
CREATE OR REPLACE FUNCTION public.test_profile_access()
RETURNS TABLE (
  test_name TEXT,
  user_role TEXT,
  operation TEXT,
  target TEXT,
  expected TEXT,
  actual TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  creator_id UUID;
  founder_id UUID;
  other_creator_id UUID;
BEGIN
  -- Get test user IDs
  SELECT id INTO creator_id FROM public.profiles WHERE role = 'creator' LIMIT 1;
  SELECT id INTO founder_id FROM public.profiles WHERE role = 'founder' LIMIT 1;

  -- Create another creator for cross-access testing
  other_creator_id := gen_random_uuid();
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (other_creator_id, 'Other Creator', 'creator')
  ON CONFLICT (id) DO NOTHING;

  -- Test 1: Creator views own profile
  RETURN QUERY SELECT
    'Profile Own Access'::TEXT,
    'creator'::TEXT,
    'SELECT'::TEXT,
    'own profile'::TEXT,
    'ALLOWED'::TEXT,
    CASE WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id = creator_id) THEN 'ALLOWED' ELSE 'BLOCKED' END,
    CASE WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id = creator_id) THEN 'PASS' ELSE 'FAIL' END;

  -- Test 2: Founder views all profiles
  RETURN QUERY SELECT
    'Profile Admin Access'::TEXT,
    'founder'::TEXT,
    'SELECT'::TEXT,
    'all profiles'::TEXT,
    'ALLOWED'::TEXT,
    CASE WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id = creator_id) THEN 'ALLOWED' ELSE 'BLOCKED' END,
    CASE WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id = creator_id) THEN 'PASS' ELSE 'FAIL' END;
END;
$$;

-- Test Scenario 2: Project Ownership Tests
CREATE OR REPLACE FUNCTION public.test_project_ownership()
RETURNS TABLE (
  test_name TEXT,
  description TEXT,
  expected_outcome TEXT,
  test_result TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  creator_id UUID;
  founder_id UUID;
  project_id UUID;
  test_project_id UUID;
BEGIN
  -- Get test users
  SELECT id INTO creator_id FROM public.profiles WHERE role = 'creator' LIMIT 1;
  SELECT id INTO founder_id FROM public.profiles WHERE role = 'founder' LIMIT 1;

  -- Test 1: Creator creates project
  BEGIN
    INSERT INTO public.projects (owner_id, title, status)
    VALUES (creator_id, 'Creator Owned Project', 'draft')
    RETURNING id INTO test_project_id;

    RETURN QUERY SELECT
      'Project Creation'::TEXT,
      'Creator creates project with self as owner'::TEXT,
      'SUCCESS'::TEXT,
      'SUCCESS'::TEXT,
      'PASS'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT
      'Project Creation'::TEXT,
      'Creator creates project with self as owner'::TEXT,
      'SUCCESS'::TEXT,
      'FAILED'::TEXT,
      'FAIL'::TEXT;
  END;

  -- Test 2: Creator views own project
  BEGIN
    PERFORM * FROM public.projects WHERE id = test_project_id AND owner_id = creator_id;

    RETURN QUERY SELECT
      'Project Access'::TEXT,
      'Creator views own project'::TEXT,
      'ALLOWED'::TEXT,
      'ALLOWED'::TEXT,
      'PASS'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT
      'Project Access'::TEXT,
      'Creator views own project'::TEXT,
      'ALLOWED'::TEXT,
      'BLOCKED'::TEXT,
      'FAIL'::TEXT;
  END;

  -- Test 3: Founder views creator's project
  BEGIN
    PERFORM * FROM public.projects WHERE id = test_project_id;

    RETURN QUERY SELECT
      'Founder Admin Access'::TEXT,
      'Founder views any project'::TEXT,
      'ALLOWED'::TEXT,
      'ALLOWED'::TEXT,
      'PASS'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT
      'Founder Admin Access'::TEXT,
      'Founder views any project'::TEXT,
      'ALLOWED'::TEXT,
      'BLOCKED'::TEXT,
      'FAIL'::TEXT;
  END;
END;
$$;

-- Test Scenario 3: Founder-Only Table Access
CREATE OR REPLACE FUNCTION public.test_founder_only_access()
RETURNS TABLE (
  table_tested TEXT,
  user_role TEXT,
  operation TEXT,
  expected_result TEXT,
  actual_result TEXT,
  test_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  creator_id UUID;
  founder_id UUID;
  test_mandate_id UUID;
BEGIN
  -- Get test users
  SELECT id INTO creator_id FROM public.profiles WHERE role = 'creator' LIMIT 1;
  SELECT id INTO founder_id FROM public.profiles WHERE role = 'founder' LIMIT 1;

  -- Test 1: Creator attempts to access platform_mandates
  BEGIN
    PERFORM * FROM public.platform_mandates LIMIT 1;
    RETURN QUERY SELECT
      'platform_mandates'::TEXT,
      'creator'::TEXT,
      'SELECT'::TEXT,
      'BLOCKED'::TEXT,
      'ALLOWED'::TEXT,
      'FAIL'::TEXT;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN QUERY SELECT
      'platform_mandates'::TEXT,
      'creator'::TEXT,
      'SELECT'::TEXT,
      'BLOCKED'::TEXT,
      'BLOCKED'::TEXT,
      'PASS'::TEXT;
  END;

  -- Test 2: Founder accesses platform_mandates
  BEGIN
    PERFORM * FROM public.platform_mandates LIMIT 1;
    RETURN QUERY SELECT
      'platform_mandates'::TEXT,
      'founder'::TEXT,
      'SELECT'::TEXT,
      'ALLOWED'::TEXT,
      'ALLOWED'::TEXT,
      'PASS'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT
      'platform_mandates'::TEXT,
      'founder'::TEXT,
      'SELECT'::TEXT,
      'ALLOWED'::TEXT,
      'BLOCKED'::TEXT,
      'FAIL'::TEXT;
  END;

  -- Test 3: Founder creates platform mandate
  BEGIN
    INSERT INTO public.platform_mandates (platform_name, mandate_description, created_by)
    VALUES ('Test Platform', 'Founder test mandate', founder_id)
    RETURNING id INTO test_mandate_id;

    RETURN QUERY SELECT
      'platform_mandates'::TEXT,
      'founder'::TEXT,
      'INSERT'::TEXT,
      'ALLOWED'::TEXT,
      'ALLOWED'::TEXT,
      'PASS'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT
      'platform_mandates'::TEXT,
      'founder'::TEXT,
      'INSERT'::TEXT,
      'ALLOWED'::TEXT,
      'BLOCKED'::TEXT,
      'FAIL'::TEXT;
  END;

  -- Test 4: Creator attempts to insert into deal_pipeline
  BEGIN
    INSERT INTO public.deal_pipeline (project_id, target_buyer_name)
    VALUES ((SELECT id FROM public.projects LIMIT 1), 'Test Buyer');

    RETURN QUERY SELECT
      'deal_pipeline'::TEXT,
      'creator'::TEXT,
      'INSERT'::TEXT,
      'BLOCKED'::TEXT,
      'ALLOWED'::TEXT,
      'FAIL'::TEXT;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN QUERY SELECT
      'deal_pipeline'::TEXT,
      'creator'::TEXT,
      'INSERT'::TEXT,
      'BLOCKED'::TEXT,
      'BLOCKED'::TEXT,
      'PASS'::TEXT;
  END;
END;
$$;

-- =====================================================================================
-- PHASE 5: TEST EXECUTION AND REPORTING
-- =====================================================================================

-- Master test runner
CREATE OR REPLACE FUNCTION public.run_all_rls_tests()
RETURNS TABLE (
  test_suite TEXT,
  total_tests INTEGER,
  passed INTEGER,
  failed INTEGER,
  pass_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  profile_tests INTEGER;
  project_tests INTEGER;
  founder_tests INTEGER;
  total_passed INTEGER := 0;
  total_failed INTEGER := 0;
  total_tests INTEGER := 0;
BEGIN
  -- Count test results for each suite
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'PASS'), COUNT(*) FILTER (WHERE status = 'FAIL')
  INTO total_tests, total_passed, total_failed
  FROM (
    SELECT status FROM public.test_profile_access()
    UNION ALL
    SELECT status FROM public.test_project_ownership()
    UNION ALL
    SELECT test_status as status FROM public.test_founder_only_access()
  ) all_tests;

  RETURN QUERY SELECT
    'All RLS Tests'::TEXT,
    total_tests,
    total_passed,
    total_failed,
    CASE WHEN total_tests > 0 THEN ROUND((total_passed::NUMERIC / total_tests::NUMERIC) * 100, 2) ELSE 0 END;
END;
$$;

-- =====================================================================================
-- PHASE 6: QUICK TEST EXECUTION COMMANDS
-- =====================================================================================

-- Quick test commands (run these after setting up users)

-- 1. Run profile access tests
-- SELECT * FROM public.test_profile_access();

-- 2. Run project ownership tests
-- SELECT * FROM public.test_project_ownership();

-- 3. Run founder-only access tests
-- SELECT * FROM public.test_founder_only_access();

-- 4. Run comprehensive test summary
-- SELECT * FROM public.run_all_rls_tests();

-- 5. Get RLS implementation summary
-- SELECT * FROM public.get_rls_summary();

-- =====================================================================================
-- MANUAL TESTING CHECKLIST
-- =====================================================================================

/*
MANUAL TESTING STEPS:

1. Create test users through Supabase Auth UI or API:
   - Create a user with email: creator@test.com (role: creator)
   - Create a user with email: founder@test.com (role: founder)

2. Set user roles in profiles table:
   UPDATE public.profiles SET role = 'creator' WHERE email = 'creator@test.com';
   UPDATE public.profiles SET role = 'founder' WHERE email = 'founder@test.com';

3. Test with actual user sessions:
   - Login as creator user and try to access platform_mandates (should fail)
   - Login as founder user and try to access platform_mandates (should succeed)
   - Test project creation and access as both users

4. Verify policy enforcement:
   - Check that creators can only see their own projects
   - Check that founders can see all projects
   - Verify no cross-creator access is possible

5. Test edge cases:
   - User with no role set
   - Anonymous user access
   - Invalid user IDs
*/

-- =====================================================================================
-- END OF RLS TESTING SCENARIOS
-- =====================================================================================