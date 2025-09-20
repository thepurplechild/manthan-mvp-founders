# Platform Mandates & Deal Pipeline Schema Documentation

## Overview

This document provides comprehensive documentation for the `platform_mandates` and `deal_pipeline` tables implemented in the Manthan MVP Supabase database. These tables enable tracking of platform requirements and deal progression for content projects.

## Table Schemas

### Platform Mandates Table

The `platform_mandates` table stores market intelligence and content requirements from various streaming platforms and distributors.

```sql
CREATE TABLE public.platform_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT NOT NULL,
  mandate_description TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',           -- Blueprint requirement
  source TEXT,                        -- Blueprint requirement
  feedback_notes TEXT,                -- Blueprint requirement
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Column Descriptions

| Column | Type | Description | Blueprint Requirement |
|--------|------|-------------|----------------------|
| `id` | UUID | Primary key, auto-generated | - |
| `platform_name` | TEXT | Name of streaming platform/distributor (e.g., "Netflix India") | - |
| `mandate_description` | TEXT | Detailed description of platform's content requirements | - |
| `tags` | TEXT[] | Searchable tags for categorization and filtering | ✅ |
| `source` | TEXT | How the intelligence was obtained (e.g., "Industry event", "Direct meeting") | ✅ |
| `feedback_notes` | TEXT | Additional notes and feedback about the mandate | ✅ |
| `created_by` | UUID | Reference to the user who created the record | - |
| `created_at` | TIMESTAMPTZ | When the record was created | - |
| `updated_at` | TIMESTAMPTZ | When the record was last updated (auto-updated) | - |

### Deal Pipeline Table

The `deal_pipeline` table tracks the progression of content deals with various buyers and platforms.

```sql
CREATE TABLE public.deal_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_buyer_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'introduced' CHECK (...),
  tags TEXT[] DEFAULT '{}',           -- Blueprint requirement
  source TEXT,                        -- Blueprint requirement
  feedback_notes TEXT,                -- Blueprint requirement
  priority_level TEXT DEFAULT 'medium' CHECK (...),
  expected_decision_date DATE,
  contact_person TEXT,
  last_interaction_date DATE,
  next_followup_date DATE,
  deal_value_estimate NUMERIC(12,2),
  probability_score INTEGER CHECK (probability_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Column Descriptions

| Column | Type | Description | Blueprint Requirement |
|--------|------|-------------|----------------------|
| `id` | UUID | Primary key, auto-generated | - |
| `project_id` | UUID | Reference to the project being pitched | - |
| `target_buyer_name` | TEXT | Name of the buyer/studio being pitched | - |
| `status` | TEXT | Current deal status (enum constrained) | - |
| `tags` | TEXT[] | Searchable tags for categorization | ✅ |
| `source` | TEXT | Source of the lead/contact | ✅ |
| `feedback_notes` | TEXT | Feedback from buyer and deal notes | ✅ |
| `priority_level` | TEXT | Priority level (low, medium, high, urgent) | - |
| `expected_decision_date` | DATE | Expected date for buyer decision | - |
| `contact_person` | TEXT | Key contact at buyer organization | - |
| `last_interaction_date` | DATE | Date of last interaction | - |
| `next_followup_date` | DATE | Planned next followup date | - |
| `deal_value_estimate` | NUMERIC(12,2) | Estimated deal value in currency | - |
| `probability_score` | INTEGER | Success probability percentage (0-100) | - |
| `created_at` | TIMESTAMPTZ | When the record was created | - |
| `updated_at` | TIMESTAMPTZ | When the record was last updated | - |

#### Status Values

- `introduced` - Initial contact made
- `in_discussion` - Active negotiations
- `under_review` - Buyer reviewing proposal
- `passed` - Buyer declined
- `deal_closed` - Agreement reached
- `contract_signed` - Contract executed

#### Priority Levels

- `low` - Low priority opportunity
- `medium` - Standard priority (default)
- `high` - High priority opportunity
- `urgent` - Urgent/time-sensitive deal

## Indexes

### Platform Mandates Indexes

```sql
-- B-tree indexes for exact/range searches
CREATE INDEX idx_platform_mandates_platform_name ON public.platform_mandates(platform_name);
CREATE INDEX idx_platform_mandates_source ON public.platform_mandates(source);
CREATE INDEX idx_platform_mandates_created_by ON public.platform_mandates(created_by);

-- GIN index for array operations
CREATE INDEX idx_platform_mandates_tags ON public.platform_mandates USING GIN(tags);
```

### Deal Pipeline Indexes

```sql
-- B-tree indexes for exact/range searches
CREATE INDEX idx_deal_pipeline_project_id ON public.deal_pipeline(project_id);
CREATE INDEX idx_deal_pipeline_status ON public.deal_pipeline(status);
CREATE INDEX idx_deal_pipeline_source ON public.deal_pipeline(source);
CREATE INDEX idx_deal_pipeline_target_buyer ON public.deal_pipeline(target_buyer_name);
CREATE INDEX idx_deal_pipeline_priority ON public.deal_pipeline(priority_level);
CREATE INDEX idx_deal_pipeline_expected_decision ON public.deal_pipeline(expected_decision_date);

-- GIN index for array operations
CREATE INDEX idx_deal_pipeline_tags ON public.deal_pipeline USING GIN(tags);
```

## Security & Access Control

### Row Level Security (RLS)

Both tables have RLS enabled with founder-only access:

```sql
-- Only founders can access platform_mandates
CREATE POLICY platform_mandates_founder_all ON public.platform_mandates
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'founder'
  )
);

-- Only founders can access deal_pipeline
CREATE POLICY deal_pipeline_founder_all ON public.deal_pipeline
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'founder'
  )
);
```

### Service Role Access

Service role has full access for backend operations:

```sql
CREATE POLICY platform_mandates_service_all ON public.platform_mandates
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY deal_pipeline_service_all ON public.deal_pipeline
FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## Helper Functions

### 1. Search Platform Mandates by Tags

```sql
SELECT * FROM public.fn_search_mandates_by_tags(ARRAY['regional', 'family-drama']);
```

Returns platform mandates that have any of the specified tags, ordered by tag match count.

### 2. Get Platform Mandates by Platform Name

```sql
SELECT * FROM public.fn_get_platform_mandates('Netflix');
```

Returns all mandates for platforms matching the search term (case-insensitive).

### 3. Get Deal Pipeline Summary

```sql
SELECT * FROM public.fn_get_deal_pipeline_summary('project-uuid-here');
```

Returns aggregated statistics for a project's deal pipeline:
- Total leads
- Active discussions
- Closed deals
- Pass rate
- Average probability
- Estimated total value

## Usage Examples

### Basic CRUD Operations

#### Creating Platform Mandates

```sql
INSERT INTO public.platform_mandates (
  platform_name,
  mandate_description,
  tags,
  source,
  feedback_notes,
  created_by
) VALUES (
  'Netflix India',
  'Focus on regional content with strong family drama elements. Looking for 6-8 episode limited series format.',
  ARRAY['regional', 'family-drama', 'limited-series', 'netflix'],
  'Industry networking event - Mumbai',
  'Prefer Hindi/English bilingual content. Budget range 15-25 Cr per series.',
  auth.uid()
);
```

#### Creating Deal Pipeline Entries

```sql
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
  deal_value_estimate,
  probability_score
) VALUES (
  'project-uuid-here',
  'Amazon Prime Video India',
  'in_discussion',
  ARRAY['streaming', 'prime-video', 'regional'],
  'Direct meeting with content head',
  'Very interested in the concept. Requested full script and budget breakdown.',
  'high',
  '2025-10-15',
  'Rajesh Kumar - Content Acquisition',
  20000000.00,
  80
);
```

### Advanced Queries

#### Finding Platform Mandates with Specific Requirements

```sql
-- Find platforms looking for family dramas
SELECT
  platform_name,
  mandate_description,
  tags
FROM public.platform_mandates
WHERE tags && ARRAY['family-drama']
ORDER BY created_at DESC;
```

#### Deal Pipeline Analytics

```sql
-- Get high-value active deals
SELECT
  dp.target_buyer_name,
  dp.status,
  dp.deal_value_estimate,
  dp.probability_score,
  (dp.deal_value_estimate * dp.probability_score / 100) as expected_value,
  p.title as project_title
FROM public.deal_pipeline dp
JOIN public.projects p ON dp.project_id = p.id
WHERE dp.status IN ('in_discussion', 'under_review')
AND dp.deal_value_estimate > 10000000
ORDER BY expected_value DESC;
```

#### Cross-Reference Platform Mandates with Deal Pipeline

```sql
-- Find deals that align with platform mandates
SELECT
  pm.platform_name,
  pm.mandate_description,
  dp.target_buyer_name,
  dp.status,
  dp.feedback_notes,
  array_length(
    (SELECT array_agg(DISTINCT tag)
     FROM unnest(pm.tags) AS tag
     WHERE tag = ANY(dp.tags)), 1
  ) as tag_alignment_count
FROM public.platform_mandates pm
JOIN public.deal_pipeline dp ON pm.platform_name ILIKE '%' || SPLIT_PART(dp.target_buyer_name, ' ', 1) || '%'
WHERE pm.tags && dp.tags
ORDER BY tag_alignment_count DESC;
```

### Performance Optimization Queries

#### Tag-based Searches (Use GIN Indexes)

```sql
-- Efficient tag searches using && operator
SELECT * FROM public.platform_mandates
WHERE tags && ARRAY['regional', 'streaming'];

-- Contains all tags using @> operator
SELECT * FROM public.platform_mandates
WHERE tags @> ARRAY['regional', 'family-drama'];
```

#### Date Range Queries

```sql
-- Recent deal activity
SELECT * FROM public.deal_pipeline
WHERE last_interaction_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY last_interaction_date DESC;

-- Upcoming decision dates
SELECT * FROM public.deal_pipeline
WHERE expected_decision_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
ORDER BY expected_decision_date ASC;
```

## Materialized View Analytics

### Deal Pipeline Analytics View

```sql
-- Refresh and query analytics
REFRESH MATERIALIZED VIEW public.mv_deal_pipeline_analytics;

SELECT
  status,
  priority_level,
  deal_count,
  avg_probability,
  total_estimated_value
FROM public.mv_deal_pipeline_analytics
ORDER BY total_estimated_value DESC;
```

## Integration with Application Code

### TypeScript/JavaScript Examples

#### Using Supabase Client

```typescript
// Search platform mandates by tags
const { data: mandates } = await supabase
  .rpc('fn_search_mandates_by_tags', {
    p_tags: ['regional', 'family-drama']
  });

// Get deal pipeline summary
const { data: summary } = await supabase
  .rpc('fn_get_deal_pipeline_summary', {
    p_project_id: projectId
  });

// Filter deals by status
const { data: activeDeals } = await supabase
  .from('deal_pipeline')
  .select(`
    *,
    projects:project_id (
      title,
      genre
    )
  `)
  .in('status', ['in_discussion', 'under_review'])
  .order('deal_value_estimate', { ascending: false });
```

#### Real-time Subscriptions

```typescript
// Subscribe to deal status changes
const subscription = supabase
  .channel('deal-pipeline-changes')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'deal_pipeline',
    filter: `project_id=eq.${projectId}`
  }, (payload) => {
    console.log('Deal status changed:', payload);
  })
  .subscribe();
```

## Migration Deployment

### Steps to Deploy

1. **Apply the migration:**
   ```sql
   -- Run the migration file in Supabase SQL Editor
   -- File: 2025-09-18T00-00Z_add_platform_mandates_and_deal_pipeline.sql
   ```

2. **Verify deployment:**
   ```sql
   -- Run verification queries
   \i test_crud_operations.sql
   \i performance_test_queries.sql
   \i security_validation_tests.sql
   ```

3. **Test with sample data:**
   ```sql
   -- Use the provided test scripts to validate functionality
   ```

### Rollback Plan

If rollback is needed:

```sql
-- Drop tables (this will cascade to dependent objects)
DROP TABLE IF EXISTS public.deal_pipeline CASCADE;
DROP TABLE IF EXISTS public.platform_mandates CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS public.fn_search_mandates_by_tags(TEXT[]);
DROP FUNCTION IF EXISTS public.fn_get_platform_mandates(TEXT);
DROP FUNCTION IF EXISTS public.fn_get_deal_pipeline_summary(UUID);
DROP FUNCTION IF EXISTS public.fn_notify_deal_status_change();

-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS public.mv_deal_pipeline_analytics;

-- Drop triggers and trigger function
DROP TRIGGER IF EXISTS platform_mandates_updated_at ON public.platform_mandates;
DROP TRIGGER IF EXISTS deal_pipeline_updated_at ON public.deal_pipeline;
DROP FUNCTION IF EXISTS public.handle_updated_at();
```

## Maintenance & Monitoring

### Regular Maintenance Tasks

1. **Refresh materialized view:**
   ```sql
   REFRESH MATERIALIZED VIEW public.mv_deal_pipeline_analytics;
   ```

2. **Update table statistics:**
   ```sql
   ANALYZE public.platform_mandates;
   ANALYZE public.deal_pipeline;
   ```

3. **Monitor index usage:**
   ```sql
   SELECT * FROM pg_stat_user_indexes
   WHERE schemaname = 'public'
   AND tablename IN ('platform_mandates', 'deal_pipeline');
   ```

### Performance Monitoring

- Monitor query execution times
- Check index usage statistics
- Watch for sequential scans on large tables
- Monitor materialized view refresh times

## Best Practices

### Data Entry Guidelines

1. **Consistent platform naming:** Use standardized platform names
2. **Comprehensive tagging:** Use descriptive, searchable tags
3. **Regular updates:** Keep deal status and dates current
4. **Detailed feedback:** Capture comprehensive feedback notes

### Query Performance

1. **Use appropriate indexes:** Leverage GIN indexes for array operations
2. **Filter early:** Apply WHERE clauses on indexed columns
3. **Limit result sets:** Use LIMIT for large result sets
4. **Batch operations:** Group related updates together

### Security Considerations

1. **Verify founder role:** Ensure proper role-based access
2. **Validate input data:** Check constraints and data types
3. **Monitor access patterns:** Watch for unusual access attempts
4. **Regular security audits:** Review and test RLS policies

## Troubleshooting

### Common Issues

1. **Permission denied errors:** Check user role and RLS policies
2. **Foreign key violations:** Ensure referenced records exist
3. **Check constraint failures:** Validate enum values and ranges
4. **Slow queries:** Check index usage and query plans

### Debug Commands

```sql
-- Check current user and role
SELECT auth.uid(), auth.role();

-- Verify table permissions
SELECT * FROM pg_policies WHERE tablename IN ('platform_mandates', 'deal_pipeline');

-- Check query performance
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.platform_mandates WHERE tags && ARRAY['test'];
```

## Conclusion

The Platform Mandates and Deal Pipeline schema provides a robust foundation for tracking content platform requirements and deal progression. The implementation includes:

- ✅ Complete table schemas with blueprint-required columns
- ✅ Comprehensive indexing for optimal performance
- ✅ Row-level security for access control
- ✅ Helper functions for common operations
- ✅ Materialized views for analytics
- ✅ Automated triggers for data maintenance
- ✅ Full documentation and usage examples

This implementation is production-ready and follows Supabase best practices for security, performance, and maintainability.