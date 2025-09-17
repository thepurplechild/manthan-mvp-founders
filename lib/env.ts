import { getServerEnv } from './env.server'
import { getClientEnv } from './env.client'

export { getServerEnv, getClientEnv }

/**
 * Unified validator for CI/local checks.
 * Calls server and client validators and throws on any failure.
 */
export function validateEnv(): void {
  const errors: string[] = []
  try {
    getServerEnv()
  } catch (e: unknown) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  try {
    getClientEnv()
  } catch (e: unknown) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  if (errors.length) {
    throw new Error(errors.join('\n'))
  }
}
