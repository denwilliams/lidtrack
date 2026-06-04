import { format, parseISO } from 'date-fns'
import { fmtDuration } from '../lib/rollups'
import type { DayReport } from '../lib/rollups'

const SSID_COLORS = [
  'bg-indigo-900 text-indigo-200',
  'bg-emerald-900 text-emerald-200',
  'bg-amber-900 text-amber-200',
  'bg-rose-900 text-rose-200',
  'bg-sky-900 text-sky-200',
]

type Props = {
  days: DayReport[]
  allSsids: string[]
  ssidFilter?: string
}

function fmtTime(ms: number): string {
  return format(new Date(ms), 'h:mm a')
}

export function ReportView({ days, allSsids, ssidFilter }: Props) {
  if (days.length === 0) {
    return (
      <p className="text-gray-600 text-sm text-center py-8">
        No data for this period. Data syncs at midnight each day.
      </p>
    )
  }

  const showSsids = allSsids.length > 1 && !ssidFilter
  const ssidColorIndex = new Map(allSsids.map((s, i) => [s, i % SSID_COLORS.length]))

  return (
    <div className="space-y-4">
      {days.map(day => {
        const totalMs = day.blocks.reduce((s, b) => s + (b.endedAt - b.startedAt), 0)
        return (
          <div key={day.date} className="bg-gray-900 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-medium text-gray-100">
                {format(parseISO(day.date), 'EEEE, d MMMM')}
              </p>
              <span className="text-sm text-gray-400 tabular-nums">{fmtDuration(totalMs)}</span>
            </div>
            <div className="space-y-1.5">
              {day.blocks.map((block, i) => {
                const duration = block.endedAt - block.startedAt
                return (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-gray-300 tabular-nums whitespace-nowrap">
                      {fmtTime(block.startedAt)}
                      <span className="text-gray-600 mx-1">–</span>
                      {fmtTime(block.endedAt)}
                    </span>
                    <span className="text-gray-500 whitespace-nowrap">{fmtDuration(duration)}</span>
                    {showSsids && (
                      <div className="flex flex-wrap gap-1">
                        {block.ssids.map(s => (
                          <span
                            key={s}
                            className={`px-1.5 py-0.5 rounded text-xs ${SSID_COLORS[ssidColorIndex.get(s) ?? 0]}`}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
