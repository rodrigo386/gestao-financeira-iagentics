import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withAudit } from '@/lib/audit'

const insertMock = vi.fn().mockResolvedValue({ error: null })
const fromMock = vi.fn(() => ({ insert: insertMock }))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: fromMock }),
}))

describe('withAudit', () => {
  beforeEach(() => {
    insertMock.mockClear()
    fromMock.mockClear()
  })

  it('logs an update action with before/after diff', async () => {
    await withAudit(
      {
        usuario_id: '11111111-1111-1111-1111-111111111111',
        acao: 'update',
        tabela: 'contas_a_pagar',
        registro_id: '22222222-2222-2222-2222-222222222222',
        before: { valor: 100 },
        after: { valor: 200 },
        motivo: 'correção',
      },
      async () => 'result',
    )

    expect(fromMock).toHaveBeenCalledWith('audit_log')
    expect(insertMock).toHaveBeenCalledWith({
      usuario_id: '11111111-1111-1111-1111-111111111111',
      acao: 'update',
      tabela: 'contas_a_pagar',
      registro_id: '22222222-2222-2222-2222-222222222222',
      before_json: { valor: 100 },
      after_json: { valor: 200 },
      motivo: 'correção',
      contexto_json: null,
    })
  })

  it('returns the operation result', async () => {
    const result = await withAudit(
      {
        usuario_id: '11111111-1111-1111-1111-111111111111',
        acao: 'insert',
        tabela: 'clientes',
        registro_id: '33333333-3333-3333-3333-333333333333',
        before: null,
        after: { nome: 'Acme' },
      },
      async () => ({ ok: true }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('does not swallow operation errors', async () => {
    await expect(
      withAudit(
        {
          usuario_id: '11111111-1111-1111-1111-111111111111',
          acao: 'delete',
          tabela: 'clientes',
          registro_id: '44444444-4444-4444-4444-444444444444',
          before: { nome: 'X' },
          after: null,
        },
        async () => {
          throw new Error('boom')
        },
      ),
    ).rejects.toThrow('boom')

    expect(insertMock).not.toHaveBeenCalled()
  })
})
