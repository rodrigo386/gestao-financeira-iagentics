'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrMsg(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setStatus('error')
      setErrMsg(error.message)
      return
    }
    setStatus('sent')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar — IAgentics Finanças</CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'sent' ? (
            <p className="text-sm">Link de acesso enviado para <strong>{email}</strong>. Verifique seu e-mail.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@iagentics.com"
                />
              </div>
              <Button type="submit" className="w-full" disabled={status === 'sending'}>
                {status === 'sending' ? 'Enviando...' : 'Enviar link de acesso'}
              </Button>
              {errMsg && <p className="text-sm text-destructive">{errMsg}</p>}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
