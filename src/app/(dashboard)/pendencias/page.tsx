import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { PendenciaRow } from './pendencia-row'

type Categoria = { id: string; nome: string }

export default async function PendenciasPage() {
  const supabase = await createClient()

  const [{ data: lancamentos }, { data: categorias }] = await Promise.all([
    supabase
      .from('lancamentos')
      .select('*, conta:contas_bancarias(nome)')
      .or('categoria_id.is.null,and(categorizacao_metodo.eq.llm,categorizacao_confianca.lt.0.7)')
      .order('data', { ascending: false })
      .limit(100),
    supabase.from('categorias').select('id, nome').eq('ativa', true).order('nome'),
  ])

  async function atualizarCategoria(lancamentoId: string, categoriaId: string) {
    'use server'
    const supa = await createClient()
    const { error } = await supa
      .from('lancamentos')
      .update({
        categoria_id: categoriaId,
        categorizacao_metodo: 'manual',
      })
      .eq('id', lancamentoId)
    if (error) throw new Error(`atualizarCategoria: ${error.message}`)
    revalidatePath('/pendencias')
  }

  async function criarRegraDoLancamento(pattern: string, categoriaId: string, lancamentoId: string) {
    'use server'
    const supa = await createClient()
    // Create regra
    const { error: regraError } = await supa.from('regras_categorizacao').insert({
      pattern,
      pattern_tipo: 'contains',
      campo: 'descricao',
      categoria_id: categoriaId,
      prioridade: 100,
      ativa: true,
      origem: 'manual',
    })
    if (regraError) throw new Error(`criarRegraDoLancamento regra: ${regraError.message}`)
    // Apply to lancamento
    const { error: lancError } = await supa
      .from('lancamentos')
      .update({
        categoria_id: categoriaId,
        categorizacao_metodo: 'manual',
      })
      .eq('id', lancamentoId)
    if (lancError) throw new Error(`criarRegraDoLancamento lancamento: ${lancError.message}`)
    revalidatePath('/pendencias')
  }

  const cats: Categoria[] = categorias ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pendências de Categorização</h1>
        <p className="text-sm text-muted-foreground">
          Lançamentos sem categoria ou com baixa confiança do LLM (&lt;70%)
        </p>
      </div>

      {!lancamentos || lancamentos.length === 0 ? (
        <div className="border rounded-md px-4 py-10 text-center text-muted-foreground">
          Nenhuma pendência. Tudo categorizado.
        </div>
      ) : (
        <div className="border rounded-md divide-y">
          {lancamentos.map((l) => (
            <PendenciaRow
              key={l.id}
              lancamento={l}
              categorias={cats}
              atualizarCategoria={atualizarCategoria}
              criarRegraDoLancamento={criarRegraDoLancamento}
            />
          ))}
        </div>
      )}
    </div>
  )
}
