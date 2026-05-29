'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'

type TendenciaRow = { mes: string; MRR: number; Caixa: number }

// IAgentics brand palette — MRR in brand violet, Caixa in warm amber for contrast.
const COLORS = { MRR: '#b06bff', Caixa: '#c9943e' }
const AXIS = '#8b82b8'

export function TendenciaChart({ rows }: { rows: TendenciaRow[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#241c40" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: AXIS }} stroke="#241c40" tickLine={false} />
          <YAxis tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: AXIS }} stroke="#241c40" tickLine={false} width={56} />
          <Tooltip
            cursor={{ stroke: '#8350F0', strokeWidth: 1 }}
            contentStyle={{ background: '#0e0b1e', border: '1px solid #241c40', borderRadius: 8, color: '#e7e3fb', fontSize: 12 }}
            labelStyle={{ color: '#8b82b8' }}
            formatter={(v) => (typeof v === 'number' ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : v)}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: AXIS }} />
          <Line type="monotone" dataKey="MRR" stroke={COLORS.MRR} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="Caixa" stroke={COLORS.Caixa} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
