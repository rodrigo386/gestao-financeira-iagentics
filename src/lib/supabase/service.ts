import 'server-only'
import { createClient } from '@supabase/supabase-js'

// server-only client that bypasses RLS — use sparingly, only for audit + system jobs
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
