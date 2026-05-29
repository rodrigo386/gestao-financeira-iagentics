import { describe, it, expect } from 'vitest'
import { validarSqlReadonly } from '@/modules/copiloto/sql'

describe('validarSqlReadonly', () => {
  it('aceita SELECT simples e força LIMIT', () => {
    const r = validarSqlReadonly('select * from contratos')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.sql.toLowerCase()).toContain('limit')
  })

  it('aceita WITH (CTE)', () => {
    const r = validarSqlReadonly('with x as (select 1 as n) select n from x limit 10')
    expect(r.ok).toBe(true)
  })

  it('preserva LIMIT existente', () => {
    const r = validarSqlReadonly('select 1 limit 5')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.sql).toMatch(/limit 5/i)
  })

  it('rejeita INSERT/UPDATE/DELETE/DDL', () => {
    for (const q of [
      'insert into alertas values (1)',
      'update contratos set ticket=0',
      'delete from lancamentos',
      'drop table contratos',
      'alter table contratos add column x int',
      'grant select on contratos to public',
      'truncate lancamentos',
    ]) {
      expect(validarSqlReadonly(q).ok).toBe(false)
    }
  })

  it('rejeita múltiplos statements', () => {
    expect(validarSqlReadonly('select 1; drop table contratos').ok).toBe(false)
  })

  it('rejeita string vazia', () => {
    expect(validarSqlReadonly('   ').ok).toBe(false)
  })
})
