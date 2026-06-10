'use client'

import { useEffect } from 'react'

// Após um deploy, abas abertas podem buscar chunks/assets do build antigo (hash
// que deixou de existir) → erro de carregamento. Aqui detectamos isso e
// recarregamos UMA vez (throttle de 10s evita loop) para pegar o build novo.
const CHUNK_RE = /ChunkLoadError|Loading chunk|dynamically imported module|module script failed|Failed to fetch/i

export function ChunkReloadGuard() {
  useEffect(() => {
    function recarregarUmaVez() {
      const KEY = 'chunk-reload-ts'
      const last = Number(sessionStorage.getItem(KEY) || '0')
      if (Date.now() - last < 10000) return
      sessionStorage.setItem(KEY, String(Date.now()))
      window.location.reload()
    }
    function ehChunk(msg?: string) { return !!msg && CHUNK_RE.test(msg) }
    function onError(e: ErrorEvent) {
      if (ehChunk(e.message) || ehChunk((e.error as Error | undefined)?.message)) recarregarUmaVez()
    }
    function onRejection(e: PromiseRejectionEvent) {
      const r = e.reason as unknown
      const msg = typeof r === 'string' ? r : (r as Error | undefined)?.message
      if (ehChunk(msg)) recarregarUmaVez()
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
