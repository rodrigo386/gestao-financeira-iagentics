'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Mensagem, ProposedAction, RespostaAgente } from '@/modules/copiloto/types'

type Props = { executarAcao: (acao: ProposedAction) => Promise<{ ok: boolean; detalhe: string }> }

export function CopilotoChat({ executarAcao }: Props) {
  const [historico, setHistorico] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [proposta, setProposta] = useState<ProposedAction | null>(null)

  async function enviar() {
    if (!input.trim() || carregando) return
    const novo: Mensagem[] = [...historico, { role: 'user', content: input.trim() }]
    setHistorico(novo); setInput(''); setCarregando(true); setProposta(null)
    try {
      const resp = await fetch('/api/copiloto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ historico: novo }) })
      const data = (await resp.json()) as RespostaAgente
      setHistorico((h) => [...h, { role: 'assistant', content: data.mensagem }])
      if (data.proposta) setProposta(data.proposta)
    } finally {
      setCarregando(false)
    }
  }

  async function confirmar() {
    if (!proposta) return
    setCarregando(true)
    try {
      const r = await executarAcao(proposta)
      setHistorico((h) => [...h, { role: 'assistant', content: `✅ ${r.detalhe}` }])
      setProposta(null)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {historico.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <span className={`inline-block rounded-md px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary/20' : 'bg-muted'}`}>{m.content}</span>
          </div>
        ))}
      </div>

      {proposta && (
        <Card className="border-amber-400/40">
          <CardContent className="pt-6 space-y-3">
            <div className="text-sm">O copiloto propõe a ação <strong>{proposta.tipo}</strong>:</div>
            <pre className="text-xs bg-muted p-2 rounded overflow-auto">{JSON.stringify(proposta, null, 2)}</pre>
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmar} disabled={carregando}>Confirmar</Button>
              <Button size="sm" variant="outline" onClick={() => setProposta(null)} disabled={carregando}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-md px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
          placeholder="Pergunte algo… (ex: qual meu runway se eu contratar 2 devs a R$15k?)"
          disabled={carregando}
        />
        <Button onClick={enviar} disabled={carregando}>{carregando ? '…' : 'Enviar'}</Button>
      </div>
    </div>
  )
}
