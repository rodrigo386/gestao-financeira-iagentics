import type { NewAlerta } from '@/lib/schemas/alerta'

export function avaliarRunway(runwayMeses: number | null): NewAlerta | null {
  if (runwayMeses === null) return null
  if (runwayMeses <= 6) {
    return {
      tipo: 'runway_critico',
      severidade: 'critical',
      titulo: `Runway crítico: ${runwayMeses} meses`,
      mensagem: `O cenário Base projeta runway de apenas ${runwayMeses} meses. Ação imediata recomendada.`,
      contexto_json: { runway_meses: runwayMeses },
    }
  }
  if (runwayMeses <= 12) {
    return {
      tipo: 'runway_atencao',
      severidade: 'warning',
      titulo: `Runway abaixo de 12 meses (${runwayMeses})`,
      mensagem: `Cenário Base projeta runway de ${runwayMeses} meses.`,
      contexto_json: { runway_meses: runwayMeses },
    }
  }
  return null
}

export type APOverdueRow = { id: string; descricao: string; valor: number; data_vencimento: string }
export function avaliarAPAtrasada(overdue: APOverdueRow[]): NewAlerta | null {
  if (overdue.length === 0) return null
  const total = overdue.reduce((s, r) => s + r.valor, 0)
  return {
    tipo: 'ap_atrasada',
    severidade: 'warning',
    titulo: `${overdue.length} AP atrasada(s) — R$ ${total.toFixed(2)}`,
    mensagem: `${overdue.length} contas a pagar venceram. Revisar urgente.`,
    contexto_json: { ids: overdue.map((r) => r.id), total },
  }
}

export type AROverdueRow = { id: string; cliente_nome: string; valor: number; data_vencimento: string }
export function avaliarARAtrasada(overdue: AROverdueRow[]): NewAlerta | null {
  if (overdue.length === 0) return null
  const total = overdue.reduce((s, r) => s + r.valor, 0)
  return {
    tipo: 'ar_atrasada',
    severidade: 'warning',
    titulo: `${overdue.length} AR atrasada(s) — R$ ${total.toFixed(2)}`,
    mensagem: `${overdue.length} contas a receber estão em atraso. Acionar cobrança.`,
    contexto_json: { ids: overdue.map((r) => r.id), total },
  }
}

export type ContratoVencendo = { id: string; cliente_nome: string; nome: string; data_fim: string }
export function avaliarContratoVencendo(rows: ContratoVencendo[]): NewAlerta | null {
  if (rows.length === 0) return null
  return {
    tipo: 'contrato_vencendo',
    severidade: 'info',
    titulo: `${rows.length} contrato(s) vencem em 30–60 dias`,
    mensagem: `Iniciar conversa de renovação com: ${rows.map((r) => r.cliente_nome).join(', ')}`,
    contexto_json: { ids: rows.map((r) => r.id) },
  }
}

export type DespesaAnomalaRow = { id: string; valor: number; descricao: string; categoria_nome: string; media_90d: number }
export function avaliarDespesaAnomala(rows: DespesaAnomalaRow[]): NewAlerta | null {
  const anomalas = rows.filter((r) => r.valor > 2 * r.media_90d)
  if (anomalas.length === 0) return null
  return {
    tipo: 'despesa_anomala',
    severidade: 'warning',
    titulo: `${anomalas.length} despesa(s) acima de 2× média 90d`,
    mensagem: `Verificar: ${anomalas.slice(0, 3).map((a) => `${a.descricao} (R$ ${a.valor.toFixed(2)})`).join(', ')}`,
    contexto_json: { ids: anomalas.map((a) => a.id) },
  }
}

export function avaliarCaixaBaixo(caixaAtual: number, threshold: number): NewAlerta | null {
  if (caixaAtual >= threshold) return null
  return {
    tipo: 'caixa_baixo',
    severidade: 'critical',
    titulo: `Caixa abaixo do mínimo: R$ ${caixaAtual.toFixed(2)}`,
    mensagem: `Saldo consolidado das contas está abaixo de R$ ${threshold.toFixed(2)}.`,
    contexto_json: { caixa_atual: caixaAtual, threshold },
  }
}
