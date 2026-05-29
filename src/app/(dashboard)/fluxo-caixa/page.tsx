import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function FluxoCaixaPage() {
  const supabase = await createClient()

  const noventaDate = new Date(); noventaDate.setDate(noventaDate.getDate() - 90)
  const noventa = noventaDate.toISOString().slice(0, 10)

  const [{ data: contas }, { data: lancs }] = await Promise.all([
    supabase
      .from('contas_bancarias')
      .select('id, banco, agencia, conta, saldo_atual')
      .eq('ativa', true),
    supabase
      .from('lancamentos')
      .select('id, data, valor, tipo, descricao, conta_id, conta:contas_bancarias(banco), categoria:categorias(nome)')
      .gte('data', noventa)
      .order('data', { ascending: false })
      .limit(500),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Fluxo de Caixa</h1>

      {/* Saldo por conta bancária */}
      {(contas ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Cadastre uma conta bancária em Configurações para acompanhar o fluxo de caixa.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(contas ?? []).map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">{c.banco}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  R$ {Number(c.saldo_atual).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                {c.conta && (
                  <div className="text-xs text-muted-foreground mt-1">{c.conta}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Timeline de lançamentos */}
      <div>
        <h2 className="text-lg font-medium mb-3">Lançamentos — últimos 90 dias</h2>
        {(lancs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lançamento nos últimos 90 dias.</p>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Conta</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {(lancs ?? []).map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-4 py-3">{l.data}</td>
                    <td className="px-4 py-3">{l.descricao}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(l.categoria as { nome?: string } | null)?.nome ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(l.conta as { banco?: string } | null)?.banco ?? '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${l.tipo === 'entrada' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {l.tipo === 'entrada' ? '+' : '-'} R$ {Number(l.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
