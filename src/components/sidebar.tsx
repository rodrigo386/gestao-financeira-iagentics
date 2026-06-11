'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/brand-logo'

type Item = { href: string; label: string }

const DIA_A_DIA: Item[] = [
  { href: '/',               label: 'Dashboard' },
  { href: '/receitas',       label: 'Receitas' },
  { href: '/contas-receber', label: 'Contas a Receber' },
  { href: '/despesas',       label: 'Despesas' },
  { href: '/contas-pagar',   label: 'Contas a Pagar' },
  { href: '/pendencias',     label: 'Pendências' },
]

const MENSAL: Item[] = [
  { href: '/fechamento',  label: 'Fechamento do mês' },
  { href: '/folha',       label: 'Folha de Pagamento' },
  { href: '/fluxo-caixa', label: 'Fluxo de Caixa' },
  { href: '/relatorios',  label: 'Relatórios' },
  { href: '/forecast',    label: 'Forecast' },
]

const AVANCADO: Item[] = [
  { href: '/copiloto',    label: 'Copiloto' },
  { href: '/conciliacao', label: 'Conciliação' },
  { href: '/alertas',     label: 'Alertas' },
]

export function Sidebar({ alertasUnread = 0, isAdmin = false }: { alertasUnread?: number; isAdmin?: boolean }) {
  const pathname = usePathname()
  const [avancadoAberto, setAvancadoAberto] = useState(false)

  const config: Item[] = isAdmin
    ? [
        { href: '/config',          label: 'Configurações' },
        { href: '/master-data',     label: 'Master Data' },
        { href: '/config/usuarios', label: 'Usuários' },
      ]
    : [{ href: '/config', label: 'Configurações' }]

  function GroupLabel({ children }: { children: ReactNode }) {
    return (
      <div className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </div>
    )
  }

  function renderItem(item: Item) {
    const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
    return (
      <Link
        key={item.href}
        href={item.href}
        className={
          'px-3 py-2 rounded-md text-sm transition-colors flex items-center border-l-2 ' +
          (active
            ? 'border-primary bg-primary/10 text-primary font-semibold'
            : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground')
        }
      >
        {item.label}
        {item.href === '/alertas' && alertasUnread > 0 ? (
          <span className="ml-2 inline-block min-w-[20px] text-center bg-rose-500 text-white text-xs rounded-full px-1.5 py-0.5">
            {alertasUnread > 99 ? '99+' : alertasUnread}
          </span>
        ) : null}
      </Link>
    )
  }

  return (
    <aside className="w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground min-h-screen p-4">
      <div className="mb-1 px-2 pt-1">
        <BrandLogo size={26} />
      </div>
      <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        Gestão Financeira
      </div>
      <nav className="flex flex-col gap-1">
        <GroupLabel>Dia a dia</GroupLabel>
        {DIA_A_DIA.map(renderItem)}

        <GroupLabel>Mensal</GroupLabel>
        {MENSAL.map(renderItem)}

        <GroupLabel>Config</GroupLabel>
        {config.map(renderItem)}

        <button
          type="button"
          onClick={() => setAvancadoAberto((v) => !v)}
          className="mt-4 flex items-center justify-between px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          <span>Avançado</span>
          <span className="flex items-center gap-1">
            {!avancadoAberto && alertasUnread > 0 ? (
              <span className="inline-block min-w-[18px] text-center bg-rose-500 text-white text-[10px] rounded-full px-1 py-0.5">
                {alertasUnread > 99 ? '99+' : alertasUnread}
              </span>
            ) : null}
            <span aria-hidden>{avancadoAberto ? '▾' : '▸'}</span>
          </span>
        </button>
        {avancadoAberto && AVANCADO.map(renderItem)}
      </nav>
    </aside>
  )
}
