import { Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:54321'
// Service role key for local Supabase (safe to hard-code; local dev only)
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// Cookie name: sb-{hostname[0]}-auth-token (see @supabase/supabase-js SupabaseClient.ts)
const COOKIE_NAME = 'sb-127-auth-token'
const E2E_EMAIL = 'e2e-admin@iagentics.test'
const E2E_PASSWORD = 'e2e-test-local-only-123'

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Logs in the e2e admin user by:
 * 1. Ensuring the user exists in Supabase auth with a known password
 * 2. Ensuring the user has admin role in the usuarios table
 * 3. Getting a session via signInWithPassword (bypasses email/PKCE complexity)
 * 4. Injecting the session as a cookie into the Playwright browser context
 * 5. Navigating to / — the middleware recognizes the session and allows access
 *
 * This approach is reliable in concurrent Playwright worker environments
 * because it doesn't depend on Mailpit email timing or PKCE cookie state.
 */
export async function login(page: Page) {
  const db = adminClient()

  // Step 1: Ensure the e2e test user exists in auth
  const { data: { users } } = await db.auth.admin.listUsers()
  let userId: string | undefined = users.find((u) => u.email === E2E_EMAIL)?.id

  if (!userId) {
    const { data: created } = await db.auth.admin.createUser({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      email_confirm: true,
    })
    userId = created.user?.id
  } else {
    // Ensure password is set (may not be if user was created via magic link)
    await db.auth.admin.updateUserById(userId, { password: E2E_PASSWORD })
  }

  if (!userId) throw new Error('Failed to create or find e2e test user')

  // Step 2: Ensure this user is the sole admin in the usuarios table
  // Demote any other existing admins first (singleton constraint)
  await db.from('usuarios').update({ role: 'leitura' }).eq('role', 'admin').neq('id', userId)
  await db.from('usuarios').upsert(
    { id: userId, nome: 'E2E Admin', role: 'admin' },
    { onConflict: 'id', ignoreDuplicates: false },
  )

  // Step 3: Get a session via password login
  const anonDb = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { session }, error } = await anonDb.auth.signInWithPassword({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
  })
  if (error || !session) throw new Error(`signInWithPassword failed: ${error?.message}`)

  // Step 4: Inject the session cookie into the browser context.
  // @supabase/ssr reads this cookie on the server side via createServerClient.
  // The cookie value is JSON.stringify(session) chunked if > 3180 chars.
  const sessionJson = JSON.stringify(session)
  const context = page.context()

  if (sessionJson.length <= 3180) {
    await context.addCookies([{
      name: COOKIE_NAME,
      value: sessionJson,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    }])
  } else {
    // Chunk the session cookie (matches @supabase/ssr chunking behavior)
    const chunkSize = 3180
    const chunks = []
    for (let i = 0; i < sessionJson.length; i += chunkSize) {
      chunks.push(sessionJson.slice(i, i + chunkSize))
    }
    await context.addCookies(
      chunks.map((chunk, idx) => ({
        name: idx === 0 ? COOKIE_NAME : `${COOKIE_NAME}.${idx}`,
        value: chunk,
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
      })),
    )
  }

  // Step 5: Navigate to the app — middleware should recognize the session
  await page.goto('/')
  await page.waitForURL(/localhost:3000\/(?!login)/, { timeout: 10000 })
}
