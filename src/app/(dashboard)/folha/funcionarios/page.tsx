import Link from 'next/link'
import { listarFuncionarios } from '@/modules/folha/funcionarios'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

function formatBRL(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

export default async function FuncionariosPage() {
  const { data, total } = await listarFuncionarios({ limit: 100 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Funcionários</h1>
          <p className="text-sm text-muted-foreground">{total} funcionário(s) cadastrados</p>
        </div>
        <Link href="/folha/funcionarios/novo">
          <Button>Novo funcionário</Button>
        </Link>
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Cargo</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Salário Base</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum funcionário cadastrado ainda.
                </td>
              </tr>
            ) : data.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="px-4 py-3 font-medium">{f.nome}</td>
                <td className="px-4 py-3 text-muted-foreground">{f.cargo}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{f.tipo === 'clt' ? 'CLT' : 'PJ Recorrente'}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatBRL(f.salario_base)}</td>
                <td className="px-4 py-3">
                  <Badge variant={f.ativo ? 'default' : 'secondary'}>{f.ativo ? 'Ativo' : 'Inativo'}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/folha/funcionarios/${f.id}`} className="text-sm text-primary underline">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
