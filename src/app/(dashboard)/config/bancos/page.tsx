import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function BancosPage() {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('pluggy_items')
    .select('*, conta_bancaria:contas_bancarias(id, nome)')
    .order('criado_em', { ascending: false })

  const isMock = process.env.PLUGGY_MODE !== 'real'

  async function adicionarMock() {
    'use server'
    const supa = await createClient()
    // Create conta_bancaria if none exists
    const { data: contaExistente } = await supa
      .from('contas_bancarias')
      .select('id')
      .eq('nome', 'Mock Bank')
      .maybeSingle()

    let contaId: string
    if (contaExistente) {
      contaId = contaExistente.id
    } else {
      const { data: novaConta, error: contaError } = await supa
        .from('contas_bancarias')
        .insert({ nome: 'Mock Bank' })
        .select('id')
        .single()
      if (contaError) throw new Error(`adicionarMock conta: ${contaError.message}`)
      contaId = novaConta.id
    }

    const { error } = await supa.from('pluggy_items').insert({
      pluggy_item_id: `mock-${Date.now()}`,
      conta_bancaria_id: contaId,
      banco_nome: 'Mock Bank',
      status: 'updated',
    })
    if (error) throw new Error(`adicionarMock item: ${error.message}`)
    revalidatePath('/config/bancos')
  }

  async function sincronizarItem(formData: FormData) {
    'use server'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const secret = process.env.CRON_SECRET ?? ''
    await fetch(`${appUrl}/api/cron/sync-pluggy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    revalidatePath('/config/bancos')
    revalidatePath('/pendencias')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bancos conectados</h1>
          <p className="text-sm text-neutral-500">{items?.length ?? 0} item(s) cadastrado(s)</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://my.pluggy.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline text-neutral-600"
          >
            Conectar novo banco (Pluggy)
          </a>
          {isMock && (
            <form action={adicionarMock}>
              <Button type="submit" variant="outline">Adicionar item mock</Button>
            </form>
          )}
        </div>
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-left">
            <tr>
              <th className="px-4 py-3">Banco</th>
              <th className="px-4 py-3">Pluggy Item ID</th>
              <th className="px-4 py-3">Conta bancária</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Última sinc.</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {!items || items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Nenhum banco conectado.{isMock && " (Em desenvolvimento, use 'Adicionar item mock')."}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{item.banco_nome}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                    {item.pluggy_item_id.length > 20
                      ? `${item.pluggy_item_id.slice(0, 20)}…`
                      : item.pluggy_item_id}
                  </td>
                  <td className="px-4 py-3">
                    {item.conta_bancaria ? (
                      <span className="text-neutral-700">{(item.conta_bancaria as { id: string; nome: string }).nome}</span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {item.last_synced_at
                      ? new Date(item.last_synced_at).toLocaleString('pt-BR')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={sincronizarItem}>
                      <input type="hidden" name="item_id" value={item.id} />
                      <Button type="submit" size="sm" variant="outline">Sincronizar</Button>
                    </form>
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    updated: 'default',
    updating: 'outline',
    login_error: 'destructive',
    waiting_user_input: 'outline',
    outdated: 'secondary',
    error: 'destructive',
  }
  return <Badge variant={map[status] ?? 'secondary'}>{status}</Badge>
}
