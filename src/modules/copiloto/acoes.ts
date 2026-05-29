import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { withAudit } from '@/lib/audit'
import { ProposedActionSchema, type ProposedAction, type ResultadoAcao } from './types'
import { recomputarProjecoes } from '@/modules/forecast/cenarios'
import { fecharMes } from '@/modules/metricas/fechamento'

export const ACOES_TOOLS: Anthropic.Tool[] = [
  {
    name: 'propor_salvar_cenario',
    description: 'Propõe salvar um cenário de forecast com os drivers simulados. NÃO executa — requer confirmação do usuário.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        drivers: {
          type: 'object',
          properties: {
            novos_clientes_mes: { type: 'number' }, churn_pct: { type: 'number' },
            ticket_medio_novo: { type: 'number' }, novos_projetos_mes: { type: 'number' },
            valor_medio_projeto: { type: 'number' }, duracao_projeto_meses: { type: 'number' },
            crescimento_despesa_pct: { type: 'number' },
          },
        },
      },
      required: ['nome', 'drivers'],
    },
  },
  {
    name: 'propor_marcar_alertas_lidos',
    description: 'Propõe marcar alertas como lidos. NÃO executa — requer confirmação.',
    input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
  },
  {
    name: 'propor_fechar_mes',
    description: 'Propõe fechar um mês (grava snapshot + commentary). NÃO executa — requer confirmação e role admin.',
    input_schema: { type: 'object', properties: { mes_ref: { type: 'string', description: 'primeiro dia do mês YYYY-MM-01' } }, required: ['mes_ref'] },
  },
  {
    name: 'propor_criar_regra',
    description: 'Propõe criar uma regra de categorização (padrão→categoria). NÃO executa — requer confirmação.',
    input_schema: { type: 'object', properties: { padrao: { type: 'string' }, categoria_id: { type: 'string' } }, required: ['padrao', 'categoria_id'] },
  },
]

const NOMES_ACAO = new Set(ACOES_TOOLS.map((t) => t.name))
export function isAcaoTool(name: string): boolean {
  return NOMES_ACAO.has(name)
}

/** Converte um tool_use de proposta numa ProposedAction validada (ou lança). */
export function parseProposedAction(toolName: string, input: unknown): ProposedAction {
  const map: Record<string, string> = {
    propor_salvar_cenario: 'salvar_cenario',
    propor_marcar_alertas_lidos: 'marcar_alertas_lidos',
    propor_fechar_mes: 'fechar_mes',
    propor_criar_regra: 'criar_regra',
  }
  const tipo = map[toolName]
  if (!tipo) throw new Error(`tool de proposta desconhecida: ${toolName}`)
  return ProposedActionSchema.parse({ tipo, ...(input as object) })
}

/** Write-leaf: executa uma ação confirmada. Re-checa role para ações sensíveis. Audita tudo. */
export async function executarAcao(
  acao: ProposedAction,
  usuario: { id: string; role: string },
): Promise<ResultadoAcao> {
  const admin = createServiceClient()
  switch (acao.tipo) {
    case 'salvar_cenario': {
      const { data: existente } = await admin
        .from('forecast_cenarios').select('id').eq('nome', acao.nome).maybeSingle()
      const id = existente?.id ?? crypto.randomUUID()
      return withAudit(
        {
          usuario_id: usuario.id,
          acao: existente ? 'update' : 'insert',
          tabela: 'forecast_cenarios',
          registro_id: id,
          before: null,
          after: { nome: acao.nome, drivers_json: acao.drivers },
          motivo: 'copiloto: salvar cenário',
        },
        async () => {
          if (existente) {
            const { error } = await admin.from('forecast_cenarios').update({ drivers_json: acao.drivers }).eq('id', id)
            if (error) throw new Error(`salvar_cenario update: ${error.message}`)
          } else {
            const { error } = await admin.from('forecast_cenarios').insert({ id, nome: acao.nome, drivers_json: acao.drivers, ativo: true })
            if (error) throw new Error(`salvar_cenario: ${error.message}`)
          }
          await recomputarProjecoes(id)
          return { ok: true, detalhe: `Cenário "${acao.nome}" salvo e projeções recalculadas.` }
        },
      )
    }
    case 'marcar_alertas_lidos': {
      return withAudit(
        {
          usuario_id: usuario.id,
          acao: 'update',
          tabela: 'alertas',
          registro_id: acao.ids[0]!,
          before: null,
          after: { lido: true },
          motivo: 'copiloto: marcar alertas lidos',
          contexto: { ids: acao.ids },
        },
        async () => {
          const { error } = await admin
            .from('alertas').update({ lido: true, lido_em: new Date().toISOString(), lido_por: usuario.id }).in('id', acao.ids)
          if (error) throw new Error(`marcar_alertas_lidos: ${error.message}`)
          return { ok: true, detalhe: `${acao.ids.length} alerta(s) marcado(s) como lido(s).` }
        },
      )
    }
    case 'fechar_mes': {
      if (usuario.role !== 'admin') throw new Error('apenas admin pode fechar o mês')
      return withAudit(
        {
          usuario_id: usuario.id,
          acao: 'custom',
          tabela: 'metricas_mensais',
          registro_id: acao.mes_ref,
          before: null,
          after: { mes_ref: acao.mes_ref },
          motivo: 'copiloto: fechar mês',
        },
        async () => {
          await fecharMes(acao.mes_ref, usuario.id)
          return { ok: true, detalhe: `Mês ${acao.mes_ref} fechado.` }
        },
      )
    }
    case 'criar_regra': {
      const id = crypto.randomUUID()
      return withAudit(
        {
          usuario_id: usuario.id,
          acao: 'insert',
          tabela: 'regras_categorizacao',
          registro_id: id,
          before: null,
          after: { pattern: acao.padrao, categoria_id: acao.categoria_id },
          motivo: 'copiloto: criar regra',
        },
        async () => {
          const { error } = await admin
            .from('regras_categorizacao').insert({ id, pattern: acao.padrao, categoria_id: acao.categoria_id, pattern_tipo: 'contains', campo: 'descricao', origem: 'manual' })
          if (error) throw new Error(`criar_regra: ${error.message}`)
          return { ok: true, detalhe: `Regra "${acao.padrao}" criada.` }
        },
      )
    }
  }
}
