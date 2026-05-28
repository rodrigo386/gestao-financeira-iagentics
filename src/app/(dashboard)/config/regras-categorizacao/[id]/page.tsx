import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { atualizarRegra } from '@/modules/categorizacao/regras'
import { RegraForm, type RegraFormData } from '@/components/forms/regra-form'

export default async function EditarRegraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: regra }, { data: categorias }] = await Promise.all([
    supabase.from('regras_categorizacao').select('*').eq('id', id).maybeSingle(),
    supabase.from('categorias').select('id, nome').eq('ativa', true).order('nome'),
  ])

  if (!regra) notFound()

  async function action(formData: RegraFormData) {
    'use server'
    await atualizarRegra(id, {
      pattern: formData.pattern,
      pattern_tipo: formData.pattern_tipo,
      campo: formData.campo,
      categoria_id: formData.categoria_id,
      prioridade: formData.prioridade,
      ativa: formData.ativa,
    })
    redirect(`/config/regras-categorizacao`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar regra</h1>
      <p className="text-sm text-neutral-500 font-mono">{regra.pattern} ({regra.pattern_tipo})</p>
      <RegraForm
        initialData={{
          pattern: regra.pattern,
          pattern_tipo: regra.pattern_tipo,
          campo: regra.campo,
          categoria_id: regra.categoria_id,
          prioridade: regra.prioridade,
          ativa: regra.ativa,
        }}
        onSubmit={action}
        submitLabel="Salvar alterações"
        categorias={categorias ?? []}
      />
    </div>
  )
}
