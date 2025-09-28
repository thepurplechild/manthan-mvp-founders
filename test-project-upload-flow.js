#!/usr/bin/env node
/**
 * Test script for Project Upload Flow
 * Tests the complete pipeline from project creation to file upload and processing
 */

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Test user credentials (you'll need to create a test user)
const TEST_USER = {
  email: 'test@example.com',
  password: 'test123456'
};

async function createTestFile() {
  const testContent = `
# Test Script

This is a test script for validating the upload pipeline.

## Characters
- PROTAGONIST: A young developer learning about file uploads
- ANTAGONIST: Broken pipelines and database issues

## Scene 1

The protagonist discovers that files aren't being properly linked to projects...

## Scene 2

After much debugging, they implement proper validation and error handling...

## Scene 3

Success! The upload pipeline works perfectly.

THE END
`;

  const filePath = path.join(__dirname, 'test-script.txt');
  fs.writeFileSync(filePath, testContent);
  return filePath;
}

async function testProjectUploadFlow() {
  console.log('🧪 Testing Project Upload Flow...\n');

  // 1. Create admin client for setup
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 2. Create or authenticate test user
  console.log('👤 Setting up test user...');

  let userClient;
  try {
    // Try to sign in first
    userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword(TEST_USER);

    if (signInError) {
      console.log('Creating new test user...');
      // Create user if sign in fails
      const { data: signUpData, error: signUpError } = await userClient.auth.signUp(TEST_USER);
      if (signUpError) {
        console.error('❌ Failed to create test user:', signUpError.message);
        return;
      }
      console.log('✅ Test user created');
    } else {
      console.log('✅ Test user authenticated');
    }

    // Get the current user
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('❌ Failed to get user data:', userError?.message);
      return;
    }

    console.log(`✅ User ID: ${user.id}\n`);

    // 3. Create a test project
    console.log('📁 Creating test project...');
    const projectData = {
      title: `Test Project ${Date.now()}`,
      status: 'draft',
      logline: 'A test project for validating the upload pipeline',
      synopsis: 'This project exists solely to test that our upload flow works correctly.',
      genre: ['Testing', 'DevOps'],
      owner_id: user.id
    };

    const { data: project, error: projectError } = await userClient
      .from('projects')
      .insert(projectData)
      .select()
      .single();

    if (projectError) {
      console.error('❌ Failed to create project:', projectError.message);
      return;
    }

    console.log(`✅ Project created: ${project.id} - "${project.title}"\n`);

    // 4. Create test file
    console.log('📄 Creating test file...');
    const testFilePath = createTestFile();
    console.log(`✅ Test file created: ${testFilePath}\n`);

    // 5. Test upload API
    console.log('📤 Testing upload API...');

    const form = new FormData();
    form.append('file', fs.createReadStream(testFilePath));
    form.append('project_id', project.id);

    // Get session for auth
    const { data: { session } } = await userClient.auth.getSession();
    if (!session) {
      console.error('❌ No session available for upload');
      return;
    }

    const uploadResponse = await fetch('http://localhost:3000/api/uploads', {
      method: 'POST',
      body: form,
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('❌ Upload failed:', uploadResponse.status, errorText);
      return;
    }

    const uploadResult = await uploadResponse.json();
    console.log('✅ Upload successful:', {
      ingestion_id: uploadResult.ingestion_id,
      status: uploadResult.status,
      path: uploadResult.path
    });

    // 6. Verify database records
    console.log('\n🔍 Verifying database records...');

    // Check ingestion record
    const { data: ingestion, error: ingestionError } = await adminClient
      .from('ingestions')
      .select('*')
      .eq('id', uploadResult.ingestion_id)
      .single();

    if (ingestionError) {
      console.error('❌ Failed to fetch ingestion record:', ingestionError.message);
      return;
    }

    console.log('✅ Ingestion record found:', {
      id: ingestion.id,
      project_id: ingestion.project_id,
      user_id: ingestion.user_id,
      status: ingestion.status,
      progress: ingestion.progress
    });

    // Verify project association
    if (ingestion.project_id !== project.id) {
      console.error('❌ Project association failed:', {
        expected: project.id,
        actual: ingestion.project_id
      });
      return;
    }

    console.log('✅ Project association correct');

    // Check ingestion steps
    const { data: steps, error: stepsError } = await adminClient
      .from('ingestion_steps')
      .select('*')
      .eq('ingestion_id', ingestion.id)
      .order('name');

    if (stepsError) {
      console.error('❌ Failed to fetch ingestion steps:', stepsError.message);
      return;
    }

    console.log(`✅ Ingestion steps created: ${steps.length} steps`, steps.map(s => s.name));

    // 7. Test project upload summary function
    console.log('\n📊 Testing project upload summary...');
    const { data: summary, error: summaryError } = await adminClient
      .rpc('get_project_upload_summary', { p_project_id: project.id });

    if (summaryError) {
      console.error('❌ Failed to get project summary:', summaryError.message);
    } else {
      console.log('✅ Project upload summary:', summary[0]);
    }

    // 8. Test permission validation function
    console.log('\n🔐 Testing permission validation...');
    const { data: canUpload, error: permError } = await adminClient
      .rpc('can_user_upload_to_project', {
        p_user_id: user.id,
        p_project_id: project.id
      });

    if (permError) {
      console.error('❌ Permission check failed:', permError.message);
    } else {
      console.log(`✅ Permission check result: ${canUpload}`);
    }

    // 9. Test unauthorized access
    console.log('\n🚫 Testing unauthorized access prevention...');
    const fakeProjectId = '00000000-0000-0000-0000-000000000000';

    const { data: canUploadFake, error: permErrorFake } = await adminClient
      .rpc('can_user_upload_to_project', {
        p_user_id: user.id,
        p_project_id: fakeProjectId
      });

    if (permErrorFake) {
      console.log('✅ Correctly rejected access to non-existent project');
    } else if (!canUploadFake) {
      console.log('✅ Correctly denied access to non-owned project');
    } else {
      console.error('❌ Security issue: allowed access to unauthorized project');
    }

    // 10. Cleanup
    console.log('\n🧹 Cleaning up test data...');

    // Delete ingestion (will cascade to steps)
    await adminClient.from('ingestions').delete().eq('id', ingestion.id);

    // Delete project
    await adminClient.from('projects').delete().eq('id', project.id);

    // Delete test file
    fs.unlinkSync(testFilePath);

    console.log('✅ Cleanup completed');

    console.log('\n🎉 All tests passed! The project upload flow is working correctly.');

  } catch (error) {
    console.error('💥 Test failed with error:', error);
  }
}

// Run the test
if (require.main === module) {
  testProjectUploadFlow()
    .then(() => {
      console.log('\n✅ Test suite completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { testProjectUploadFlow };