'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/',                  label: 'Dashboard' },
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

export function Sidebar({ alertasUnread = 0 }: { alertasUnread?: number }) {
  const pathname = usePathname()
  return (
    <aside className="w-64 border-r bg-neutral-50 dark:bg-neutral-950 min-h-screen p-4">
      <div className="font-semibold mb-6 px-2">IAgentics Finanças</div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                'px-3 py-2 rounded-md text-sm transition-colors flex items-center ' +
                (active
                  ? 'bg-neutral-200 dark:bg-neutral-800 font-medium'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-900')
              }
            >
              {item.label}
              {item.href === '/alertas' && alertasUnread > 0 ? (
                <span className="ml-2 inline-block min-w-[20px] text-center bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5">
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
