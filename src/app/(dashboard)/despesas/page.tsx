import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function DespesasPage() {
  const supabase = await createClient()

  const inicioMes = new Date()
  inicioMes.setDate(1)
  const inicioMesStr = inicioMes.toISOString().slice(0, 10)

  const hoje = new Date().toISOString().slice(0, 10)
  const em30Date = new Date(); em30Date.setDate(em30Date.getDate() + 30)
  const em30 = em30Date.toISOString().slice(0, 10)

  const [
    { data: saidasMes },
    { data: ap30 },
    { data: apAtrasado },
    { count: fornecedoresAtivos },
  ] = await Promise.all([
    supabase
      .from('lancamentos')
      .select('valor')
      .eq('tipo', 'saida')
      .gte('data', inicioMesStr),
    supabase
      .from('contas_a_pagar')
      .select('valor')
      .in('status', ['previsto', 'aprovado', 'atrasado'])
      .gte('data_vencimento', hoje)
      .lte('data_vencimento', em30),
    supabase
      .from('contas_a_pagar')
      .select('valor')
      .in('status', ['previsto', 'aprovado', 'atrasado'])
      .lt('data_vencimento', hoje),
    supabase
      .from('fornecedores')
      .select('id', { count: 'exact', head: true })
      .eq('ativo', true),
  ])

  const totalSaidaMes = (saidasMes ?? []).reduce((s, r) => s + Number(r.valor), 0)
  const totalAP30 = (ap30 ?? []).reduce((s, r) => s + Number(r.valor), 0)
  const totalAtrasado = (apAtrasado ?? []).reduce((s, r) => s + Number(r.valor), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Despesas</h1>
        <div className="flex gap-2">
          <Link href="/despesas/fornecedores"><Button variant="outline">Fornecedores</Button></Link>
          <Link href="/despesas/recorrentes"><Button variant="outline">Recorrentes</Button></Link>
          <Link href="/despesas/lancamentos"><Button variant="outline">Lançamentos</Button></Link>
          <Link href="/contas-pagar"><Button variant="outline">Contas a Pagar</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total despesa do mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              R$ {totalSaidaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">AP previsto (próximos 30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              R$ {totalAP30.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">AP atrasado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold ${totalAtrasado > 0 ? 'text-rose-400' : ''}`}>
              R$ {totalAtrasado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Fornecedores ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{fornecedoresAtivos ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Próximos passos</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>· <Link href="/despesas/fornecedores" className="underline">Cadastre fornecedores</Link> para vincular às despesas e APs</p>
          <p>· <Link href="/despesas/recorrentes" className="underline">Configure despesas recorrentes</Link> (aluguel, assinaturas, salários) para geração automática de APs</p>
          <p>· <Link href="/despesas/lancamentos" className="underline">Registre lançamentos</Link> de saída para acompanhar o fluxo real</p>
          <p>· <Link href="/contas-pagar" className="underline">Gerencie contas a pagar</Link> — aprove, pague ou cancele previsões</p>
        </CardContent>
      </Card>
    </div>
  )
}
