'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Lancamento = {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  categoria_id?: string | null
  categorizacao_metodo?: string | null
  categorizacao_confianca?: number | null
  conta?: { nome: string } | null
}

type Categoria = { id: string; nome: string }

type Props = {
  lancamento: Lancamento
  categorias: Categoria[]
  atualizarCategoria: (lancamentoId: string, categoriaId: string) => Promise<void>
  criarRegraDoLancamento: (pattern: string, categoriaId: string, lancamentoId: string) => Promise<void>
}

export function PendenciaRow({ lancamento: l, categorias, atualizarCategoria, criarRegraDoLancamento }: Props) {
  const [selectedCategoria, setSelectedCategoria] = useState(l.categoria_id ?? '')
  const [showRegraForm, setShowRegraForm] = useState(false)
  const [regraPattern, setRegraPattern] = useState(() => {
    // Default: first word of descricao
    return l.descricao.trim().split(/\s+/)[0] ?? ''
  })
  const [regraCategoria, setRegraCategoria] = useState(l.categoria_id ?? '')
  const [saving, setSaving] = useState(false)
  const [savingRegra, setSavingRegra] = useState(false)

  const isEntrada = l.tipo === 'entrada'
  const metodoLabel = l.categorizacao_metodo ?? '—'

  const metodoVariant = (m: string | null): 'default' | 'secondary' | 'outline' => {
    if (m === 'llm') return 'outline'
    if (m === 'regra') return 'default'
    if (m === 'historico') return 'secondary'
    return 'secondary'
  }

  async function handleSalvar() {
    if (!selectedCategoria) return
    setSaving(true)
    try {
      await atualizarCategoria(l.id, selectedCategoria)
    } finally {
      setSaving(false)
    }
  }

  async function handleCriarRegra(e: React.FormEvent) {
    e.preventDefault()
    if (!regraPattern || !regraCategoria) return
    setSavingRegra(true)
    try {
      await criarRegraDoLancamento(regraPattern, regraCategoria, l.id)
      setShowRegraForm(false)
    } finally {
      setSavingRegra(false)
    }
  }

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Main row */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm text-neutral-500 w-24 shrink-0">{l.data}</span>
        <span className="text-sm font-medium flex-1 min-w-0 truncate">{l.descricao}</span>
        <span className={`text-sm font-semibold w-28 text-right shrink-0 ${isEntrada ? 'text-green-600' : 'text-red-600'}`}>
          {isEntrada ? '+' : '-'} R$ {Number(l.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </span>
        <span className="text-sm text-neutral-500 w-24 shrink-0">
          {l.conta?.nome ?? '—'}
        </span>
        <Badge variant={metodoVariant(l.categorizacao_metodo ?? null)} className="shrink-0">
          {metodoLabel}
        </Badge>
        {l.categorizacao_confianca != null && (
          <span className="text-xs text-neutral-500 shrink-0">
            {Math.round(l.categorizacao_confianca * 100)}%
          </span>
        )}
      </div>

      {/* Inline categorization form */}
      <div className="flex flex-wrap items-center gap-3 pl-28">
        <select
          className="border rounded-md px-3 py-1.5 text-sm"
          value={selectedCategoria}
          onChange={(e) => setSelectedCategoria(e.target.value)}
        >
          <option value="">— Selecione categoria —</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <Button
          size="sm"
          onClick={handleSalvar}
          disabled={saving || !selectedCategoria}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowRegraForm((v) => !v)
            if (!regraCategoria && selectedCategoria) setRegraCategoria(selectedCategoria)
          }}
        >
          {showRegraForm ? 'Cancelar regra' : 'Criar regra'}
        </Button>
      </div>

      {/* Regra inline form */}
      {showRegraForm && (
        <form onSubmit={handleCriarRegra} className="pl-28 flex flex-wrap items-end gap-3 bg-neutral-50 dark:bg-neutral-900 rounded-md p-3">
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Pattern</label>
            <input
              className="border rounded-md px-2 py-1.5 text-sm w-40"
              value={regraPattern}
              onChange={(e) => setRegraPattern(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Categoria</label>
            <select
              className="border rounded-md px-2 py-1.5 text-sm"
              value={regraCategoria}
              onChange={(e) => setRegraCategoria(e.target.value)}
              required
            >
              <option value="">— Selecione —</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={savingRegra}>
            {savingRegra ? 'Criando...' : 'Criar regra e categorizar'}
          </Button>
        </form>
      )}
    </div>
  )
}
