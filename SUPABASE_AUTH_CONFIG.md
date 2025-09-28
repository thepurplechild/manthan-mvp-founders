# Supabase Authentication Configuration Guide

## 🎯 Fix for "requested path is invalid" Error

The authentication callback error occurs when Supabase tries to redirect to a callback URL that doesn't exist or isn't properly configured. This guide shows how to fix it.

## 🔧 Required Supabase Dashboard Settings

### 1. Site URL Configuration
Go to **Supabase Dashboard → Authentication → URL Configuration**

**Site URL:**
```
https://manthan-mvp-v10.vercel.app
```

**Additional Redirect URLs:**
```
https://manthan-mvp-v10.vercel.app/auth/callback
https://manthan-mvp-v10.vercel.app/auth/confirm
https://localhost:3000/auth/callback
https://localhost:3000/auth/confirm
```

### 2. Email Template Configuration
Go to **Supabase Dashboard → Authentication → Email Templates**

#### Confirm Signup Template
Update the action URL to:
```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/dashboard
```

#### Magic Link Template
Update the action URL to:
```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink&next=/dashboard
```

#### Reset Password Template
Update the action URL to:
```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password
```

### 3. OAuth Provider Settings (if using)
For each OAuth provider (Google, GitHub, etc.), ensure the callback URL is:
```
https://manthan-mvp-v10.vercel.app/auth/callback
```

## 🚀 Authentication Flow Overview

Your app now supports multiple authentication flows:

### 1. Standard OAuth Flow
- User clicks OAuth sign-in button
- Redirected to OAuth provider
- Provider redirects to `/auth/callback?code=...`
- Code is exchanged for session
- User redirected to dashboard or rights acceptance

### 2. Email Verification Flow
- User signs up or requests magic link
- Email contains link to `/auth/callback?token_hash=...&type=...`
- Callback route redirects to `/auth/confirm` for comprehensive verification
- User verified and redirected to appropriate page

### 3. Password Reset Flow
- User requests password reset
- Email contains link to `/auth/callback?token_hash=...&type=recovery`
- Callback route handles verification
- User redirected to password reset form

## 📁 Implementation Files

### Created/Updated Files:
1. **`/app/auth/callback/route.ts`** - Standard Supabase callback handler
2. **`/app/auth/error/page.tsx`** - Enhanced error handling with user guidance
3. **`/app/auth/confirm/route.ts`** - Existing comprehensive verification handler

### Route Hierarchy:
```
/auth/
├── callback/          # Standard Supabase callback (NEW)
│   └── route.ts       # Handles OAuth + redirects to /confirm for email
├── confirm/           # Comprehensive email verification (EXISTING)
│   └── route.ts       # Handles token verification + rights checking
├── error/             # Enhanced error handling (UPDATED)
│   └── page.tsx       # User-friendly error messages
└── accept-rights/     # Rights acceptance flow (EXISTING)
    └── page.tsx       # Creator rights acceptance
```

## 🔍 How It Works

1. **Supabase redirects to `/auth/callback`** with either:
   - `code` parameter (OAuth flow)
   - `token_hash` + `type` parameters (email verification)

2. **Callback route determines the flow:**
   - OAuth: Exchanges code for session, checks rights, redirects
   - Email: Redirects to `/auth/confirm` for comprehensive handling

3. **Error handling:** Any errors redirect to `/auth/error` with detailed context

4. **Rights integration:** Both flows check Creator Rights acceptance status

## ✅ Testing Steps

### 1. Test Email Verification
1. Sign up with email
2. Check email for verification link
3. Click link - should redirect properly without errors
4. Should end up at dashboard or rights acceptance

### 2. Test Password Reset
1. Go to forgot password
2. Enter email and submit
3. Check email for reset link
4. Click link - should redirect to password reset form

### 3. Test OAuth (if configured)
1. Click OAuth sign-in button
2. Complete OAuth flow
3. Should redirect back without errors

## 🐛 Debugging

If you still get "requested path is invalid":

1. **Check Supabase URL configuration** matches exactly
2. **Verify redirect URLs** are added to the allowed list
3. **Check email templates** use the correct callback URL format
4. **Clear browser cache** and try in incognito mode
5. **Check server logs** for detailed error information

### Development Debugging
The error page shows debug information in development mode. Check:
- Browser console for detailed logs
- Server logs for callback processing
- Network tab for redirect chains

## 🔒 Security Notes

- **HTTPS required** in production for OAuth callbacks
- **Domain validation** - only configured domains can receive callbacks
- **Token expiration** - email tokens expire for security
- **PKCE flow** - Uses secure OAuth 2.1 PKCE flow for OAuth

## 📞 Support

If the error persists after following this guide:
1. Check all Supabase configuration matches exactly
2. Verify environment variables are correct
3. Test in incognito mode to rule out cache issues
4. Check Supabase project logs for additional error details