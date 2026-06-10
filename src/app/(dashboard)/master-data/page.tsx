import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ENTIDADES, getEntidade } from '@/modules/master-data/registry'
import { listarEntidade, excluirEntidade } from '@/modules/master-data/master-data'
import { MasterDataTable } from '@/components/master-data/master-data-table'

async function getAdminActor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (u?.role !== 'admin') redirect('/')
  return { id: user.id, role: u.role }
}

export default async function MasterDataPage({ searchParams }: { searchParams: Promise<{ entity?: string; q?: string }> }) {
  await getAdminActor()
  const { entity, q } = await searchParams
  const ent = getEntidade(entity ?? '') ?? ENTIDADES[0]!
  const rows = await listarEntidade(ent.key, q)

  async function excluirAction(key: string, id: string) {
    'use server'
    const a = await getAdminActor()
    await excluirEntidade(key, id, a)
    revalidatePath('/master-data')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Master Data</h1>
        <p className="text-sm text-muted-foreground">Consulte e exclua cadastros. Criar/editar abre a tela específica de cada cadastro.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ENTIDADES.map((e) => (
          <Link key={e.key} href={`/master-data?entity=${e.key}`}
            className={'px-3 py-1.5 rounded-md text-sm border ' + (e.key === ent.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            {e.label}
          </Link>
        ))}
      </div>
      <MasterDataTable entidade={ent} rows={rows} busca={q ?? ''} onExcluir={excluirAction} />
    </div>
  )
}
