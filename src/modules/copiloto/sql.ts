import 'server-only'
import { Pool } from 'pg'

export type ValidacaoSql = { ok: true; sql: string } | { ok: false; erro: string }

const PALAVRAS_PROIBIDAS = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|merge|call|do)\b/i
const LIMITE_PADRAO = 500

/** Pure: valida que `raw` é um único SELECT/WITH read-only e garante LIMIT. */
export function validarSqlReadonly(raw: string): ValidacaoSql {
  let sql = raw.trim().replace(/;\s*$/, '') // remove ; final único
  if (!sql) return { ok: false, erro: 'SQL vazio' }
  if (sql.includes(';')) return { ok: false, erro: 'Múltiplos statements não permitidos' }
  if (!/^(select|with)\b/i.test(sql)) return { ok: false, erro: 'Apenas SELECT/WITH são permitidos' }
  if (PALAVRAS_PROIBIDAS.test(sql)) return { ok: false, erro: 'Palavra-chave de escrita/DDL detectada' }
  if (!/\blimit\b/i.test(sql)) sql = `${sql} limit ${LIMITE_PADRAO}`
  return { ok: true, sql }
}

let _pool: Pool | null = null
function pool(): Pool {
  if (_pool) return _pool
  const url = process.env.COPILOTO_DATABASE_URL
  if (!url) throw new Error('COPILOTO_DATABASE_URL não configurada')
  _pool = new Pool({ connectionString: url, max: 3 })
  return _pool
}

export type ResultadoSql = { colunas: string[]; linhas: Record<string, unknown>[] }

/** Executa SQL read-only (após validação) no role copiloto_ro. */
export async function executarSqlReadonly(raw: string): Promise<ResultadoSql> {
  const v = validarSqlReadonly(raw)
  if (!v.ok) throw new Error(`SQL inválido: ${v.erro}`)
  const res = await pool().query(v.sql)
  return { colunas: res.fields.map((f) => f.name), linhas: res.rows }
}
