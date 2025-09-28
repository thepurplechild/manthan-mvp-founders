# 🔐 Supabase Authentication Configuration Guide

## URGENT: Fix "Invalid verification parameters" Error

This guide fixes the critical authentication error preventing users from completing email verification.

## 🎯 Required Supabase Dashboard Settings

### 1. Site URL Configuration
**Go to: Supabase Dashboard → Authentication → URL Configuration**

**Site URL:**
```
https://manthan-mvp-v10.vercel.app
```

**Additional Redirect URLs (add all of these):**
```
https://manthan-mvp-v10.vercel.app/auth/callback
https://manthan-mvp-v10.vercel.app/auth/confirm
https://localhost:3000/auth/callback
https://localhost:3000/auth/confirm
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
```

### 2. Email Template Configuration
**Go to: Supabase Dashboard → Authentication → Email Templates**

#### Confirm Signup Template
**Update the action URL to:**
```html
<a href="{{ .SiteURL }}/auth/callback?access_token={{ .Token }}&refresh_token={{ .RefreshToken }}&expires_in={{ .ExpiresIn }}&token_type=bearer&type=signup">Confirm your email</a>
```

**Or use the simpler format:**
```html
<a href="{{ .SiteURL }}/auth/callback?code={{ .Code }}&next=/dashboard">Confirm your email</a>
```

#### Magic Link Template
**Update the action URL to:**
```html
<a href="{{ .SiteURL }}/auth/callback?access_token={{ .Token }}&refresh_token={{ .RefreshToken }}&expires_in={{ .ExpiresIn }}&token_type=bearer&type=magiclink">Sign in</a>
```

#### Reset Password Template
**Update the action URL to:**
```html
<a href="{{ .SiteURL }}/auth/callback?access_token={{ .Token }}&refresh_token={{ .RefreshToken }}&expires_in={{ .ExpiresIn }}&token_type=bearer&type=recovery">Reset your password</a>
```

### 3. Authentication Settings
**Go to: Supabase Dashboard → Authentication → Settings**

**Enable these settings:**
- ✅ **Enable email confirmations**
- ✅ **Enable email change confirmations**
- ✅ **Enable password recovery**
- ✅ **Secure email change** (recommended)

**Auth token settings:**
- **JWT expiry**: 3600 (1 hour)
- **Refresh token rotation**: Enabled
- **Reuse interval**: 10 (seconds)

### 4. OAuth Providers (if using)
For each OAuth provider, set the callback URL to:
```
https://manthan-mvp-v10.vercel.app/auth/callback
```

## 🔧 Environment Variables Verification

**In your `.env.local` file, verify these are correct:**

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://wywshqihyhukpzamilam.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Application URL
NEXT_PUBLIC_APP_URL=https://manthan-mvp-v10.vercel.app
```

## 🔄 Authentication Flow Types Supported

### 1. PKCE Flow (Recommended)
```
User clicks email → https://yourapp.com/auth/callback?code=abc123
→ exchangeCodeForSession() → Success
```

### 2. Direct Token Flow
```
User clicks email → https://yourapp.com/auth/callback?access_token=xyz&refresh_token=abc
→ setSession() → Success
```

### 3. Legacy Token Hash Flow
```
User clicks email → https://yourapp.com/auth/callback?token_hash=xyz&type=signup
→ Redirect to /auth/confirm → verifyOtp() → Success
```

### 4. Hash Fragment Flow
```
User clicks email → https://yourapp.com/auth/callback#access_token=xyz&refresh_token=abc
→ Parse URL fragments → setSession() → Success
```

## 🐛 Debugging Authentication Issues

### Enable Debug Logging
The callback routes now include comprehensive logging. Check your server logs for:

```bash
🚀 Auth callback received: {
  url: "/auth/callback?code=...",
  hash: "#access_token=...",
  params: {
    hasCode: true,
    hasTokenHash: false,
    hasAccessToken: true,
    hasRefreshToken: true,
    type: "signup"
  }
}
```

### Common Issues & Solutions

#### Issue: "Missing verification parameters"
**Solution:** Check that Supabase email templates use the correct callback URL format

#### Issue: "Invalid verification code format"
**Solution:** Ensure PKCE flow is properly configured in Supabase

#### Issue: "No user data returned"
**Solution:** Check that session cookies are being set correctly

#### Issue: "Token session failed"
**Solution:** Verify token format and expiry in email templates

## ✅ Testing the Fix

### 1. Test Signup Flow
1. Go to `/auth/sign-up`
2. Enter email and password
3. Check email for verification link
4. Click link → Should redirect to dashboard or rights acceptance
5. Check browser dev tools for auth callback logs

### 2. Test Magic Link (if enabled)
1. Go to `/auth/sign-in`
2. Use "Send Magic Link" option
3. Check email and click link
4. Should authenticate and redirect properly

### 3. Test Password Reset
1. Go to `/auth/forgot-password`
2. Enter email
3. Check email and click reset link
4. Should redirect to password reset form

## 🔍 Troubleshooting Commands

### Check Authentication State
```javascript
// In browser console
console.log('Current URL:', window.location.href)
console.log('URL Hash:', window.location.hash)
console.log('Search params:', window.location.search)
```

### Test API Endpoint Directly
```bash
# Test the callback endpoint
curl -v "https://manthan-mvp-v10.vercel.app/auth/callback?code=test123"
```

### Check Supabase Logs
1. Go to Supabase Dashboard → Logs
2. Filter for "Auth" logs
3. Look for authentication events and errors

## 📝 Email Template Examples

### Working Confirm Signup Template
```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your user:</p>
<p><a href="{{ .SiteURL }}/auth/callback?access_token={{ .Token }}&refresh_token={{ .RefreshToken }}&expires_in={{ .ExpiresIn }}&token_type=bearer&type=signup">Confirm your mail</a></p>
```

### Working Magic Link Template
```html
<h2>Magic Link</h2>
<p>Follow this link to sign in:</p>
<p><a href="{{ .SiteURL }}/auth/callback?access_token={{ .Token }}&refresh_token={{ .RefreshToken }}&expires_in={{ .ExpiresIn }}&token_type=bearer&type=magiclink">Sign In</a></p>
```

## 🚀 Expected Results

After applying these configurations:

✅ **Email verification links work correctly**
✅ **Users can complete signup without errors**
✅ **Password reset flow functions properly**
✅ **Magic links authenticate users successfully**
✅ **Proper error messages for debugging**
✅ **Support for multiple authentication flows**

## 🔒 Security Notes

- All callback URLs use HTTPS in production
- Tokens have proper expiry times
- Refresh token rotation is enabled
- Domain validation prevents unauthorized redirects
- Comprehensive logging for security monitoring

## 📞 Support

If you still encounter the "Invalid verification parameters" error after applying these fixes:

1. **Check Supabase Dashboard logs** for detailed error information
2. **Verify all redirect URLs** are exactly as specified above
3. **Test in incognito mode** to rule out cache issues
4. **Check browser dev tools** for detailed callback information
5. **Review server logs** for authentication flow debugging