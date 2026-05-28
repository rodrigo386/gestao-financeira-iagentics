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
  { href: '/relatorios',        label: 'Relatórios' },
  { href: '/config',            label: 'Configurações' },
]

export function Sidebar() {
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
                'px-3 py-2 rounded-md text-sm transition-colors ' +
                (active
                  ? 'bg-neutral-200 dark:bg-neutral-800 font-medium'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-900')
              }
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
