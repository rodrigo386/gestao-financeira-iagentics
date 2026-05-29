'use client'

import { Button } from '@/components/ui/button'

type Conta = { id: string; banco: string; agencia: string | null; conta: string | null }

type Actions = {
  aprovar: (formData: FormData) => void | Promise<void>
  pagar: (formData: FormData) => void | Promise<void>
  cancelar: (formData: FormData) => void | Promise<void>
}

type APRowActionsProps = {
  row: {
    id: string
    status: string
    data_pagamento: string | null
  }
  contas: Conta[]
  actions: Actions
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function APRowActions({ row, contas, actions }: APRowActionsProps) {
  if (row.status === 'pago') {
    return (
      <span className="text-sm text-muted-foreground">
        ✓ pago em {row.data_pagamento ? formatDate(row.data_pagamento) : '—'}
      </span>
    )
  }

  if (row.status === 'cancelado') {
    return <span className="text-sm text-muted-foreground">✕ cancelado</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(row.status === 'previsto' || row.status === 'atrasado') && (
        <form action={actions.aprovar}>
          <input type="hidden" name="id" value={row.id} />
          <Button type="submit" size="sm" variant="outline">
            Aprovar
          </Button>
        </form>
      )}

      {row.status === 'aprovado' && (
        <>
          {contas.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              Cadastre uma conta bancária antes de marcar APs como pagas
            </span>
          ) : (
            <form action={actions.pagar} className="flex items-center gap-2">
              <input type="hidden" name="id" value={row.id} />
              <select
                name="conta_id"
                className="border rounded-md px-2 py-1 text-sm bg-background"
                required
              >
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.banco}{c.agencia ? ` ag. ${c.agencia}` : ''}{c.conta ? ` c/c ${c.conta}` : ''}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm">
                Marcar pago
              </Button>
            </form>
          )}
        </>
      )}

      <form action={actions.cancelar}>
        <input type="hidden" name="id" value={row.id} />
        <Button type="submit" size="sm" variant="ghost">
          Cancelar
        </Button>
      </form>
    </div>
  )
}
