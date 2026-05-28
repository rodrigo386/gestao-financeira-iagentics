import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { categorizar } from '@/modules/categorizacao/cascata'
import type { Regra } from '@/lib/schemas/regra'

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createServiceClient()

  // Fetch uncategorized Pluggy lancamentos
  const { data: lancs, error } = await admin
    .from('lancamentos')
    .select('id, descricao, valor')
    .is('categoria_id', null)
    .eq('origem', 'pluggy')
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Load supporting data
  const today = new Date()
  const { data: regrasRows } = await admin.from('regras_categorizacao').select('*').eq('ativa', true)
  const { data: categoriasRows } = await admin.from('categorias').select('id, nome').eq('ativa', true)
  const { data: historicoRows } = await admin
    .from('lancamentos')
    .select('descricao, categoria_id, fornecedor_id')
    .not('categoria_id', 'is', null)
    .gte('data', new Date(today.getTime() - 180 * 86400_000).toISOString().slice(0, 10))
    .limit(500)

  const regras = (regrasRows ?? []) as Regra[]
  const categorias = (categoriasRows ?? []).map((c) => ({ id: c.id, nome: c.nome }))
  const historico = (historicoRows ?? []).map((h) => ({
    descricao: h.descricao,
    categoria_id: h.categoria_id as string,
    fornecedor_id: h.fornecedor_id as string | null,
  }))

  let processados = 0, atualizados = 0, ainda_pendentes = 0

  for (const l of lancs ?? []) {
    processados++
    const cat = await categorizar({
      descricao: l.descricao,
      valor: Number(l.valor),
      regras,
      historico,
      categorias,
    })

    if (!cat.pendente) {
      await admin.from('lancamentos').update({
        categoria_id: cat.categoria_id,
        categorizacao_metodo: cat.metodo,
        categorizacao_confianca: cat.confianca,
      }).eq('id', l.id)
      atualizados++
    } else {
      ainda_pendentes++
    }
  }

  return NextResponse.json({ processados, atualizados, ainda_pendentes })
}
