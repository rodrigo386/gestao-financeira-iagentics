import Link from 'next/link'
import { listarContratos } from '@/modules/receitas/contratos'
import { listarClientes } from '@/modules/receitas/clientes'
import { listarProjetos } from '@/modules/receitas/projetos'
import { calcularMRR, calcularARR } from '@/modules/receitas/metricas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function ReceitasPage() {
  const [contratos, clientes, projetos] = await Promise.all([
    listarContratos(),
    listarClientes({ limit: 1 }),
    listarProjetos(),
  ])
  const hoje = new Date().toISOString().slice(0, 10)
  const mrr = calcularMRR(contratos, hoje)
  const arr = calcularARR(contratos, hoje)
  const ativos = contratos.filter((c) => c.status === 'ativo').length
  const projetosAtivos = projetos.filter((p) => p.status === 'ativo').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Receitas</h1>
        <div className="flex gap-2">
          <Link href="/receitas/clientes"><Button variant="outline">Clientes</Button></Link>
          <Link href="/receitas/contratos"><Button variant="outline">Contratos</Button></Link>
          <Link href="/receitas/projetos"><Button variant="outline">Projetos</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">MRR</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">ARR</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">R$ {arr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Contratos ativos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{ativos}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Projetos ativos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{projetosAtivos}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Próximos passos</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>· <Link href="/receitas/clientes" className="text-primary underline">Cadastre clientes</Link></p>
          <p>· <Link href="/receitas/contratos" className="text-primary underline">Adicione contratos AaaS</Link> para começar a ter MRR</p>
          <p>· <Link href="/receitas/projetos" className="text-primary underline">Crie projetos</Link> com milestones para faturamento por etapa</p>
          <p>· <Link href="/contas-receber" className="text-primary underline">Veja AR previstas</Link> (gera automaticamente todo dia 1º do mês)</p>
        </CardContent>
      </Card>
    </div>
  )
}
