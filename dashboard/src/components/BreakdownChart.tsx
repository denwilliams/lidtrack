import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { fmtDuration } from '../lib/rollups'

type Entry = { label: string; ms: number }

type Props = {
  title: string
  data: Entry[]
  color?: string
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe',
  '#818cf8', '#a5b4fc', '#c7d2fe',
]

export function BreakdownChart({ title, data, color }: Props) {
  if (data.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm font-medium text-gray-300 mb-3">{title}</p>
        <p className="text-gray-600 text-sm">No data</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <p className="text-sm font-medium text-gray-300 mb-4">{title}</p>
      <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 0, right: 48, top: 0, bottom: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            formatter={(val: number) => [fmtDuration(val), 'Active']}
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#e5e7eb' }}
          />
          <Bar dataKey="ms" radius={4} label={{ position: 'right', formatter: fmtDuration, fill: '#6b7280', fontSize: 11 }}>
            {data.map((_, i) => (
              <Cell key={i} fill={color ?? COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
