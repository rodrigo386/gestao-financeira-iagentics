import { describe, it, expect } from 'vitest'
import { matchHistorico } from '@/modules/categorizacao/historico'

describe('matchHistorico', () => {
  it('returns null when no history', () => {
    expect(matchHistorico('AWS Cloud', [])).toBeNull()
  })

  it('returns categoria when fornecedor seen >=3 times with same categoria', () => {
    const history = [
      { descricao: 'AWS Cloud Services', categoria_id: 'cat-tech', fornecedor_id: 'f1' },
      { descricao: 'AWS Cloud Storage', categoria_id: 'cat-tech', fornecedor_id: 'f1' },
      { descricao: 'AWS *Lambda', categoria_id: 'cat-tech', fornecedor_id: 'f1' },
    ]
    const result = matchHistorico('AWS New Service', history)
    expect(result).toEqual({ categoria_id: 'cat-tech', confianca: 0.9 })
  })

  it('returns null when fewer than 3 matches by descricao token', () => {
    const history = [
      { descricao: 'AWS Cloud', categoria_id: 'cat-tech', fornecedor_id: 'f1' },
      { descricao: 'AWS Lambda', categoria_id: 'cat-tech', fornecedor_id: 'f1' },
    ]
    expect(matchHistorico('AWS Storage', history)).toBeNull()
  })

  it('returns majority categoria when mixed', () => {
    const history = [
      { descricao: 'AWS X', categoria_id: 'cat-a' },
      { descricao: 'AWS Y', categoria_id: 'cat-a' },
      { descricao: 'AWS Z', categoria_id: 'cat-a' },
      { descricao: 'AWS W', categoria_id: 'cat-b' },
    ]
    expect(matchHistorico('AWS V', history)?.categoria_id).toBe('cat-a')
  })
})
