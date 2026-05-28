'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

type ProjecaoRow = {
  mes_ref: string
  cenario_nome: string
  caixa: number
  receita_total: number
  despesa_total: number
}

const COLORS: Record<string, string> = {
  Base: '#0072B2',
  Best: '#009E73',
  Worst: '#D55E00',
}

export function ForecastChart({ rows }: { rows: ProjecaoRow[] }) {
  // Pivot to { mes_ref, Base, Best, Worst } per row
  const meses = Array.from(new Set(rows.map((r) => r.mes_ref))).sort()
  const data = meses.map((m) => {
    const obj: Record<string, number | string> = { mes_ref: m.slice(0, 7) }
    for (const r of rows.filter((x) => x.mes_ref === m)) {
      obj[r.cenario_nome] = r.caixa
    }
    return obj
  })

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="mes_ref" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => typeof v === 'number' ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : v} />
          <Legend />
          <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
          {Object.keys(COLORS).map((c) => (
            <Line key={c} type="monotone" dataKey={c} stroke={COLORS[c]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
