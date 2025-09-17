# 🚀 Vercel Deployment Configuration

This document outlines the complete configuration setup for deploying Project Manthan to Vercel with optimal settings for file processing and serverless performance.

## 📋 Configuration Files Overview

### 1. **Environment Variables** (`.env.example`)

**Required Variables:**
```bash
# Authentication & Database
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# AI Services
ANTHROPIC_API_KEY=sk-ant-api03-...

# Application
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
```

**Optional Configuration:**
```bash
FILE_MAX_SIZE_MB=25                    # Default: 25MB
PIPELINE_MAX_TOKENS=120000             # Default: 120,000
FILE_PROCESSING_TIMEOUT=25000          # Default: 25s
LOG_LEVEL=info                         # Default: info
ENABLE_FILE_SECURITY_SCAN=false        # Default: false
ENABLE_PROCESSING_LOGS=true            # Default: true
ENABLE_PERFORMANCE_MONITORING=true     # Default: true
```

### 2. **Vercel Configuration** (`vercel.json`)

**Key Features:**
- **Optimized Function Settings**: Different memory/timeout allocations per API route
- **Regional Deployment**: Configured for `iad1` (US East)
- **Security Headers**: CORS, Content-Type protection, XSS protection
- **Cron Jobs**: Automated cleanup and health checks

**Function Configurations:**
- File ingestion: `1024MB memory, 30s timeout`
- AI processing: `512MB memory, 15s timeout`
- General APIs: `256MB memory, 10s timeout`

### 3. **Package Dependencies** (`package.json`)

**File Processing Dependencies:**
```json
{
  "pdf-parse": "^1.1.1",
  "mammoth": "^1.10.0",
  "docx": "^9.5.1",
  "adm-zip": "^0.5.16",
  "tesseract.js": "^6.0.1",
  "sharp": "^0.33.0",
  "file-type": "^19.0.0"
}
```

**Engine Requirements:**
- Node.js: `>=18.17.0`
- npm: `>=8.19.0`

## 🛠️ Environment Variable Validation

The app includes comprehensive validation for all environment variables:

### Client-Side Validation (`lib/env.client.ts`)
- Validates public environment variables
- Ensures HTTPS in production
- Provides helpful error messages
- Auto-detects Supabase URL format

### Server-Side Validation (`lib/env.server.ts`)
- Validates private API keys and configuration
- Enforces value ranges (file sizes, timeouts, etc.)
- Provides development setup guidance
- Logs successful validation

## ⚙️ Vercel Function Optimization

### Memory Allocation Strategy
```json
{
  "app/api/ingest/route.ts": {
    "memory": 1024,      // High memory for file processing
    "maxDuration": 30    // Extended timeout for large files
  },
  "app/api/ai/**/route.ts": {
    "memory": 512,       // Medium memory for AI operations
    "maxDuration": 15    // Standard timeout for AI calls
  },
  "app/api/**/route.ts": {
    "memory": 256,       // Base memory for simple operations
    "maxDuration": 10    // Quick timeout for basic APIs
  }
}
```

### Regional Configuration
- **Primary Region**: `iad1` (US East - Virginia)
- **Rationale**: Optimized for North American users and Supabase US regions
- **Fallback**: Automatic Vercel region selection

## 🔍 Health Monitoring

### Health Check Endpoint (`/api/health`)
- Environment configuration validation
- Memory usage monitoring
- Uptime tracking
- Regional deployment info
- Real-time system status

### Automated Monitoring
```json
{
  "crons": [
    {
      "path": "/api/cleanup/temp-files",
      "schedule": "0 */6 * * *"           // Every 6 hours
    },
    {
      "path": "/api/health/database",
      "schedule": "*/15 * * * *"          // Every 15 minutes
    }
  ]
}
```

## 🛡️ Security Configuration

### Headers Applied to All API Routes:
```json
{
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block"
}
```

### Environment Variable Security:
- **API Keys**: Validated format and never exposed to client
- **Service Keys**: Server-side only with elevated privilege warnings
- **URLs**: HTTPS enforcement in production
- **Sensitive Data**: Redacted in logs (User IDs, Session IDs)

## 📦 Deployment Commands

### Pre-deployment Validation
```bash
npm run validate:config    # Comprehensive config validation
npm run deploy:check       # Full validation + build test
```

### Development Commands
```bash
npm run dev               # Start with Turbopack
npm run typecheck        # TypeScript validation
npm run lint             # ESLint validation
```

### Production Deployment
```bash
vercel --prod            # Deploy to production
vercel --prod --logs     # Deploy with real-time logs
```

## 🚨 Critical Settings Explained

### File Processing Limits
- **Max File Size**: 25MB (Vercel Pro limit: 50MB)
- **Processing Timeout**: 25s (below Vercel's 30s limit)
- **Memory Allocation**: 1GB for file processing functions

### AI Processing Limits
- **Max Tokens**: 120,000 (balance between capability and cost)
- **Timeout**: 15s (sufficient for most AI operations)
- **Memory**: 512MB (adequate for model inference)

### Performance Optimizations
- **Turbopack**: Enabled for faster development builds
- **Sharp**: Optimized image processing
- **Memory Monitoring**: Real-time tracking in logs
- **Regional Deployment**: Single region for consistency

## 🔧 Troubleshooting

### Common Deployment Issues:

1. **Environment Variable Missing**
   - Run `npm run validate:config`
   - Check Vercel dashboard environment variables
   - Ensure all required variables are set

2. **Function Timeout**
   - Check `vercel.json` maxDuration settings
   - Monitor function memory usage
   - Consider breaking large operations into smaller chunks

3. **Memory Issues**
   - Increase function memory in `vercel.json`
   - Monitor heap usage in logs
   - Implement proper memory cleanup

4. **File Processing Failures**
   - Verify file type support
   - Check file size limits
   - Review error logs for specific failures

### Debug Commands:
```bash
npm run validate:config   # Full config validation
curl https://your-app.vercel.app/health  # Health check
vercel logs              # View deployment logs
```

## 📊 Monitoring & Analytics

### Built-in Monitoring:
- Memory usage tracking per function
- Processing time measurements
- Error rate monitoring
- File ingestion success rates

### Optional Vercel Features:
```bash
NEXT_PUBLIC_VERCEL_ANALYTICS=true       # Requires Vercel Pro
NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS=true  # Performance insights
```

---

**✅ Configuration Complete!** Your deployment is optimized for reliable file processing and AI operations on Vercel's serverless platform.