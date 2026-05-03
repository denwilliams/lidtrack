import { fmtDuration, computeHeadlines, rollupByApp, rollupBySSID } from '../lib/rollups'
import type { RangeRow } from '../api/types'

type Props = { ranges: RangeRow[] }

export function HeadlineNumbers({ ranges }: Props) {
  const { activeMs, lidOpenMs } = computeHeadlines(ranges)
  const topApp = rollupByApp(ranges)[0]
  const topSSID = rollupBySSID(ranges)[0]

  const cards = [
    { label: 'Active time',    value: fmtDuration(activeMs) },
    { label: 'Lid open',       value: fmtDuration(lidOpenMs) },
    { label: 'Top app',        value: topApp?.name ?? '—' },
    { label: 'Top network',    value: topSSID?.ssid ?? '—' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(c => (
        <div key={c.label} className="bg-gray-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</p>
          <p className="mt-1 text-2xl font-semibold truncate">{c.value}</p>
        </div>
      ))}
    </div>
  )
}
