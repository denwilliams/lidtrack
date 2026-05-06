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

const SSID_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#a855f7',
]

type Mode = 'active' | 'lid-open' | 'wifi'
const MODE_LABELS: Record<Mode, string> = {
  'active': 'Active',
  'lid-open': 'Lid open',
  'wifi': 'WiFi',
}
const MODE_ORDER: Mode[] = ['active', 'lid-open', 'wifi']

function cellColor(pct: number): string {
  for (const [threshold, color] of LEVELS) {
    if (pct >= threshold) return color
  }
  return '#1f2937'
}

function dominantSsid(cellMap: Map<string, number>): string | null {
  let best: string | null = null
  let bestMs = 0
  for (const [ssid, ms] of cellMap) {
    if (ms > bestMs) {
      best = ssid
      bestMs = ms
    }
  }
  return best
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

type Props = {
  ranges: RangeRow[]
  dateRange: DateRange
}

export function WeekHeatmap({ ranges, dateRange }: Props) {
  const [mode, setMode] = useState<Mode>('active')
  const { pct, ms, ssidMs, ssids } = useMemo(
    () => rollupWeekHeatmap(ranges, dateRange, mode),
    [ranges, dateRange, mode],
  )
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null)

  const ssidColorMap = useMemo(() => {
    const map = new Map<string, string>()
    ssids.forEach((ssid, i) => map.set(ssid, SSID_PALETTE[i % SSID_PALETTE.length]))
    return map
  }, [ssids])

  function getCellStyle(day: number, hour: number): React.CSSProperties {
    if (mode !== 'wifi') {
      return { backgroundColor: cellColor(pct[day][hour]) }
    }
    const p = pct[day][hour]
    if (p === 0) return { backgroundColor: '#1f2937' }
    const ssid = dominantSsid(ssidMs[day][hour])
    if (!ssid) return { backgroundColor: '#1f2937' }
    const color = ssidColorMap.get(ssid) ?? SSID_PALETTE[0]
    const [r, g, b] = hexToRgb(color)
    const alpha = 0.25 + p * 0.75
    return { backgroundColor: `rgba(${r},${g},${b},${alpha})` }
  }

  function getTooltip(day: number, hour: number): string {
    const base = `${DAYS[day]} ${hour}:00–${(hour + 1) % 24}:00 · ${Math.round(pct[day][hour] * 100)}% · ${fmtDuration(ms[day][hour])}`
    if (mode === 'wifi') {
      const ssid = dominantSsid(ssidMs[day][hour])
      return ssid ? `${ssid} · ${base}` : base
    }
    return base
  }

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-300">Week heatmap</p>
        <button
          onClick={() => setMode(m => MODE_ORDER[(MODE_ORDER.indexOf(m) + 1) % MODE_ORDER.length])}
          className="text-xs text-gray-400 hover:text-gray-200 bg-gray-800 rounded px-2 py-1"
        >
          {MODE_LABELS[mode]}
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
                      style={getCellStyle(di, h)}
                    />
                    {hover?.day === di && hover?.hour === h && pct[di][h] > 0 && (
                      <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-200 whitespace-nowrap pointer-events-none">
                        {getTooltip(di, h)}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode === 'wifi' && ssids.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] text-gray-400">
          {ssids.map(ssid => (
            <span key={ssid} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: ssidColorMap.get(ssid) }}
              />
              {ssid}
            </span>
          ))}
        </div>
      ) : (
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
      )}
    </div>
  )
}
