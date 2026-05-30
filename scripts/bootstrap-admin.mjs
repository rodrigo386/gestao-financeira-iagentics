import { bootstrapAdmin } from './bootstrap-admin-core.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.BOOTSTRAP_ADMIN_EMAIL
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
const nome = process.env.BOOTSTRAP_ADMIN_NOME ?? 'Admin'

try {
  if (!email || !password) {
    throw new Error('defina BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD no ambiente')
  }
  const { status, userId } = await bootstrapAdmin({ url, serviceKey, email, password, nome })
  console.log(`✓ admin ${email} — ${status} (id=${userId})`)
  process.exit(0)
} catch (e) {
  console.error(`✗ bootstrap falhou: ${e.message}`)
  process.exit(1)
}
