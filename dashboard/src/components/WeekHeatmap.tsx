import { useMemo, useState } from 'react'
import type { RangeRow, DateRange } from '../api/types'
import { rollupWeekHeatmap, fmtDuration } from '../lib/rollups'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const LEVELS: [number, string][] = [
  [0.75, '#34d399'],
  [0.50, '#10b981'],
  [0.25, '#047857'],
  [0.10, '#065f46'],
  [0.01, '#064e3b'],
  [0, '#1f2937'],
]

function cellColor(pct: number): string {
  for (const [threshold, color] of LEVELS) {
    if (pct >= threshold) return color
  }
  return '#1f2937'
}

type Props = {
  ranges: RangeRow[]
  dateRange: DateRange
}

export function WeekHeatmap({ ranges, dateRange }: Props) {
  const [mode, setMode] = useState<'active' | 'lid-open'>('active')
  const { pct, ms } = useMemo(
    () => rollupWeekHeatmap(ranges, dateRange, mode),
    [ranges, dateRange, mode],
  )
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null)

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-300">Week heatmap</p>
        <button
          onClick={() => setMode(m => (m === 'active' ? 'lid-open' : 'active'))}
          className="text-xs text-gray-400 hover:text-gray-200 bg-gray-800 rounded px-2 py-1"
        >
          {mode === 'active' ? 'Active' : 'Lid open'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="w-8" />
              {Array.from({ length: 24 }, (_, h) => (
                <th
                  key={h}
                  className="text-[10px] text-gray-500 font-normal text-center"
                >
                  {h % 3 === 0 ? h : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, di) => (
              <tr key={day}>
                <td className="text-[10px] text-gray-500 pr-1 text-right">{day}</td>
                {Array.from({ length: 24 }, (_, h) => (
                  <td
                    key={h}
                    className="relative"
                    onMouseEnter={() => setHover({ day: di, hour: h })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-sm"
                      style={{ backgroundColor: cellColor(pct[di][h]) }}
                    />
                    {hover?.day === di && hover?.hour === h && pct[di][h] > 0 && (
                      <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-200 whitespace-nowrap pointer-events-none">
                        {day} {h}:00–{(h + 1) % 24}:00 · {Math.round(pct[di][h] * 100)}% · {fmtDuration(ms[di][h])}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-1 mt-3 text-[10px] text-gray-500">
        <span>Less</span>
        {LEVELS.slice().reverse().map(([, color], i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: color }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
