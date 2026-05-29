import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll } from 'vitest'

// Load .env.local so SUPABASE_SERVICE_ROLE_KEY and other vars are available in tests
const envLocalPath = resolve(process.cwd(), '.env.local')
if (existsSync(envLocalPath)) {
  const lines = readFileSync(envLocalPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!(key in process.env)) process.env[key] = val
  }
}

beforeAll(() => {
  // Apply migrations + seed cleanly. Assumes `supabase start` already running.
  // `supabase db reset` automatically runs migrations then `supabase/seed.sql`.
  execSync('supabase db reset', { stdio: 'inherit' })
})
