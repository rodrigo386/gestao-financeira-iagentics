import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

function formatMesRef(mesRef: string): string {
  const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
  const parts = mesRef.split('-').map(Number)
  return `${meses[parts[1]! - 1]}/${parts[0]}`
}

function formatBRL(val: number) {
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function FolhaPage() {
  const supabase = await createClient()

  const now = new Date()
  const mesRef = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const { data: folhaAtual } = await supabase
    .from('folha')
    .select('*')
    .eq('mes_ref', mesRef)
    .maybeSingle()

  const { data: funcionariosAtivos } = await supabase
    .from('funcionarios')
    .select('id, salario_base')
    .eq('ativo', true)

  const { data: pjSpotAtivos } = await supabase
    .from('pj_spot')
    .select('id')
    .eq('ativo', true)

  const totalBruto = (funcionariosAtivos ?? []).reduce(
    (sum, f) => sum + (f.salario_base ?? 0),
    0,
  )

  const numFuncionarios = (funcionariosAtivos ?? []).length
  const numPJSpot = (pjSpotAtivos ?? []).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Folha de Pagamento</h1>
        <p className="text-sm text-muted-foreground">Gestão de corridas de folha CLT</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Folha do mês atual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{formatMesRef(mesRef)}</p>
              {folhaAtual ? (
                <Badge variant={folhaAtual.status === 'fechada' ? 'secondary' : 'default'}>
                  {folhaAtual.status === 'fechada' ? 'Fechada' : 'Aberta'}
                </Badge>
              ) : (
                <Badge variant="outline">Não iniciada</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total bruto previsto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatBRL(totalBruto)}</p>
            <p className="text-xs text-muted-foreground mt-1">soma salários base ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funcionários ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{numFuncionarios}</p>
            <Link href="/folha/funcionarios" className="text-xs text-muted-foreground underline mt-1 block">
              Ver lista
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PJ Spot ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{numPJSpot}</p>
            <Link href="/folha/pj-spot" className="text-xs text-muted-foreground underline mt-1 block">
              Ver lista
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Main Action */}
      <div className="flex justify-center">
        {folhaAtual ? (
          <Link href={`/folha/corridas/${folhaAtual.id}`}>
            <Button size="lg" className="px-10">
              Ver folha do mês ({formatMesRef(mesRef)})
            </Button>
          </Link>
        ) : (
          <Link href="/folha/corridas">
            <Button size="lg" className="px-10">
              Abrir folha do mês atual
            </Button>
          </Link>
        )}
      </div>

      {/* Proximos Passos */}
      <Card>
        <CardHeader>
          <CardTitle>Proximos passos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">1.</span>
            <Link href="/folha/funcionarios" className="underline text-foreground">
              Cadastrar funcionários CLT
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">2.</span>
            <Link href="/folha/corridas" className="underline text-foreground">
              Abrir uma corrida de folha
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">3.</span>
            <span className="text-muted-foreground">
              Revisar itens e fechar folha (gera APs + holerites PDF)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">4.</span>
            <Link href="/contas-pagar" className="underline text-foreground">
              Aprovar e pagar via Contas a Pagar
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Quick Nav */}
      <div className="flex gap-3 flex-wrap">
        <Link href="/folha/corridas">
          <Button variant="outline">Todas as corridas</Button>
        </Link>
        <Link href="/folha/funcionarios">
          <Button variant="outline">Funcionarios</Button>
        </Link>
        <Link href="/folha/pj-spot">
          <Button variant="outline">PJ Spot</Button>
        </Link>
      </div>
    </div>
  )
}
