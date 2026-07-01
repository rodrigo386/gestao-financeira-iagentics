'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/brand-logo'

const NAV = [
  { href: '/',               label: 'Início' },
  { href: '/contas-receber', label: 'Receber' },
  { href: '/contas-pagar',   label: 'Pagar' },
  { href: '/config',         label: 'Configurações' },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground min-h-screen p-4">
      <div className="mb-1 px-2 pt-1">
        <BrandLogo size={26} />
      </div>
      <div className="mb-6 px-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        Gestão Financeira
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
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
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
