'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

const CHUNK_RE = /ChunkLoadError|Loading chunk|dynamically imported module|module script failed/i

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Erro de chunk/asset velho após deploy → recarrega uma vez para pegar o build novo.
    if (CHUNK_RE.test(error.message || '')) {
      const KEY = 'dash-chunk-reload'
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1')
        window.location.reload()
      }
    }
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h2 className="text-xl font-semibold">Não foi possível carregar esta tela</h2>
      <p className="text-sm text-muted-foreground">Pode ser uma atualização recente do sistema. Tente recarregar.</p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>Recarregar</Button>
        <Button variant="outline" onClick={() => reset()}>Tentar de novo</Button>
      </div>
    </div>
  )
}
