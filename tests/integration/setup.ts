import { execSync } from 'node:child_process'
import { beforeAll } from 'vitest'

beforeAll(() => {
  // Apply migrations + seed cleanly. Assumes `supabase start` already running.
  // `supabase db reset` automatically runs migrations then `supabase/seed.sql`.
  execSync('supabase db reset', { stdio: 'inherit' })
})
