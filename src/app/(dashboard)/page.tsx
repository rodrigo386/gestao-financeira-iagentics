import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { criarLancamento } from '@/modules/despesas/lancamentos'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function brl(n: number): string {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

// ---- Server actions (1 clique = já registra) ----

async function receberContrato(formData: FormData) {
  'use server'
  const contratoId = formData.get('contratoId') as string
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('não autenticado')
  const { data: me } = await sb.from('usuarios').select('role').eq('id', user.id).single()
  if (!me || !['admin', 'financeiro'].includes(me.role)) throw new Error('sem permissão')
  const { data: c } = await sb.from('contratos').select('id, nome, ticket, cliente_id').eq('id', contratoId).single()
  if (!c) throw new Error('contrato não encontrado')
  const { data: conta } = await sb.from('contas_bancarias').select('id').eq('ativa', true).order('banco').limit(1).maybeSingle()
  if (!conta) throw new Error('Cadastre uma conta bancária em Configurações primeiro')
  const hoje = new Date().toISOString().slice(0, 10)
  const inicioMes = `${hoje.slice(0, 7)}-01`
  const { data: existe } = await sb.from('lancamentos').select('id')
    .eq('origem_id', contratoId).eq('tipo', 'entrada').gte('data', inicioMes).limit(1).maybeSingle()
  if (!existe) {
    await criarLancamento({
      data: hoje, valor: c.ticket, conta_id: conta.id, tipo: 'entrada',
      descricao: `Recebimento — ${c.nome}`, cliente_id: c.cliente_id, origem: 'manual', origem_id: contratoId,
    })
  }
  revalidatePath('/')
}

async function pagarRecorrente(formData: FormData) {
  'use server'
  const recorrenteId = formData.get('recorrenteId') as string
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('não autenticado')
  const { data: me } = await sb.from('usuarios').select('role').eq('id', user.id).single()
  if (!me || !['admin', 'financeiro'].includes(me.role)) throw new Error('sem permissão')
  const { data: r } = await sb.from('despesas_recorrentes')
    .select('id, descricao, valor, fornecedor_id, categoria_id').eq('id', recorrenteId).single()
  if (!r) throw new Error('despesa não encontrada')
  const { data: conta } = await sb.from('contas_bancarias').select('id').eq('ativa', true).order('banco').limit(1).maybeSingle()
  if (!conta) throw new Error('Cadastre uma conta bancária em Configurações primeiro')
  const hoje = new Date().toISOString().slice(0, 10)
  const inicioMes = `${hoje.slice(0, 7)}-01`
  const { data: existe } = await sb.from('lancamentos').select('id')
    .eq('origem_id', recorrenteId).eq('tipo', 'saida').gte('data', inicioMes).limit(1).maybeSingle()
  if (!existe) {
    await criarLancamento({
      data: hoje, valor: r.valor, conta_id: conta.id, tipo: 'saida',
      descricao: `Pagamento — ${r.descricao}`,
      categoria_id: r.categoria_id ?? undefined,
      fornecedor_id: r.fornecedor_id ?? undefined,
      origem: 'manual', origem_id: recorrenteId,
    })
  }
  revalidatePath('/')
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: usuario } = await supabase.from('usuarios').select('nome').eq('id', user!.id).single()

  const hoje = new Date()
  const y = hoje.getFullYear()
  const m = hoje.getMonth() + 1
  const inicioMes = `${y}-${String(m).padStart(2, '0')}-01`
  const fimMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

  const [contas, todos, doMes, contratosRes, recorrentesRes] = await Promise.all([
    supabase.from('contas_bancarias').select('saldo_atual').eq('ativa', true),
    supabase.from('lancamentos').select('valor, tipo'),
    supabase.from('lancamentos').select('valor, tipo, origem, origem_id, descricao, data')
      .gte('data', inicioMes).lte('data', fimMes).order('data', { ascending: false }),
    supabase.from('contratos').select('id, nome, ticket, dia_cobranca, cliente:clientes(nome)')
      .eq('status', 'ativo').eq('tipo', 'mensal'),
    supabase.from('despesas_recorrentes').select('id, descricao, valor, dia_mes').eq('ativa', true),
  ])

  const temConta = (contas.data ?? []).length > 0
  const saldoInicial = (contas.data ?? []).reduce((s, r) => s + Number(r.saldo_atual), 0)
  const todosL = (todos.data ?? []) as { valor: number; tipo: string }[]
  const totalEntradas = todosL.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0)
  const totalSaidas = todosL.filter((l) => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0)
  const caixa = saldoInicial + totalEntradas - totalSaidas

  const mesL = (doMes.data ?? []) as { valor: number; tipo: string; origem: string; origem_id: string | null; descricao: string; data: string }[]
  const recebidoMes = mesL.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0)
  const pagoMes = mesL.filter((l) => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0)
  const resultado = recebidoMes - pagoMes

  const recebidos = new Set(mesL.filter((l) => l.tipo === 'entrada' && l.origem_id).map((l) => l.origem_id))
  const pagos = new Set(mesL.filter((l) => l.tipo === 'saida' && l.origem_id).map((l) => l.origem_id))
  const avulsos = mesL.filter((l) => l.origem === 'manual' && !l.origem_id)

  const contratos = (contratosRes.data ?? []) as unknown as { id: string; nome: string; ticket: number; dia_cobranca: number; cliente: { nome: string } | null }[]
  const recorrentes = (recorrentesRes.data ?? []) as { id: string; descricao: string; valor: number; dia_mes: number }[]

  const aReceberPendente = contratos.filter((c) => !recebidos.has(c.id)).reduce((s, c) => s + Number(c.ticket), 0)
  const aPagarPendente = recorrentes.filter((r) => !pagos.has(r.id)).reduce((s, r) => s + Number(r.valor), 0)

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center gap-4">
        <BrandLogo size={28} />
        <div>
          <h1 className="text-2xl font-semibold">Olá, {usuario?.nome ?? 'bem-vindo'}</h1>
          <p className="text-sm text-muted-foreground">Este mês · {MESES_PT[m - 1]} de {y}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Link href="/despesas/lancamentos/novo?tipo=entrada" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">+ Entrada</Link>
          <Link href="/despesas/lancamentos/novo?tipo=saida" className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">+ Saída</Link>
        </div>
      </div>

      {!temConta && (
        <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          Cadastre uma <Link href="/config/contas-bancarias" className="underline">conta bancária</Link> (com o saldo inicial) para poder registrar recebimentos e pagamentos.
        </div>
      )}

      {/* resumo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Saldo em caixa</div>
          <div className="mt-1 text-3xl font-bold">{brl(caixa)}</div>
        </div>
        <StatCard label="Recebido no mês" value={brl(recebidoMes)} tone="up" />
        <StatCard label="Pago no mês" value={brl(pagoMes)} tone="down" />
        <StatCard label="Resultado do mês" value={brl(resultado)} tone={resultado >= 0 ? 'up' : 'down'} strong />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* A RECEBER */}
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">A receber este mês</h2>
            <span className="text-xs text-muted-foreground">falta {brl(aReceberPendente)}</span>
          </div>
          {contratos.length === 0 ? (
            <Empty>
              Nenhum contrato ativo. <Link href="/receitas/contratos/novo" className="text-primary underline">+ Novo contrato</Link>
            </Empty>
          ) : (
            <ul className="divide-y divide-border">
              {contratos.map((c) => {
                const recebido = recebidos.has(c.id)
                return (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.cliente?.nome ?? c.nome}</div>
                      <div className="text-xs text-muted-foreground">{brl(Number(c.ticket))} · vence dia {c.dia_cobranca}</div>
                    </div>
                    {recebido ? (
                      <span className="shrink-0 text-sm font-medium text-emerald-400">✓ recebido</span>
                    ) : temConta ? (
                      <form action={receberContrato}>
                        <input type="hidden" name="contratoId" value={c.id} />
                        <Button type="submit" size="sm">Recebi</Button>
                      </form>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">—</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* A PAGAR */}
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">A pagar este mês</h2>
            <span className="text-xs text-muted-foreground">falta {brl(aPagarPendente)}</span>
          </div>
          {recorrentes.length === 0 ? (
            <Empty>
              Nenhuma despesa recorrente. <Link href="/despesas/recorrentes/novo" className="text-primary underline">+ Nova despesa</Link>
            </Empty>
          ) : (
            <ul className="divide-y divide-border">
              {recorrentes.map((r) => {
                const pago = pagos.has(r.id)
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.descricao}</div>
                      <div className="text-xs text-muted-foreground">{brl(Number(r.valor))} · vence dia {r.dia_mes}</div>
                    </div>
                    {pago ? (
                      <span className="shrink-0 text-sm font-medium text-emerald-400">✓ pago</span>
                    ) : temConta ? (
                      <form action={pagarRecorrente}>
                        <input type="hidden" name="recorrenteId" value={r.id} />
                        <Button type="submit" size="sm" variant="outline">Paguei</Button>
                      </form>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">—</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {/* AVULSOS DO MÊS */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Avulsos deste mês</h2>
        {avulsos.length === 0 ? (
          <Empty>Nada avulso ainda. Use “+ Entrada” ou “+ Saída” acima para lançar algo pontual.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {avulsos.map((l, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{l.data.slice(8, 10)}/{l.data.slice(5, 7)}</span>
                <span className="min-w-0 flex-1 truncate">{l.descricao}</span>
                <span className={`shrink-0 font-medium ${l.tipo === 'entrada' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {l.tipo === 'entrada' ? '+' : '−'} {brl(Number(l.valor))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value, tone, strong }: {
  label: string; value: string; tone?: 'up' | 'down'; strong?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={
        `mt-1 font-bold ${strong ? 'text-3xl' : 'text-2xl'} ` +
        (tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-rose-400' : '')
      }>
        {value}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-muted-foreground">{children}</p>
}
