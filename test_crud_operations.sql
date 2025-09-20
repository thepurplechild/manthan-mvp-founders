-- Test CRUD Operations for platform_mandates and deal_pipeline tables
-- Run this after applying the migration to verify functionality

-- =============================================
-- PLATFORM MANDATES TABLE TESTS
-- =============================================

-- Test 1: Insert sample platform mandate
INSERT INTO public.platform_mandates (
  platform_name,
  mandate_description,
  tags,
  source,
  feedback_notes,
  created_by
) VALUES (
  'Amazon Prime Video India',
  'Seeking regional content with strong emotional storytelling. Focus on family dramas in Hindi and Tamil. Looking for 8-10 episode series format with high production values.',
  ARRAY['regional', 'family-drama', 'hindi', 'tamil', 'prime-video', 'emotional'],
  'Direct meeting with Content Head - Bangalore office',
  'Emphasized need for authentic regional flavors. Budget range mentioned: 20-30 Cr per series. Prefer established production houses.',
  (SELECT id FROM auth.users LIMIT 1)
) ON CONFLICT DO NOTHING;

-- Test 2: Query platform mandates
SELECT
  id,
  platform_name,
  mandate_description,
  tags,
  source,
  created_at
FROM public.platform_mandates
WHERE platform_name ILIKE '%amazon%'
ORDER BY created_at DESC;

-- Test 3: Update platform mandate
UPDATE public.platform_mandates
SET
  feedback_notes = feedback_notes || ' Updated: Also interested in thriller genre.',
  tags = array_append(tags, 'thriller')
WHERE platform_name = 'Amazon Prime Video India';

-- Test 4: Search by tags using helper function
SELECT * FROM public.fn_search_mandates_by_tags(ARRAY['regional', 'family-drama']);

-- Test 5: Get mandates for specific platform using helper function
SELECT * FROM public.fn_get_platform_mandates('Prime');

-- =============================================
-- DEAL PIPELINE TABLE TESTS
-- =============================================

-- First, ensure we have a test project
INSERT INTO public.projects (
  owner_id,
  title,
  status,
  logline,
  synopsis,
  genre
) VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  'Test Movie Project for Pipeline',
  'development',
  'A heartwarming family drama set in rural India',
  'When a city-bred software engineer returns to his ancestral village, he discovers the importance of tradition and family bonds.',
  ARRAY['drama', 'family']
) ON CONFLICT DO NOTHING;

-- Test 6: Insert sample deal pipeline entries
INSERT INTO public.deal_pipeline (
  project_id,
  target_buyer_name,
  status,
  tags,
  source,
  feedback_notes,
  priority_level,
  expected_decision_date,
  contact_person,
  last_interaction_date,
  next_followup_date,
  deal_value_estimate,
  probability_score
) VALUES
(
  (SELECT id FROM public.projects WHERE title = 'Test Movie Project for Pipeline' LIMIT 1),
  'Netflix India Content Team',
  'in_discussion',
  ARRAY['streaming', 'regional', 'family-content'],
  'Industry networking event - Mumbai Film Festival',
  'Initial pitch went well. Requested detailed budget breakdown and shooting schedule.',
  'high',
  '2025-10-15',
  'Ravi Sharma - Content Acquisition Head',
  '2025-09-10',
  '2025-09-25',
  25000000.00,
  75
),
(
  (SELECT id FROM public.projects WHERE title = 'Test Movie Project for Pipeline' LIMIT 1),
  'Disney+ Hotstar Originals',
  'under_review',
  ARRAY['streaming', 'disney', 'originals'],
  'Cold outreach via LinkedIn',
  'Submitted complete package. Waiting for internal review process to complete.',
  'medium',
  '2025-10-30',
  'Priya Menon - Original Content Lead',
  '2025-09-01',
  '2025-10-01',
  18000000.00,
  60
),
(
  (SELECT id FROM public.projects WHERE title = 'Test Movie Project for Pipeline' LIMIT 1),
  'Sony Pictures India',
  'passed',
  ARRAY['theatrical', 'sony', 'distribution'],
  'Agent introduction',
  'Not a fit for current slate. Suggested reapproaching next quarter with different project.',
  'low',
  NULL,
  'Amit Kumar - Acquisitions Manager',
  '2025-08-20',
  NULL,
  NULL,
  0
) ON CONFLICT DO NOTHING;

-- Test 7: Query deal pipeline entries
SELECT
  dp.id,
  dp.target_buyer_name,
  dp.status,
  dp.tags,
  dp.priority_level,
  dp.probability_score,
  dp.deal_value_estimate,
  p.title as project_title
FROM public.deal_pipeline dp
JOIN public.projects p ON dp.project_id = p.id
ORDER BY dp.priority_level DESC, dp.probability_score DESC;

-- Test 8: Update deal status
UPDATE public.deal_pipeline
SET
  status = 'deal_closed',
  probability_score = 100,
  feedback_notes = feedback_notes || ' DEAL CLOSED: Contract signed on 2025-09-18.',
  last_interaction_date = CURRENT_DATE
WHERE target_buyer_name = 'Netflix India Content Team';

-- Test 9: Test deal pipeline summary function
SELECT * FROM public.fn_get_deal_pipeline_summary(
  (SELECT id FROM public.projects WHERE title = 'Test Movie Project for Pipeline' LIMIT 1)
);

-- Test 10: Query materialized view analytics
REFRESH MATERIALIZED VIEW public.mv_deal_pipeline_analytics;
SELECT * FROM public.mv_deal_pipeline_analytics
ORDER BY total_estimated_value DESC;

-- =============================================
-- ADVANCED QUERY TESTS
-- =============================================

-- Test 11: Complex join query - platforms and their matching deals
SELECT
  pm.platform_name,
  pm.mandate_description,
  pm.tags as mandate_tags,
  COUNT(dp.id) as matching_deals,
  AVG(dp.probability_score) as avg_probability,
  SUM(dp.deal_value_estimate) as total_pipeline_value
FROM public.platform_mandates pm
LEFT JOIN public.deal_pipeline dp ON pm.platform_name ILIKE '%' || SPLIT_PART(dp.target_buyer_name, ' ', 1) || '%'
GROUP BY pm.id, pm.platform_name, pm.mandate_description, pm.tags
ORDER BY matching_deals DESC;

-- Test 12: High-value deals analysis
SELECT
  dp.target_buyer_name,
  dp.status,
  dp.deal_value_estimate,
  dp.probability_score,
  (dp.deal_value_estimate * dp.probability_score / 100) as expected_value,
  p.title as project_title,
  p.genre
FROM public.deal_pipeline dp
JOIN public.projects p ON dp.project_id = p.id
WHERE dp.deal_value_estimate > 20000000
ORDER BY expected_value DESC;

-- Test 13: Pipeline performance by status
SELECT
  status,
  COUNT(*) as deal_count,
  AVG(probability_score) as avg_probability,
  SUM(deal_value_estimate) as total_value,
  AVG(EXTRACT(DAYS FROM (last_interaction_date - created_at))) as avg_days_in_status
FROM public.deal_pipeline
GROUP BY status
ORDER BY
  CASE status
    WHEN 'deal_closed' THEN 1
    WHEN 'contract_signed' THEN 2
    WHEN 'in_discussion' THEN 3
    WHEN 'under_review' THEN 4
    WHEN 'introduced' THEN 5
    WHEN 'passed' THEN 6
    ELSE 7
  END;

-- Test 14: Tag analysis across both tables
SELECT
  'platform_mandates' as table_name,
  unnest(tags) as tag,
  COUNT(*) as usage_count
FROM public.platform_mandates
GROUP BY unnest(tags)

UNION ALL

SELECT
  'deal_pipeline' as table_name,
  unnest(tags) as tag,
  COUNT(*) as usage_count
FROM public.deal_pipeline
GROUP BY unnest(tags)

ORDER BY usage_count DESC;

-- =============================================
-- CLEANUP TEST DATA (Optional)
-- =============================================

-- Uncomment the following lines to clean up test data:

-- DELETE FROM public.deal_pipeline WHERE target_buyer_name IN (
--   'Netflix India Content Team',
--   'Disney+ Hotstar Originals',
--   'Sony Pictures India'
-- );

-- DELETE FROM public.projects WHERE title = 'Test Movie Project for Pipeline';

-- DELETE FROM public.platform_mandates WHERE platform_name = 'Amazon Prime Video India';

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- Test 15: Verify table structures
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('platform_mandates', 'deal_pipeline')
ORDER BY table_name, ordinal_position;

-- Test 16: Verify indexes exist
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('platform_mandates', 'deal_pipeline')
ORDER BY tablename, indexname;

-- Test 17: Verify RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('platform_mandates', 'deal_pipeline')
ORDER BY tablename, policyname;

-- Test 18: Verify functions exist
SELECT
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE 'fn_%'
ORDER BY routine_name;

COMMIT;