import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const SEV_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  info: 'secondary', warning: 'outline', critical: 'destructive',
}

export default async function AlertasPage() {
  const supabase = await createClient()
  const { data: alertas } = await supabase
    .from('alertas').select('*').order('criado_em', { ascending: false }).limit(200)

  async function marcarLido(formData: FormData) {
    'use server'
    const id = formData.get('id') as string
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) throw new Error('not authenticated')
    await sb.from('alertas').update({ lido: true, lido_em: new Date().toISOString(), lido_por: user.id }).eq('id', id)
    revalidatePath('/alertas')
  }

  async function marcarTodosLidos() {
    'use server'
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) throw new Error('not authenticated')
    await sb.from('alertas').update({ lido: true, lido_em: new Date().toISOString(), lido_por: user.id }).eq('lido', false)
    revalidatePath('/alertas')
  }

  const naoLidos = (alertas ?? []).filter((a) => !a.lido).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Alertas</h1>
          <p className="text-sm text-neutral-500">{naoLidos} não lido(s)</p>
        </div>
        {naoLidos > 0 && (
          <form action={marcarTodosLidos}>
            <Button variant="outline" type="submit">Marcar tudo como lido</Button>
          </form>
        )}
      </div>

      {(alertas ?? []).length === 0 ? (
        <p className="text-neutral-500">Sem alertas.</p>
      ) : (
        <div className="space-y-3">
          {alertas!.map((a) => (
            <div key={a.id} className={`border rounded-md p-4 ${a.lido ? 'bg-neutral-50' : 'bg-white border-neutral-300'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={SEV_VARIANT[a.severidade as string]}>{a.severidade}</Badge>
                    <span className="text-xs text-neutral-500">{a.tipo} · {new Date(a.criado_em).toLocaleString('pt-BR')}</span>
                  </div>
                  <h3 className="font-medium">{a.titulo}</h3>
                  <p className="text-sm text-neutral-600 mt-1">{a.mensagem}</p>
                </div>
                {!a.lido && (
                  <form action={marcarLido}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button size="sm" variant="ghost" type="submit">Marcar lido</Button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
