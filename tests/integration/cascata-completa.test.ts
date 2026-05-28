import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { categorizar } from '@/modules/categorizacao/cascata'
import { LIMIAR_PENDENTE } from '@/modules/categorizacao/cascata'

// Force LLM mock to avoid real Anthropic calls
process.env.LLM_MODE = 'mock'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('cascata completa', () => {
  let db: ReturnType<typeof admin>

  beforeEach(() => { db = admin() })

  it('regra wins over LLM when pattern matches', async () => {
    const { data: categoria } = await db.from('categorias').select('id, nome').eq('nome', 'LLM/API').single()
    const { data: regra } = await db.from('regras_categorizacao').insert({
      pattern: 'AWS', pattern_tipo: 'contains', campo: 'descricao',
      categoria_id: categoria!.id, prioridade: 200, ativa: true,
    }).select().single()

    const result = await categorizar({
      descricao: 'AWS Cloud Services',
      valor: 500,
      regras: [regra! as never],
      historico: [],
      categorias: [{ id: categoria!.id, nome: categoria!.nome }],
    })
    expect(result.metodo).toBe('regra')
    expect(result.confianca).toBe(1.0)
    expect(result.categoria_id).toBe(categoria!.id)
  })

  it('falls through to LLM mock when no regra', async () => {
    const { data: cats } = await db.from('categorias').select('id, nome').limit(3)
    const result = await categorizar({
      descricao: 'Unknown vendor xyz',
      valor: 100,
      regras: [],
      historico: [],
      categorias: cats! as { id: string; nome: string }[],
    })
    expect(result.metodo).toBe('llm')
    // Mock with no match returns low confidence
    expect(result.pendente).toBe(true)
    expect(result.confianca).toBeLessThanOrEqual(LIMIAR_PENDENTE)
  })
})
