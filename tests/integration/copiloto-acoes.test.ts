import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { executarAcao, parseProposedAction, isAcaoTool } from '@/modules/copiloto/acoes'

process.env.LLM_MODE = 'mock'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'

function admin() {
  return createClient('http://127.0.0.1:54321', process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// The lido_por FK on alertas references public.usuarios(id) → auth.users(id).
// We need a valid auth user for write-leaf tests. Create one via the admin API.
const TEST_USER_EMAIL = `test-acoes-${Date.now()}@iagentics.test`
let seededUserId: string

async function seedUser(): Promise<{ id: string; role: string }> {
  if (seededUserId) return { id: seededUserId, role: 'admin' }
  const db = admin()
  // Create auth user via admin API (service role bypasses email confirmation)
  const { data: authData, error: authErr } = await db.auth.admin.createUser({
    email: TEST_USER_EMAIL,
    password: 'Test1234!',
    email_confirm: true,
  })
  if (authErr) throw new Error(`seed auth user: ${authErr.message}`)
  const uid = authData.user.id
  // Insert into public.usuarios (service client bypasses RLS)
  await db.from('usuarios').insert({ id: uid, nome: 'Test Admin', role: 'admin' })
  seededUserId = uid
  return { id: uid, role: 'admin' }
}

describe('copiloto ações', () => {
  it('isAcaoTool reconhece tools de proposta', () => {
    expect(isAcaoTool('propor_fechar_mes')).toBe(true)
    expect(isAcaoTool('get_estado_atual')).toBe(false)
  })

  it('parseProposedAction valida e tipa', () => {
    const a = parseProposedAction('propor_fechar_mes', { mes_ref: '2026-04-01' })
    expect(a.tipo).toBe('fechar_mes')
  })

  it('marcar_alertas_lidos marca o alerta', async () => {
    const db = admin()
    const adminUser = await seedUser()
    const { data: al } = await db.from('alertas')
      .insert({ tipo: 'caixa_baixo', severidade: 'info', titulo: `t-${Date.now()}`, mensagem: 'm' }).select('id').single()
    const r = await executarAcao({ tipo: 'marcar_alertas_lidos', ids: [al!.id] }, adminUser)
    expect(r.ok).toBe(true)
    const { data: depois } = await db.from('alertas').select('lido').eq('id', al!.id).single()
    expect(depois!.lido).toBe(true)
  })

  it('fechar_mes exige admin', async () => {
    await expect(
      executarAcao({ tipo: 'fechar_mes', mes_ref: '2026-04-01' }, { id: 'x', role: 'financeiro' }),
    ).rejects.toThrow(/admin/i)
  })

  it('criar_regra insere a regra', async () => {
    const db = admin()
    const adminUser = await seedUser()
    const { data: cat } = await db.from('categorias').select('id').limit(1).single()
    const r = await executarAcao({ tipo: 'criar_regra', padrao: `AWS-${Date.now()}`, categoria_id: cat!.id }, adminUser)
    expect(r.ok).toBe(true)
  })
})
