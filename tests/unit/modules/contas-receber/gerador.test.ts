import { describe, it, expect } from 'vitest'
import { gerarARDoContrato, gerarARDoMilestone } from '@/modules/contas-receber/gerador'
import type { Contrato } from '@/lib/schemas/contrato'
import type { Milestone } from '@/lib/schemas/projeto'

const contratoBase: Contrato = {
  id: '11111111-1111-1111-1111-111111111111',
  cliente_id: '22222222-2222-2222-2222-222222222222',
  nome: 'AaaS Pro',
  tipo: 'mensal',
  ticket: 1000,
  moeda: 'BRL',
  dia_cobranca: 10,
  data_inicio: '2026-05-01',
  data_fim: null,
  status: 'ativo',
  motivo_churn: null,
  data_churn: null,
  observacoes: null,
  criado_em: '2026-05-01T00:00:00Z',
  atualizado_em: '2026-05-01T00:00:00Z',
}

describe('gerarARDoContrato', () => {
  it('generates AR for active monthly contract on its billing day', () => {
    const ar = gerarARDoContrato(contratoBase, '2026-05-01')
    expect(ar).not.toBeNull()
    expect(ar!.cliente_id).toBe(contratoBase.cliente_id)
    expect(ar!.origem).toBe('contrato')
    expect(ar!.origem_id).toBe(contratoBase.id)
    expect(ar!.valor).toBe(1000)
    expect(ar!.data_emissao).toBe('2026-05-01')
    expect(ar!.data_vencimento).toBe('2026-05-10')  // dia_cobranca within emission month
  })

  it('returns null for paused contracts', () => {
    expect(gerarARDoContrato({ ...contratoBase, status: 'pausado' }, '2026-05-01')).toBeNull()
  })

  it('returns null when contract starts after the month', () => {
    expect(gerarARDoContrato({ ...contratoBase, data_inicio: '2026-06-01' }, '2026-05-01')).toBeNull()
  })

  it('returns null when contract ended before the month', () => {
    expect(gerarARDoContrato({ ...contratoBase, data_fim: '2026-04-15' }, '2026-05-01')).toBeNull()
  })

  it('handles annual contract with ticket /12 monthly', () => {
    const annual = { ...contratoBase, tipo: 'anual' as const, ticket: 12000 }
    const ar = gerarARDoContrato(annual, '2026-05-01')
    expect(ar!.valor).toBe(1000)
  })
})

describe('gerarARDoMilestone', () => {
  const milestone: Milestone = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    projeto_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    ordem: 1,
    descricao: 'Setup',
    valor: 5000,
    data_prevista: '2026-05-15',
    data_real: null,
    status: 'concluido',
    criado_em: '2026-05-01T00:00:00Z',
    atualizado_em: '2026-05-01T00:00:00Z',
  }

  it('generates AR for a concluido milestone', () => {
    const ar = gerarARDoMilestone(milestone, milestone.projeto_id, 'cliente-xxx')
    expect(ar).not.toBeNull()
    expect(ar!.origem).toBe('milestone')
    expect(ar!.origem_id).toBe(milestone.id)
    expect(ar!.valor).toBe(5000)
    expect(ar!.data_emissao).toBe('2026-05-15')   // uses data_real or data_prevista
  })

  it('returns null for non-concluido milestones', () => {
    expect(gerarARDoMilestone({ ...milestone, status: 'pendente' }, 'p', 'c')).toBeNull()
    expect(gerarARDoMilestone({ ...milestone, status: 'em_andamento' }, 'p', 'c')).toBeNull()
  })

  it('uses data_real when available', () => {
    const ar = gerarARDoMilestone(
      { ...milestone, data_real: '2026-05-20' },
      milestone.projeto_id, 'cliente-xxx',
    )
    expect(ar!.data_emissao).toBe('2026-05-20')
  })
})
