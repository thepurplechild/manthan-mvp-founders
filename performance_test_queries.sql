-- Performance Testing and Index Verification for platform_mandates and deal_pipeline
-- Run this after migration and sample data insertion to verify performance

-- =============================================
-- INDEX VERIFICATION AND PERFORMANCE ANALYSIS
-- =============================================

-- Test 1: Verify all expected indexes exist
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('platform_mandates', 'deal_pipeline')
ORDER BY tablename, indexname;

-- Expected indexes:
-- platform_mandates: idx_platform_mandates_platform_name, idx_platform_mandates_tags (GIN), idx_platform_mandates_source, idx_platform_mandates_created_by
-- deal_pipeline: idx_deal_pipeline_project_id, idx_deal_pipeline_status, idx_deal_pipeline_tags (GIN), idx_deal_pipeline_source, idx_deal_pipeline_target_buyer, idx_deal_pipeline_priority, idx_deal_pipeline_expected_decision

-- =============================================
-- QUERY PERFORMANCE TESTS WITH EXPLAIN ANALYZE
-- =============================================

-- Test 2: Platform name search performance (should use index)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.platform_mandates
WHERE platform_name ILIKE '%netflix%';

-- Test 3: Tag search performance (should use GIN index)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.platform_mandates
WHERE tags && ARRAY['regional', 'family-drama'];

-- Test 4: Source-based filtering performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.platform_mandates
WHERE source ILIKE '%networking%';

-- Test 5: Deal pipeline project lookup (should use index)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.deal_pipeline
WHERE project_id = (SELECT id FROM public.projects LIMIT 1);

-- Test 6: Deal status filtering (should use index)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.deal_pipeline
WHERE status IN ('in_discussion', 'under_review');

-- Test 7: Deal pipeline tag search (should use GIN index)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.deal_pipeline
WHERE tags && ARRAY['streaming', 'netflix'];

-- Test 8: Target buyer search (should use index)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.deal_pipeline
WHERE target_buyer_name ILIKE '%netflix%';

-- Test 9: Priority-based queries (should use index)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.deal_pipeline
WHERE priority_level = 'high'
ORDER BY deal_value_estimate DESC;

-- Test 10: Date range queries (should use index)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.deal_pipeline
WHERE expected_decision_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days';

-- =============================================
-- COMPLEX JOIN PERFORMANCE TESTS
-- =============================================

-- Test 11: Join performance between deals and projects
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  dp.target_buyer_name,
  dp.status,
  dp.deal_value_estimate,
  p.title,
  p.genre
FROM public.deal_pipeline dp
JOIN public.projects p ON dp.project_id = p.id
WHERE dp.status = 'in_discussion'
AND p.genre && ARRAY['drama'];

-- Test 12: Complex aggregation performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  status,
  priority_level,
  COUNT(*) as deal_count,
  AVG(probability_score) as avg_probability,
  SUM(deal_value_estimate) as total_value
FROM public.deal_pipeline
WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY status, priority_level
ORDER BY total_value DESC;

-- Test 13: Tag overlap analysis performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  pm.platform_name,
  dp.target_buyer_name,
  array_length(
    (SELECT array_agg(DISTINCT tag)
     FROM unnest(pm.tags) AS tag
     WHERE tag = ANY(dp.tags)), 1
  ) as tag_overlap_count
FROM public.platform_mandates pm
CROSS JOIN public.deal_pipeline dp
WHERE pm.tags && dp.tags
ORDER BY tag_overlap_count DESC;

-- =============================================
-- FUNCTION PERFORMANCE TESTS
-- =============================================

-- Test 14: Helper function performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.fn_search_mandates_by_tags(ARRAY['regional', 'family-drama', 'netflix']);

-- Test 15: Pipeline summary function performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.fn_get_deal_pipeline_summary(
  (SELECT id FROM public.projects LIMIT 1)
);

-- Test 16: Platform search function performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.fn_get_platform_mandates('Prime');

-- =============================================
-- MATERIALIZED VIEW PERFORMANCE
-- =============================================

-- Test 17: Materialized view query performance
REFRESH MATERIALIZED VIEW public.mv_deal_pipeline_analytics;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.mv_deal_pipeline_analytics
WHERE status = 'in_discussion'
ORDER BY total_estimated_value DESC;

-- =============================================
-- STRESS TEST SCENARIOS
-- =============================================

-- Test 18: Large dataset simulation queries
-- (These would be relevant with larger datasets)

-- Simulate filtering with multiple conditions
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  pm.platform_name,
  pm.mandate_description,
  pm.tags
FROM public.platform_mandates pm
WHERE pm.platform_name ILIKE '%amazon%'
AND pm.tags && ARRAY['regional']
AND pm.source IS NOT NULL
AND pm.created_at >= CURRENT_DATE - INTERVAL '1 year';

-- Simulate complex deal pipeline analytics
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  target_buyer_name,
  COUNT(*) as total_deals,
  AVG(probability_score) as avg_probability,
  SUM(deal_value_estimate) as total_pipeline_value,
  SUM(CASE WHEN status IN ('deal_closed', 'contract_signed') THEN deal_value_estimate ELSE 0 END) as closed_value,
  COUNT(CASE WHEN status = 'passed' THEN 1 END) as passed_count
FROM public.deal_pipeline
WHERE created_at >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY target_buyer_name
HAVING COUNT(*) >= 1
ORDER BY total_pipeline_value DESC;

-- =============================================
-- INDEX USAGE STATISTICS
-- =============================================

-- Test 19: Check index usage statistics (requires pg_stat_user_indexes)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND tablename IN ('platform_mandates', 'deal_pipeline')
ORDER BY idx_scan DESC;

-- Test 20: Table scan statistics
SELECT
  schemaname,
  tablename,
  seq_scan as sequential_scans,
  seq_tup_read as sequential_tuples_read,
  idx_scan as index_scans,
  idx_tup_fetch as index_tuples_fetched,
  n_tup_ins as inserts,
  n_tup_upd as updates,
  n_tup_del as deletes
FROM pg_stat_user_tables
WHERE schemaname = 'public'
AND tablename IN ('platform_mandates', 'deal_pipeline');

-- =============================================
-- PERFORMANCE OPTIMIZATION RECOMMENDATIONS
-- =============================================

-- Test 21: Identify missing indexes (if any)
-- This query helps identify columns that might benefit from additional indexes

SELECT
  schemaname,
  tablename,
  attname as column_name,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
AND tablename IN ('platform_mandates', 'deal_pipeline')
AND n_distinct > 10  -- Columns with good selectivity
ORDER BY tablename, n_distinct DESC;

-- Test 22: Check for bloated tables (useful for maintenance)
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('platform_mandates', 'deal_pipeline');

-- =============================================
-- PERFORMANCE BENCHMARKING QUERIES
-- =============================================

-- Test 23: Benchmark tag search performance across different tag combinations
DO $$
DECLARE
  start_time timestamp;
  end_time timestamp;
  execution_time interval;
BEGIN
  -- Test single tag search
  start_time := clock_timestamp();
  PERFORM COUNT(*) FROM public.platform_mandates WHERE tags && ARRAY['regional'];
  end_time := clock_timestamp();
  execution_time := end_time - start_time;
  RAISE NOTICE 'Single tag search time: %', execution_time;

  -- Test multiple tag search
  start_time := clock_timestamp();
  PERFORM COUNT(*) FROM public.platform_mandates WHERE tags && ARRAY['regional', 'family-drama'];
  end_time := clock_timestamp();
  execution_time := end_time - start_time;
  RAISE NOTICE 'Multiple tag search time: %', execution_time;

  -- Test complex tag query
  start_time := clock_timestamp();
  PERFORM COUNT(*) FROM public.platform_mandates WHERE tags @> ARRAY['regional'] AND tags && ARRAY['netflix', 'prime'];
  end_time := clock_timestamp();
  execution_time := end_time - start_time;
  RAISE NOTICE 'Complex tag query time: %', execution_time;
END $$;

-- =============================================
-- PERFORMANCE SUMMARY REPORT
-- =============================================

-- Test 24: Generate performance summary
SELECT
  'Performance Test Summary' as report_section,
  'Run the above EXPLAIN ANALYZE queries to verify:' as instructions,
  '1. All queries use appropriate indexes' as check_1,
  '2. No sequential scans on large tables' as check_2,
  '3. GIN indexes are used for array operations' as check_3,
  '4. Join operations are efficient' as check_4,
  '5. Function calls are optimized' as check_5;

-- Expected Performance Characteristics:
-- - Platform name searches: Should use btree index, execution time < 1ms
-- - Tag searches: Should use GIN index, execution time < 5ms
-- - Project lookups: Should use foreign key index, execution time < 1ms
-- - Status filtering: Should use btree index, execution time < 1ms
-- - Date range queries: Should use btree index, execution time < 5ms
-- - Complex joins: Should complete in < 50ms with proper indexing

COMMIT;