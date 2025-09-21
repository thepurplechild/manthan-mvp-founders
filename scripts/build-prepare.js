#!/usr/bin/env node
/**
 * Build preparation script for Vercel deployment
 * Ensures required environment variables are set with fallback values
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Preparing build environment...');

// Check if we're in Vercel environment
const isVercel = process.env.VERCEL === '1';
if (isVercel) {
  console.log('🚀 Detected Vercel deployment environment');
}

// Required environment variables with fallback values
const requiredEnvVars = {
  'ANTHROPIC_API_KEY': 'sk-ant-build-placeholder',
  'BLOB_READ_WRITE_TOKEN': 'build-placeholder',
  'KV_URL': 'redis://build-placeholder',
  'KV_REST_API_URL': 'https://build-placeholder',
  'KV_REST_API_TOKEN': 'build-placeholder',
  'CRON_SECRET': 'build-placeholder',
  'ADMIN_TOKEN': 'build-placeholder',
  'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://build-placeholder.supabase.co',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'build-placeholder',
  'SUPABASE_SERVICE_ROLE': process.env.SUPABASE_SERVICE_ROLE || 'build-placeholder'
};

// Set fallback values for missing environment variables
let envUpdated = false;
Object.entries(requiredEnvVars).forEach(([key, fallback]) => {
  if (!process.env[key]) {
    process.env[key] = fallback;
    envUpdated = true;
    console.log(`ℹ️  Set fallback for ${key}`);
  }
});

if (envUpdated) {
  console.log('⚠️  Using fallback environment variables for build');
  console.log('   Real values should be set in production deployment');
} else {
  console.log('✅ All environment variables are configured');
}

// Check for canvas availability in Vercel environment
if (isVercel) {
  try {
    require('canvas');
    console.log('✅ Canvas module available');
  } catch (error) {
    console.log('⚠️  Canvas module not available in Vercel environment (expected)');
    console.log('   PDF processing will fall back to alternative methods');
  }
}

console.log('🚀 Build environment ready');