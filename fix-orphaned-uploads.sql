-- Fix Orphaned Uploads Migration
-- Handles existing ingestion records without project_id

-- First, let's see what we're dealing with
DO $$
DECLARE
  orphaned_count integer;
  unique_users uuid[];
  user_record uuid;
BEGIN
  -- Count orphaned uploads
  SELECT COUNT(*) INTO orphaned_count
  FROM public.ingestions
  WHERE project_id IS NULL;

  RAISE NOTICE 'Found % ingestions without project_id', orphaned_count;

  IF orphaned_count > 0 THEN
    -- Get unique users with orphaned uploads
    SELECT ARRAY_AGG(DISTINCT user_id) INTO unique_users
    FROM public.ingestions
    WHERE project_id IS NULL AND user_id IS NOT NULL;

    RAISE NOTICE 'Users with orphaned uploads: %', array_length(unique_users, 1);

    -- Option 1: Create a "Legacy Uploads" project for each user with orphaned uploads
    FOREACH user_record IN ARRAY unique_users
    LOOP
      -- Check if user exists and create legacy project
      INSERT INTO public.projects (owner_id, title, status, logline)
      VALUES (
        user_record,
        'Legacy Uploads',
        'archived',
        'Auto-created project for uploads made before project association was required'
      )
      ON CONFLICT DO NOTHING;

      -- Update orphaned uploads to use the legacy project
      UPDATE public.ingestions
      SET project_id = (
        SELECT id FROM public.projects
        WHERE owner_id = user_record
        AND title = 'Legacy Uploads'
        LIMIT 1
      )
      WHERE user_id = user_record AND project_id IS NULL;

      RAISE NOTICE 'Created legacy project for user %', user_record;
    END LOOP;

    -- Handle orphaned uploads with no user_id (if any)
    UPDATE public.ingestions
    SET project_id = (
      SELECT id FROM public.projects
      WHERE title = 'System Legacy Uploads'
      LIMIT 1
    )
    WHERE project_id IS NULL AND user_id IS NULL;

    -- Create system legacy project if needed
    INSERT INTO public.projects (owner_id, title, status, logline)
    SELECT
      (SELECT id FROM auth.users LIMIT 1), -- Use first available user or system user
      'System Legacy Uploads',
      'archived',
      'System project for orphaned uploads'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.projects WHERE title = 'System Legacy Uploads'
    );

  END IF;
END $$;

-- Now check the results
SELECT 'After cleanup:' as status;
SELECT
  COUNT(*) as total_ingestions,
  COUNT(*) FILTER (WHERE project_id IS NULL) as still_orphaned,
  COUNT(*) FILTER (WHERE project_id IS NOT NULL) as linked_to_projects
FROM public.ingestions;

-- Show legacy projects created
SELECT
  'Legacy projects created:' as info,
  title,
  owner_id,
  status,
  (SELECT COUNT(*) FROM public.ingestions WHERE project_id = p.id) as ingestion_count
FROM public.projects p
WHERE title LIKE '%Legacy%';