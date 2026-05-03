import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfYear } from 'date-fns'
import type { DateRange } from '../api/types'

type Preset = { label: string; from: string; to: string }

function yesterday() {
  return format(subDays(new Date(), 1), 'yyyy-MM-dd')
}

function makePresets(): Preset[] {
  const y = yesterday()
  return [
    { label: '7d',   from: format(subDays(new Date(), 7),  'yyyy-MM-dd'), to: y },
    { label: '30d',  from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: y },
    { label: 'This month', from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: y },
    { label: 'Last month', from: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), to: format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') },
    { label: 'This year', from: format(startOfYear(new Date()), 'yyyy-MM-dd'), to: y },
  ]
}

type Props = {
  value: DateRange
  onChange: (r: DateRange) => void
}

export function RangePicker({ value, onChange }: Props) {
  const presets = makePresets()

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {presets.map(p => {
        const active = value.from === p.from && value.to === p.to
        return (
          <button
            key={p.label}
            onClick={() => onChange({ from: p.from, to: p.to })}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${active
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            {p.label}
          </button>
        )
      })}
      <span className="text-xs text-gray-500 ml-2">
        {value.from} → {value.to}
      </span>
    </div>
  )
}
