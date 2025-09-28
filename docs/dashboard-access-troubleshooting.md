# Dashboard Access Troubleshooting Guide

## Issue Analysis
**Problem**: Dashboard not opening for authenticated users
**Date**: 2025-09-28

## Root Cause Analysis

### 🔍 Authentication Flow
The dashboard requires a multi-step authentication process:

1. **User Authentication** - Must be logged in via Supabase Auth
2. **Creator Rights Acceptance** - Must accept Creator's Bill of Rights
3. **Profile Validation** - Must have valid profile in database

### 📋 Middleware Protection Logic
The middleware (`middleware.ts`) enforces this flow:

```typescript
// Lines 28-30: Protected routes
const isProtectedRoute = pathname.startsWith('/founder') ||
                        pathname.startsWith('/dashboard') ||
                        pathname.startsWith('/projects');

// Lines 72-83: Rights acceptance check
const { data: rightsAcceptance, error: rightsError } = await supabase
  .from('creator_rights_acceptances')
  .select('id')
  .eq('user_id', session.user.id)
  .single();

if (rightsError || !rightsAcceptance) {
  // Redirect to rights acceptance page
  const acceptanceUrl = new URL(RIGHTS_ACCEPTANCE_PATH, req.url);
  acceptanceUrl.searchParams.set('redirect', redirectTarget);
  return NextResponse.redirect(acceptanceUrl);
}
```

## Common Dashboard Access Issues

### 1. ❌ **Not Authenticated**
**Symptoms**: Redirected to `/auth/login`
**Solution**: User needs to sign in with valid credentials

### 2. ❌ **Rights Not Accepted**
**Symptoms**: Redirected to `/auth/accept-rights`
**Solution**: User must accept Creator's Bill of Rights
**Database**: Check `creator_rights_acceptances` table

### 3. ❌ **Missing Profile**
**Symptoms**: Dashboard loads but shows errors
**Solution**: Ensure user has profile in `profiles` table

### 4. ❌ **Session Expired**
**Symptoms**: Intermittent redirects to login
**Solution**: Refresh authentication session

## Debugging Steps

### For Users:
1. **Clear Browser Cache**: Hard refresh (Ctrl+F5 / Cmd+Shift+R)
2. **Check Cookies**: Ensure Supabase auth cookies present
3. **Try Incognito Mode**: Test without cached data
4. **Complete Rights Acceptance**: If redirected to `/auth/accept-rights`

### For Developers:
1. **Check Database Tables**:
   ```sql
   -- Verify user exists
   SELECT * FROM auth.users WHERE email = 'user@example.com';

   -- Check profile
   SELECT * FROM profiles WHERE id = 'user-uuid';

   -- Verify rights acceptance
   SELECT * FROM creator_rights_acceptances WHERE user_id = 'user-uuid';
   ```

2. **Monitor Network Tab**: Check for 401/403 responses
3. **Console Errors**: Look for Supabase auth errors
4. **Middleware Logs**: Check server logs for redirect reasons

## Database Schema Requirements

### Required Tables:
1. **`auth.users`** - Supabase managed
2. **`profiles`** - User profile data
3. **`creator_rights_acceptances`** - Rights acceptance tracking

### Required Columns:
```sql
-- profiles table
profiles {
  id: uuid (references auth.users.id)
  full_name: text
  role: text
  created_at: timestamp
  updated_at: timestamp
}

-- creator_rights_acceptances table
creator_rights_acceptances {
  id: uuid
  user_id: uuid (references auth.users.id)
  created_at: timestamp
}
```

## Environment Requirements

### Required Environment Variables:
```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Quick Fixes

### 1. **Force Rights Acceptance Reset** (for testing):
```sql
DELETE FROM creator_rights_acceptances WHERE user_id = 'user-uuid';
```

### 2. **Create Missing Profile**:
```sql
INSERT INTO profiles (id, full_name, role)
VALUES ('user-uuid', 'User Name', 'creator');
```

### 3. **Check Auth Session**:
```javascript
// In browser console
const session = await supabase.auth.getSession();
console.log('Session:', session);
```

## Resolution Status

### ✅ **Dashboard Code Analysis**
- Dashboard page (`/app/dashboard/page.tsx`) is properly implemented
- Authentication checks are correct
- Profile queries are functional
- No coding errors found

### ✅ **Middleware Analysis**
- Route protection working as designed
- Rights acceptance flow properly implemented
- Redirect logic is correct

### 🔧 **Most Likely Causes**
1. **Missing rights acceptance record in database**
2. **Expired or invalid authentication session**
3. **Browser cache issues with auth cookies**
4. **Missing user profile in profiles table**

## Recommended Actions

### For Immediate Resolution:
1. **Check rights acceptance status** for affected users
2. **Verify profile table has user records**
3. **Guide users through rights acceptance flow**
4. **Clear browser cache and re-authenticate**

### For Long-term Monitoring:
1. **Add better error logging** to middleware
2. **Implement auth session refresh logic**
3. **Add dashboard access health checks**
4. **Monitor rights acceptance completion rates**

---
*Analysis completed by Claude Code on 2025-09-28*