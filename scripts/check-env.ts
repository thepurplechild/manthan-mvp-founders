/* eslint-disable no-console */
import { validateEnv } from '../lib/env'

async function main() {
  try {
    validateEnv()
    console.log('✅ Env OK')
  } catch (e: unknown) {
    console.error('❌ Environment validation failed:')
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}

main().catch((e: unknown) => {
  console.error('❌ Unexpected error in check-env')
  console.error(e instanceof Error ? e.stack || e.message : String(e))
  process.exit(1)
})
