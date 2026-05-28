import { redirect } from 'next/navigation'
import { criarRegra } from '@/modules/categorizacao/regras'
import { createClient } from '@/lib/supabase/server'
import { RegraForm, type RegraFormData } from '@/components/forms/regra-form'

export default async function NovaRegraPage() {
  const supabase = await createClient()
  const { data: categorias } = await supabase
    .from('categorias')
    .select('id, nome')
    .eq('ativa', true)
    .order('nome')

  async function action(formData: RegraFormData) {
    'use server'
    const regra = await criarRegra({
      pattern: formData.pattern,
      pattern_tipo: formData.pattern_tipo,
      campo: formData.campo,
      categoria_id: formData.categoria_id,
      prioridade: formData.prioridade,
      ativa: formData.ativa,
      origem: 'manual',
    })
    redirect(`/config/regras-categorizacao/${regra.id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nova regra de categorização</h1>
      <RegraForm onSubmit={action} submitLabel="Criar regra" categorias={categorias ?? []} />
    </div>
  )
}
