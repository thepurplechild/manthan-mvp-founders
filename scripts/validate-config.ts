#!/usr/bin/env ts-node

/**
 * Configuration Validation Script
 *
 * Validates all environment variables and configuration for deployment
 */

import { getClientEnv } from '../lib/env.client.js'
import { getServerEnv } from '../lib/env.server.js'
import { readFileSync } from 'fs'
import { join } from 'path'

const isDevelopment = process.env.NODE_ENV !== 'production'

function logSuccess(message: string) {
  console.log(`✅ ${message}`)
}

function logWarning(message: string) {
  console.warn(`⚠️  ${message}`)
}

function logError(message: string) {
  console.error(`❌ ${message}`)
}

function logInfo(message: string) {
  console.log(`ℹ️  ${message}`)
}

async function validatePackageJson() {
  try {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'))

    // Check required dependencies for file processing
    const requiredDeps = [
      'pdf-parse',
      'mammoth',
      'adm-zip',
      'xml2js',
      'docx',
      'pdfjs-dist',
      'tesseract.js',
      'sharp',
      'file-type'
    ]

    const missingDeps = requiredDeps.filter(dep => !packageJson.dependencies[dep])

    if (missingDeps.length === 0) {
      logSuccess('All required file processing dependencies are present')
    } else {
      logError(`Missing required dependencies: ${missingDeps.join(', ')}`)
      return false
    }

    // Check Node.js version
    const nodeVersion = process.version
    const requiredVersion = packageJson.engines?.node || '>=18.17.0'
    logInfo(`Node.js version: ${nodeVersion} (required: ${requiredVersion})`)

    return true
  } catch (error) {
    logError(`Failed to validate package.json: ${error}`)
    return false
  }
}

async function validateVercelConfig() {
  try {
    const vercelConfigPath = join(process.cwd(), 'vercel.json')
    const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, 'utf-8'))

    // Check function configurations
    if (vercelConfig.functions) {
      logSuccess('Vercel function configurations found')

      // Check file processing functions have appropriate memory/timeout
      const fileProcessingFunctions = [
        'app/api/ingest/route.ts',
        'app/api/process-script/route.ts',
        'app/api/ingestions/run/route.ts'
      ]

      for (const func of fileProcessingFunctions) {
        const config = vercelConfig.functions[func]
        if (config) {
          if (config.memory >= 1024 && config.maxDuration >= 25) {
            logSuccess(`${func}: Appropriate memory (${config.memory}MB) and timeout (${config.maxDuration}s)`)
          } else {
            logWarning(`${func}: Consider increasing memory (${config.memory}MB) or timeout (${config.maxDuration}s)`)
          }
        }
      }
    }

    return true
  } catch (error) {
    logWarning('No vercel.json found or invalid configuration')
    return false
  }
}

async function validateEnvironment() {
  let clientValid = false
  let serverValid = false

  // Validate client environment
  try {
    const clientEnv = getClientEnv()
    logSuccess('Client environment variables validated')
    logInfo(`Supabase URL: ${clientEnv.NEXT_PUBLIC_SUPABASE_URL}`)
    logInfo(`App URL: ${clientEnv.NEXT_PUBLIC_APP_URL}`)
    clientValid = true
  } catch (error) {
    logError(`Client environment validation failed: ${error}`)
  }

  // Validate server environment
  try {
    const serverEnv = getServerEnv()
    logSuccess('Server environment variables validated')
    logInfo(`File max size: ${serverEnv.FILE_MAX_SIZE_MB}MB`)
    logInfo(`Pipeline max tokens: ${serverEnv.PIPELINE_MAX_TOKENS.toLocaleString()}`)
    logInfo(`Processing timeout: ${serverEnv.FILE_PROCESSING_TIMEOUT}ms`)
    logInfo(`Log level: ${serverEnv.LOG_LEVEL}`)
    serverValid = true
  } catch (error) {
    logError(`Server environment validation failed: ${error}`)
  }

  return clientValid && serverValid
}

async function validateDeploymentReadiness() {
  logInfo('='.repeat(60))
  logInfo('🚀 VERCEL DEPLOYMENT CONFIGURATION VALIDATION')
  logInfo('='.repeat(60))

  const results = await Promise.all([
    validateEnvironment(),
    validatePackageJson(),
    validateVercelConfig()
  ])

  const allValid = results.every(result => result)

  if (allValid) {
    logInfo('')
    logSuccess('🎉 All configurations are valid! Ready for deployment.')
    logInfo('')
    logInfo('📋 Deployment Checklist:')
    logInfo('1. ✅ Environment variables configured')
    logInfo('2. ✅ Package dependencies verified')
    logInfo('3. ✅ Vercel configuration optimized')
    logInfo('')
    logInfo('🔗 Next steps:')
    logInfo('1. Run `npm run build` to test production build')
    logInfo('2. Deploy to Vercel: `vercel --prod`')
    logInfo('3. Test the deployment with `/health` endpoint')

    process.exit(0)
  } else {
    logInfo('')
    logError('❌ Configuration validation failed!')
    logError('Please fix the above issues before deploying.')

    if (isDevelopment) {
      logInfo('')
      logInfo('📝 Development Setup:')
      logInfo('1. Copy .env.example to .env.local')
      logInfo('2. Fill in your API keys and configuration')
      logInfo('3. Run `npm install` to install missing dependencies')
      logInfo('4. Restart your development server')
    }

    process.exit(1)
  }
}

// Run validation
validateDeploymentReadiness().catch((error) => {
  logError(`Validation script failed: ${error}`)
  process.exit(1)
})