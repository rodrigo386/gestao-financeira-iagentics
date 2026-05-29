import { describe, it, expect } from 'vitest'
import { executarSqlReadonly } from '@/modules/copiloto/sql'

describe('executarSqlReadonly', () => {
  it('executa um SELECT e retorna colunas + linhas', async () => {
    const r = await executarSqlReadonly('select count(*)::int as n from contratos')
    expect(r.colunas).toContain('n')
    expect(typeof r.linhas[0]!.n).toBe('number')
  })

  it('rejeita escrita no validador (antes de tocar o banco)', async () => {
    await expect(
      executarSqlReadonly("insert into alertas (tipo,severidade,titulo,mensagem) values ('caixa_baixo','info','x','y')"),
    ).rejects.toThrow(/inválido/i)
  })

  it('o role copiloto_ro nega escrita mesmo em transação direta', async () => {
    const { Pool } = await import('pg')
    const p = new Pool({ connectionString: process.env.COPILOTO_DATABASE_URL!, max: 1 })
    await expect(
      p.query("insert into alertas (tipo,severidade,titulo,mensagem) values ('caixa_baixo','info','x','y')"),
    ).rejects.toThrow(/read-only|permission/i)
    await p.end()
  })
})
