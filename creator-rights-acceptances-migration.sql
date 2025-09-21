-- Creator's Bill of Rights Acceptance Migration
-- This creates the table and supporting functions for tracking user acceptance of the Creator's Bill of Rights

-- Create the creator_rights_acceptances table
CREATE TABLE IF NOT EXISTS public.creator_rights_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    version TEXT NOT NULL DEFAULT '1.0',
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address INET, -- Store IP address for compliance/audit purposes
    user_agent TEXT, -- Store user agent for additional context
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Ensure one acceptance record per user per version
    UNIQUE(user_id, version)
);

-- Create an index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_creator_rights_acceptances_user_id ON public.creator_rights_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_creator_rights_acceptances_accepted_at ON public.creator_rights_acceptances(accepted_at);

-- Set up Row Level Security
ALTER TABLE public.creator_rights_acceptances ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own rights acceptances
DROP POLICY IF EXISTS "Users can view their own rights acceptances" ON public.creator_rights_acceptances;
CREATE POLICY "Users can view their own rights acceptances"
ON public.creator_rights_acceptances FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own rights acceptances
DROP POLICY IF EXISTS "Users can insert their own rights acceptances" ON public.creator_rights_acceptances;
CREATE POLICY "Users can insert their own rights acceptances"
ON public.creator_rights_acceptances FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can manage all rights acceptances (for server-side operations)
DROP POLICY IF EXISTS "Service role can manage all rights acceptances" ON public.creator_rights_acceptances;
CREATE POLICY "Service role can manage all rights acceptances"
ON public.creator_rights_acceptances FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Founders can view all rights acceptances (for admin purposes)
DROP POLICY IF EXISTS "Founders can view all rights acceptances" ON public.creator_rights_acceptances;
CREATE POLICY "Founders can view all rights acceptances"
ON public.creator_rights_acceptances FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'founder'
    )
);

-- Create RPC function to record rights acceptance (used by server actions)
CREATE OR REPLACE FUNCTION public.record_rights_acceptance(
    p_user_id UUID,
    p_version TEXT DEFAULT '1.0',
    p_ip_address TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    -- Insert the rights acceptance record
    INSERT INTO public.creator_rights_acceptances (
        user_id,
        version,
        accepted_at,
        ip_address
    ) VALUES (
        p_user_id,
        p_version,
        now(),
        p_ip_address::INET
    ) ON CONFLICT (user_id, version) DO UPDATE SET
        accepted_at = now(),
        ip_address = EXCLUDED.ip_address;

    -- Log the acceptance for audit purposes
    RAISE NOTICE 'Rights acceptance recorded for user % (version: %)', p_user_id, p_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.record_rights_acceptance TO authenticated, service_role;

-- Create function to check if user has accepted rights (used by middleware)
CREATE OR REPLACE FUNCTION public.user_has_accepted_rights(
    p_user_id UUID,
    p_version TEXT DEFAULT '1.0'
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.creator_rights_acceptances
        WHERE user_id = p_user_id
        AND version = p_version
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.user_has_accepted_rights TO authenticated, service_role;

-- Create function to get latest rights acceptance for a user
CREATE OR REPLACE FUNCTION public.get_user_rights_acceptance(p_user_id UUID)
RETURNS TABLE(
    version TEXT,
    accepted_at TIMESTAMPTZ,
    ip_address INET
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cra.version,
        cra.accepted_at,
        cra.ip_address
    FROM public.creator_rights_acceptances cra
    WHERE cra.user_id = p_user_id
    ORDER BY cra.accepted_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.get_user_rights_acceptance TO authenticated, service_role;

-- Create view for audit purposes (founder-only access)
CREATE OR REPLACE VIEW public.rights_acceptance_audit AS
SELECT
    cra.id,
    cra.user_id,
    p.full_name,
    p.role,
    cra.version,
    cra.accepted_at,
    cra.ip_address,
    cra.created_at
FROM public.creator_rights_acceptances cra
LEFT JOIN public.profiles p ON p.id = cra.user_id
ORDER BY cra.accepted_at DESC;

-- Grant access to the audit view for founders only
GRANT SELECT ON public.rights_acceptance_audit TO authenticated;
CREATE POLICY "Only founders can view rights acceptance audit" ON public.rights_acceptance_audit
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'founder'
    )
);