import { createClient } from '@supabase/supabase-js'

/**
 * Cria (ou define a senha de) o primeiro admin e garante sua linha em usuarios.
 * Idempotente: re-rodar atualiza a senha e mantém um único admin.
 * @returns {Promise<{ status: 'created'|'password-updated', userId: string }>}
 */
export async function bootstrapAdmin({ url, serviceKey, email, password, nome }) {
  if (!url || !serviceKey) throw new Error('url e serviceKey obrigatórios')
  if (!email || !password) throw new Error('email e password obrigatórios')

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) throw new Error(`listUsers: ${listErr.message}`)
  const existing = (list?.users ?? []).find((u) => u.email === email)

  let userId
  let status
  if (!existing) {
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome: nome ?? 'Admin' },
    })
    if (error || !created.user) throw new Error(`createUser: ${error?.message ?? 'falhou'}`)
    userId = created.user.id
    status = 'created'
  } else {
    const { error } = await db.auth.admin.updateUserById(existing.id, { password })
    if (error) throw new Error(`updateUserById: ${error.message}`)
    userId = existing.id
    status = 'password-updated'
  }

  const { error: upErr } = await db
    .from('usuarios')
    .upsert({ id: userId, nome: nome ?? 'Admin', role: 'admin' }, { onConflict: 'id', ignoreDuplicates: false })
  if (upErr) throw new Error(`upsert usuarios: ${upErr.message}`)

  return { status, userId }
}
