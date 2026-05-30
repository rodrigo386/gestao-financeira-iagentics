'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ROLES_ATRIBUIVEIS, type RoleAtribuivel } from '@/modules/usuarios/types'

type Props = {
  onCriar: (input: { email: string; senha: string; nome: string; role: RoleAtribuivel }) => Promise<void>
}

export function UsuarioCreateForm({ onCriar }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [role, setRole] = useState<RoleAtribuivel>('leitura')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    setOk(null)
    try {
      await onCriar({ email, senha, nome, role })
      setOk(`Usuário ${email} criado.`)
      setEmail(''); setNome(''); setSenha(''); setRole('leitura')
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Novo usuário</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="senha">Senha * (mín. 8)</Label>
              <Input id="senha" type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Papel *</Label>
              <select
                id="role"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background border-border"
                value={role}
                onChange={(e) => setRole(e.target.value as RoleAtribuivel)}
              >
                {ROLES_ATRIBUIVEIS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          {ok && <p className="text-sm text-emerald-400">{ok}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Criando...' : 'Criar usuário'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
