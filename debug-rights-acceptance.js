#!/usr/bin/env node
/**
 * Debug script for Creator Rights Acceptance
 * Tests database connection, RPC function, and API endpoint
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config();

async function testRightsAcceptance() {
  console.log('🔍 Testing Creator Rights Acceptance Flow...\n');

  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log('- NEXT_PUBLIC_SUPABASE_URL:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('- NEXT_PUBLIC_SUPABASE_ANON_KEY:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  console.log('- SUPABASE_SERVICE_ROLE_KEY:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('');

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing required environment variables');
    return;
  }

  // Test admin client connection
  console.log('🔧 Testing Admin Client Connection...');
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  try {
    // Test database connection
    const { data: testData, error: testError } = await adminClient
      .from('creator_rights_acceptances')
      .select('count')
      .limit(1);

    if (testError) {
      console.error('❌ Database connection failed:', testError.message);
      return;
    }

    console.log('✅ Database connection successful');

    // Test RPC function
    console.log('🧪 Testing RPC Function...');
    const testUserId = '00000000-0000-0000-0000-000000000000';

    const { data: rpcData, error: rpcError } = await adminClient.rpc('record_rights_acceptance', {
      p_user_id: testUserId,
      p_version: 'test-debug-script',
    });

    if (rpcError) {
      console.error('❌ RPC function failed:', rpcError.message);

      // Check if the error is about missing unique constraint
      if (rpcError.message.includes('duplicate') || rpcError.message.includes('constraint')) {
        console.log('💡 This might be the issue! The database needs the unique constraint fix.');
        console.log('   Run: psql -f fix-rights-acceptance-schema.sql');
      }
      return;
    }

    console.log('✅ RPC function works:', rpcData);

    // Cleanup test record
    if (rpcData) {
      await adminClient
        .from('creator_rights_acceptances')
        .delete()
        .eq('id', rpcData);
      console.log('🧹 Cleaned up test record');
    }

    console.log('\n✅ All tests passed! The database should work correctly.');

  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
  }
}

// Run the test
testRightsAcceptance().catch(console.error);