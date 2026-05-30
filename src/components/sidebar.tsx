'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/brand-logo'

const NAV = [
  { href: '/',                  label: 'Dashboard' },
  { href: '/copiloto',          label: 'Copiloto' },
  { href: '/receitas',          label: 'Receitas' },
  { href: '/contas-receber',    label: 'Contas a Receber' },
  { href: '/despesas',          label: 'Despesas' },
  { href: '/contas-pagar',      label: 'Contas a Pagar' },
  { href: '/folha',             label: 'Folha de Pagamento' },
  { href: '/fluxo-caixa',       label: 'Fluxo de Caixa' },
  { href: '/pendencias',        label: 'Pendências' },
  { href: '/conciliacao',       label: 'Conciliação' },
  { href: '/forecast',          label: 'Forecast' },
  { href: '/alertas',           label: 'Alertas' },
  { href: '/relatorios',        label: 'Relatórios' },
  { href: '/config',            label: 'Configurações' },
]

export function Sidebar({ alertasUnread = 0, isAdmin = false }: { alertasUnread?: number; isAdmin?: boolean }) {
  const pathname = usePathname()
  const nav = isAdmin ? [...NAV, { href: '/config/usuarios', label: 'Usuários' }] : NAV
  return (
    <aside className="w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground min-h-screen p-4">
      <div className="mb-1 px-2 pt-1">
        <BrandLogo size={26} />
      </div>
      <div className="mb-6 px-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        Gestão Financeira
      </div>
      <nav className="flex flex-col gap-1">
        {nav.map((item) => {
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
        })}
      </nav>
    </aside>
  )
}
