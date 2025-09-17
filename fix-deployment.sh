#!/bin/bash
# Manthan MVP: Fix Infrastructure Deployment
# Run this script to configure Vercel services and environment variables

echo "🔧 Fixing Manthan MVP Infrastructure..."

# 1. Provision Vercel Services
echo "📦 Provisioning Vercel KV..."
vercel kv create manthan-job-queue --yes

echo "📦 Provisioning Vercel Blob..."
# Note: Blob is auto-provisioned when first used, just need the token

# 2. Generate and set security tokens
echo "🔑 Setting up security tokens..."
CRON_SECRET=$(openssl rand -hex 32)
ADMIN_TOKEN=$(openssl rand -hex 32)

echo "🌍 Setting production environment variables..."
vercel env add CRON_SECRET "$CRON_SECRET" production
vercel env add ADMIN_TOKEN "$ADMIN_TOKEN" production

# 3. Remind user to set other required variables
echo ""
echo "⚠️  MANUAL STEPS REQUIRED:"
echo "1. Add your Anthropic API key:"
echo "   vercel env add ANTHROPIC_API_KEY 'sk-ant-your-key-here' production"
echo ""
echo "2. After first blob operation, get the token and add:"
echo "   vercel env add BLOB_READ_WRITE_TOKEN 'your-blob-token' production"
echo ""
echo "3. The KV environment variables should be auto-set by the KV creation."
echo "   Verify with: vercel env ls"
echo ""
echo "4. Deploy the updated code:"
echo "   vercel deploy --prod"
echo ""
echo "✅ Basic infrastructure setup complete!"
echo "🚀 Don't forget to run the SQL fixes in your Supabase dashboard:"
echo "   Execute: fix-ingestion-pipeline.sql"