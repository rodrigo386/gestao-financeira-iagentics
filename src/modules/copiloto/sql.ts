import 'server-only'

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
