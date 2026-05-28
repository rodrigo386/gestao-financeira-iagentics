import 'server-only'

export type PluggyTransaction = {
  id: string
  date: string             // YYYY-MM-DD
  amount: number           // positive=entrada, negative=saida (Pluggy convention)
  description: string
  type: 'CREDIT' | 'DEBIT'
  category: string | null
  pluggy_account_id: string
}

export type PluggyItem = {
  id: string
  status: 'updating' | 'updated' | 'login_error' | 'waiting_user_input' | 'outdated' | 'error'
  connector: { name: string }
  lastUpdatedAt: string | null
}

/**
 * Pluggy REST client. Mock mode returns deterministic fixture data.
 * Real mode talks to https://api.pluggy.ai.
 */
export async function listTransactions(p: {
  pluggyItemId: string
  from: string
  to: string
}): Promise<PluggyTransaction[]> {
  if (process.env.PLUGGY_MODE !== 'real') {
    return mockTransactions(p)
  }
  return realListTransactions(p)
}

export async function getItem(pluggyItemId: string): Promise<PluggyItem> {
  if (process.env.PLUGGY_MODE !== 'real') {
    return {
      id: pluggyItemId,
      status: 'updated',
      connector: { name: 'Mock Bank' },
      lastUpdatedAt: new Date().toISOString(),
    }
  }
  return realGetItem(pluggyItemId)
}

// ===== mock =====

function mockTransactions(p: { pluggyItemId: string; from: string; to: string }): PluggyTransaction[] {
  return [
    {
      id: `mock-tx-${p.pluggyItemId}-1`,
      date: p.from,
      amount: -500,
      description: 'AWS *Cloud Services',
      type: 'DEBIT',
      category: 'Tecnologia',
      pluggy_account_id: `acc-${p.pluggyItemId}`,
    },
    {
      id: `mock-tx-${p.pluggyItemId}-2`,
      date: p.from,
      amount: -120,
      description: 'Vercel Inc',
      type: 'DEBIT',
      category: 'Tecnologia',
      pluggy_account_id: `acc-${p.pluggyItemId}`,
    },
    {
      id: `mock-tx-${p.pluggyItemId}-3`,
      date: p.to,
      amount: 5000,
      description: 'Pix recebido Cliente X',
      type: 'CREDIT',
      category: 'Receita',
      pluggy_account_id: `acc-${p.pluggyItemId}`,
    },
  ]
}

// ===== real =====

let cachedToken: { token: string; exp: number } | null = null

async function getApiKey(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.exp > now + 60_000) return cachedToken.token

  const id = process.env.PLUGGY_CLIENT_ID
  const secret = process.env.PLUGGY_CLIENT_SECRET
  if (!id || !secret) throw new Error('PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET required when PLUGGY_MODE=real')

  const r = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: id, clientSecret: secret }),
  })
  if (!r.ok) throw new Error(`Pluggy auth failed: ${r.status} ${await r.text()}`)
  const j = await r.json() as { apiKey: string }
  cachedToken = { token: j.apiKey, exp: now + 30 * 60 * 1000 }   // 30 min
  return j.apiKey
}

async function realListTransactions(p: { pluggyItemId: string; from: string; to: string }): Promise<PluggyTransaction[]> {
  const apiKey = await getApiKey()
  // First get accounts for the item
  const accR = await fetch(`https://api.pluggy.ai/accounts?itemId=${encodeURIComponent(p.pluggyItemId)}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!accR.ok) throw new Error(`Pluggy accounts: ${accR.status}`)
  const accJson = await accR.json() as { results: { id: string }[] }

  const all: PluggyTransaction[] = []
  for (const acc of accJson.results) {
    const url = `https://api.pluggy.ai/transactions?accountId=${acc.id}&from=${p.from}&to=${p.to}&pageSize=500`
    const txR = await fetch(url, { headers: { 'X-API-KEY': apiKey } })
    if (!txR.ok) throw new Error(`Pluggy transactions: ${txR.status}`)
    const txJson = await txR.json() as { results: Array<{
      id: string; date: string; amount: number; description: string; type: 'CREDIT' | 'DEBIT'; category: string | null
    }> }
    all.push(...txJson.results.map((t) => ({
      id: t.id,
      date: t.date.slice(0, 10),
      amount: t.amount,
      description: t.description,
      type: t.type,
      category: t.category,
      pluggy_account_id: acc.id,
    })))
  }
  return all
}

async function realGetItem(pluggyItemId: string): Promise<PluggyItem> {
  const apiKey = await getApiKey()
  const r = await fetch(`https://api.pluggy.ai/items/${encodeURIComponent(pluggyItemId)}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!r.ok) throw new Error(`Pluggy item: ${r.status}`)
  return r.json()
}
