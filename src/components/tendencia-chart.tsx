'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type TendenciaRow = { mes: string; MRR: number; Caixa: number }

const COLORS = { MRR: '#0072B2', Caixa: '#009E73' }

export function TendenciaChart({ rows }: { rows: TendenciaRow[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={rows}>
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => typeof v === 'number' ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : v} />
          <Legend />
          <Line type="monotone" dataKey="MRR" stroke={COLORS.MRR} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Caixa" stroke={COLORS.Caixa} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
