'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ROLES_ATRIBUIVEIS, type RoleAtribuivel, type UsuarioListItem } from '@/modules/usuarios/types'

type Props = {
  usuarios: UsuarioListItem[]
  meId: string
  onRedefinirSenha: (userId: string, novaSenha: string) => Promise<void>
  onTrocarRole: (userId: string, role: RoleAtribuivel) => Promise<void>
  onRemover: (userId: string) => Promise<void>
}

export function UsuariosTable({ usuarios, meId, onRedefinirSenha, onTrocarRole, onRemover }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function run(fn: () => Promise<void>) {
    setErr(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro desconhecido')
      }
    })
  }

  return (
    <div className="space-y-2">
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((u) => {
            const isAdmin = u.role === 'admin'
            const isMe = u.id === meId
            return (
              <TableRow key={u.id}>
                <TableCell>{u.nome}</TableCell>
                <TableCell className="text-muted-foreground">{u.email ?? '—'}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <span className="text-primary font-medium">admin</span>
                  ) : (
                    <select
                      className="border rounded-md px-2 py-1 text-sm bg-background border-border"
                      value={u.role}
                      disabled={pending}
                      onChange={(e) => run(() => onTrocarRole(u.id, e.target.value as RoleAtribuivel))}
                    >
                      {ROLES_ATRIBUIVEIS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      const nova = window.prompt(`Nova senha para ${u.email ?? u.nome} (mín. 8 caracteres):`)
                      if (nova && nova.length >= 8) run(() => onRedefinirSenha(u.id, nova))
                      else if (nova) setErr('Senha deve ter ao menos 8 caracteres.')
                    }}
                  >
                    Redefinir senha
                  </Button>
                  {!isAdmin && !isMe && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Remover ${u.email ?? u.nome}? Esta ação é permanente.`)) run(() => onRemover(u.id))
                      }}
                    >
                      Remover
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
