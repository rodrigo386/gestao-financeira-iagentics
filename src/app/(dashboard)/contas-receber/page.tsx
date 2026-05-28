import { listarAR } from '@/modules/contas-receber/ar'
import { ARTable } from '@/components/ar-table'

export default async function ContasReceberPage() {
  const hoje = new Date()
  const em90 = new Date(hoje.getTime() + 90 * 24 * 60 * 60 * 1000)
  const rows = await listarAR({
    vencimento_de: hoje.toISOString().slice(0, 10),
    vencimento_ate: em90.toISOString().slice(0, 10),
  })

  // Type narrowing — the joined cliente is loose, coerce shape
  const typed = (rows as unknown as Parameters<typeof ARTable>[0]['rows'])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas a Receber</h1>
        <p className="text-sm text-neutral-500">Próximos 90 dias</p>
      </div>
      <ARTable rows={typed} />
    </div>
  )
}
