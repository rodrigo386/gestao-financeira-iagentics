import Link from 'next/link'
import { listarRegras } from '@/modules/categorizacao/regras'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default async function RegrasCategorizacaoPage() {
  const regras = await listarRegras()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Regras de Categorização</h1>
          <p className="text-sm text-muted-foreground">{regras.length} regra(s) cadastrada(s)</p>
        </div>
        <Link href="/config/regras-categorizacao/novo">
          <Button>Nova regra</Button>
        </Link>
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-4 py-3">Prioridade</th>
              <th className="px-4 py-3">Pattern</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Campo</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Ativa</th>
              <th className="px-4 py-3">Aplicações</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {regras.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhuma regra cadastrada ainda.
                </td>
              </tr>
            ) : (
              regras.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3">{r.prioridade}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.pattern}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{r.pattern_tipo}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.campo}</td>
                  <td className="px-4 py-3">
                    {(r as unknown as { categoria?: { nome: string } }).categoria?.nome ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={r.ativa ? 'default' : 'secondary'}>{r.ativa ? 'sim' : 'não'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.total_aplicacoes}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.origem}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/config/regras-categorizacao/${r.id}`} className="text-sm underline">
                      Editar
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
