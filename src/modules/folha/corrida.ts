import type { NewContaAPagar } from '@/lib/schemas/ap'
import type { Funcionario } from '@/lib/schemas/funcionario'
import type { Folha, ItemFolha } from '@/lib/schemas/folha'
import { calcularItemFolha, type FaixaFiscal } from './calculo'

export type ListFolhasParams = { ano?: number; status?: 'aberta' | 'fechada' }

export async function listarFolhas(p: ListFolhasParams = {}) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  let q = supabase.from('folha').select('*').order('mes_ref', { ascending: false })
  if (p.status) q = q.eq('status', p.status)
  if (p.ano) {
    q = q.gte('mes_ref', `${p.ano}-01-01`).lte('mes_ref', `${p.ano}-12-31`)
  }
  const { data, error } = await q
  if (error) throw new Error(`listarFolhas: ${error.message}`)
  return (data ?? []) as Folha[]
}

export async function buscarFolha(id: string) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data, error } = await supabase.from('folha').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarFolha: ${error.message}`)
  return data as Folha | null
}

export async function listarItensFolha(folhaId: string) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('itens_folha')
    .select('*, funcionario:funcionarios(nome, cargo, tipo)')
    .eq('folha_id', folhaId)
  if (error) throw new Error(`listarItensFolha: ${error.message}`)
  return data ?? []
}

/**
 * Opens the run for a given month: creates the folha row + one itens_folha row
 * per active funcionario, computed via calcularItemFolha using the current year's tax tables.
 */
export async function abrirFolha(mesRef: string, usuarioId: string) {
  const { createClient } = await import('@/lib/supabase/server')
  const { createServiceClient } = await import('@/lib/supabase/service')
  const { withAudit } = await import('@/lib/audit')
  const supabase = await createClient()

  // Load tax tables for the year of mesRef
  const ano = parseInt(mesRef.slice(0, 4), 10)
  const { data: tabelas, error: tErr } = await supabase
    .from('tabelas_fiscais').select('*').eq('ano', ano)
  if (tErr) throw new Error(`abrirFolha: ${tErr.message}`)
  const inssRow = (tabelas ?? []).find((t: { tipo: string }) => t.tipo === 'inss')
  const irrfRow = (tabelas ?? []).find((t: { tipo: string }) => t.tipo === 'irrf')
  if (!inssRow || !irrfRow) {
    throw new Error(`abrirFolha: tabelas_fiscais para ano ${ano} não encontradas`)
  }
  const inssFaixas = inssRow.faixas_json as FaixaFiscal[]
  const irrfFaixas = irrfRow.faixas_json as FaixaFiscal[]

  // Active funcionarios at mesRef
  const { data: funcionarios, error: fErr } = await supabase
    .from('funcionarios').select('*').eq('ativo', true)
    .lte('data_admissao', mesRef)
  if (fErr) throw new Error(`abrirFolha: ${fErr.message}`)

  // Create folha
  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'insert',
      tabela: 'folha',
      registro_id: '00000000-0000-0000-0000-000000000000',  // overwritten below
      before: null,
      after: { mes_ref: mesRef },
      motivo: 'abrir folha',
    },
    async () => {
      const { data: folha, error: cErr } = await supabase
        .from('folha').insert({ mes_ref: mesRef, status: 'aberta' }).select().single()
      if (cErr) throw new Error(`abrirFolha: ${cErr.message}`)

      // Insert itens (service-role to bypass any RLS edge case)
      const admin = createServiceClient()
      const itens = (funcionarios as Funcionario[])
        .filter((f) => !f.data_desligamento || f.data_desligamento >= mesRef)
        .map((f) => ({
          folha_id: folha.id,
          funcionario_id: f.id,
          ...calcularItemFolha(f, inssFaixas, irrfFaixas),
        }))
      if (itens.length > 0) {
        const { error: iErr } = await admin.from('itens_folha').insert(itens)
        if (iErr) throw new Error(`abrirFolha (itens): ${iErr.message}`)
      }
      return folha as Folha
    },
  )
}

export type APCategorias = {
  salarioCategoria: string
  fgtsCategoria: string
  inssCategoria: string
  beneficiosCategoria: string
}

/**
 * Build APs for a single item: salário líquido, FGTS, INSS (func+patronal), benefícios.
 * Pure function — no DB writes.
 */
export function buildAPsFromItem(
  item: ItemFolha,
  funcionario: Funcionario,
  mesRef: string,
  cats: APCategorias,
): NewContaAPagar[] {
  const nextMonth = addMonths(mesRef, 1)
  const aps: NewContaAPagar[] = []

  // Salário líquido → funcionario
  aps.push({
    tipo_credor: 'funcionario',
    credor_id: funcionario.id,
    origem: 'folha',
    origem_id: item.id,
    descricao: `Salário ${funcionario.nome} ${formatMesRef(mesRef)}`,
    valor: item.liquido_pagar,
    moeda: 'BRL',
    data_vencimento: dia(nextMonth, 5),
    categoria_id: cats.salarioCategoria,
    status: 'previsto',
  })

  // FGTS → Caixa
  if (item.fgts > 0) {
    aps.push({
      tipo_credor: 'orgao_publico',
      origem: 'folha',
      origem_id: item.id,
      descricao: `FGTS ${funcionario.nome} ${formatMesRef(mesRef)}`,
      valor: item.fgts,
      moeda: 'BRL',
      data_vencimento: dia(nextMonth, 7),
      categoria_id: cats.fgtsCategoria,
      status: 'previsto',
    })
  }

  // INSS (funcionario + patronal) → Receita Federal
  const totalINSS = round2(item.inss_funcionario + item.inss_patronal)
  if (totalINSS > 0) {
    aps.push({
      tipo_credor: 'orgao_publico',
      origem: 'folha',
      origem_id: item.id,
      descricao: `INSS ${funcionario.nome} ${formatMesRef(mesRef)}`,
      valor: totalINSS,
      moeda: 'BRL',
      data_vencimento: dia(nextMonth, 20),
      categoria_id: cats.inssCategoria,
      status: 'previsto',
    })
  }

  // Benefícios externos (VR/VA → operadora) — skip if zero
  if (item.beneficios_valor > 0) {
    aps.push({
      tipo_credor: 'fornecedor',
      origem: 'folha',
      origem_id: item.id,
      descricao: `Benefícios ${funcionario.nome} ${formatMesRef(mesRef)}`,
      valor: item.beneficios_valor,
      moeda: 'BRL',
      data_vencimento: dia(nextMonth, 5),
      categoria_id: cats.beneficiosCategoria,
      status: 'previsto',
    })
  }

  return aps
}

/**
 * Close the run: generates APs for all items via buildAPsFromItem + audit log.
 */
export async function fecharFolha(folhaId: string, usuarioId: string, cats: APCategorias) {
  const { createClient } = await import('@/lib/supabase/server')
  const { withAudit } = await import('@/lib/audit')
  const { inserirAPBatch } = await import('@/modules/contas-pagar/ap')
  const supabase = await createClient()
  const { data: folha, error: fErr } = await supabase.from('folha').select('*').eq('id', folhaId).single()
  if (fErr) throw new Error(`fecharFolha: ${fErr.message}`)
  if (folha.status === 'fechada') throw new Error('folha já fechada')

  const { data: itens } = await supabase.from('itens_folha').select('*').eq('folha_id', folhaId)
  const funcIds = (itens ?? []).map((i: { funcionario_id: string }) => i.funcionario_id)
  const { data: funcionarios } = await supabase.from('funcionarios').select('*').in('id', funcIds)

  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'update',
      tabela: 'folha',
      registro_id: folhaId,
      before: folha as Record<string, unknown>,
      after: { ...(folha as Record<string, unknown>), status: 'fechada' },
      motivo: 'fechar folha',
    },
    async () => {
      // Build APs
      const allAPs = (itens ?? []).flatMap((item: ItemFolha) => {
        const func = (funcionarios as Funcionario[]).find((f) => f.id === item.funcionario_id)
        if (!func) return []
        return buildAPsFromItem(item, func, folha.mes_ref, cats)
      })

      await inserirAPBatch(allAPs)

      // Generate holerite PDFs for each item (best-effort — failure does not block close)
      const { data: orgRow } = await supabase.from('organizacao').select('nome').limit(1).single()
      const orgNome = (orgRow?.nome as string) ?? 'IAgentics'

      for (const item of itens ?? []) {
        const func = (funcionarios as Funcionario[]).find((f) => f.id === item.funcionario_id)
        if (!func) continue
        try {
          const { gerarHoleritePDF, uploadHolerite } = await import('@/modules/folha/holerite')
          const pdfBytes = await gerarHoleritePDF(item as ItemFolha, func, folha.mes_ref, orgNome)
          await uploadHolerite(item.id, pdfBytes)
        } catch (pdfErr) {
          console.error(`fecharFolha: holerite generation failed for item ${item.id}:`, pdfErr)
        }
      }

      // Close folha
      const { data, error } = await supabase
        .from('folha')
        .update({
          status: 'fechada',
          fechada_em: new Date().toISOString(),
          fechada_por: usuarioId,
        })
        .eq('id', folhaId).select().single()
      if (error) throw new Error(`fecharFolha: ${error.message}`)
      return data as Folha
    },
  )
}

function addMonths(dateStr: string, months: number): string {
  const parts = dateStr.split('-').map(Number)
  const y = parts[0]!; const m = parts[1]!
  const nextY = m + months > 12 ? y + Math.floor((m + months - 1) / 12) : y
  const nextM = ((m + months - 1) % 12) + 1
  return `${nextY}-${String(nextM).padStart(2, '0')}-01`
}

function dia(monthStart: string, d: number): string {
  const parts = monthStart.split('-').map(Number)
  const y = parts[0]!; const m = parts[1]!
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function formatMesRef(mesRef: string): string {
  const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
  const parts = mesRef.split('-').map(Number)
  return `${meses[parts[1]! - 1]}/${parts[0]}`
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
