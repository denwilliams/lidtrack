import { addDays } from 'date-fns'
import type { RangeRow, DateRange } from '../api/types'

export type AppStat = { name: string; activeMs: number }
export type SSIDStat = { ssid: string; activeMs: number }
export type DeviceStat = { deviceId: string; activeMs: number; lidOpenMs: number }

function activeDuration(r: RangeRow): number {
  const total = r.ended_at - r.started_at
  const samples = r.active_count + r.idle_count
  return samples > 0 ? (total * r.active_count) / samples : 0
}

export function computeHeadlines(ranges: RangeRow[]) {
  let activeMs = 0
  let lidOpenMs = 0

  for (const r of ranges) {
    if (r.lid_open) lidOpenMs += r.ended_at - r.started_at
    activeMs += activeDuration(r)
  }

  return { activeMs, lidOpenMs }
}

export function rollupByApp(ranges: RangeRow[]): AppStat[] {
  const map = new Map<string, number>()
  for (const r of ranges) {
    const key = r.app_name ?? r.bundle_id ?? 'Unknown'
    map.set(key, (map.get(key) ?? 0) + activeDuration(r))
  }
  return [...map.entries()]
    .map(([name, activeMs]) => ({ name, activeMs }))
    .filter(s => s.activeMs > 0)
    .sort((a, b) => b.activeMs - a.activeMs)
    .slice(0, 15)
}

export function rollupBySSID(ranges: RangeRow[]): SSIDStat[] {
  const map = new Map<string, number>()
  for (const r of ranges) {
    const key = r.ssid ?? 'Unknown'
    map.set(key, (map.get(key) ?? 0) + activeDuration(r))
  }
  return [...map.entries()]
    .map(([ssid, activeMs]) => ({ ssid, activeMs }))
    .filter(s => s.activeMs > 0)
    .sort((a, b) => b.activeMs - a.activeMs)
}

export function rollupByDevice(ranges: RangeRow[]): DeviceStat[] {
  const map = new Map<string, { activeMs: number; lidOpenMs: number }>()
  for (const r of ranges) {
    const prev = map.get(r.device_id) ?? { activeMs: 0, lidOpenMs: 0 }
    map.set(r.device_id, {
      activeMs: prev.activeMs + activeDuration(r),
      lidOpenMs: prev.lidOpenMs + (r.lid_open ? r.ended_at - r.started_at : 0),
    })
  }
  return [...map.entries()]
    .map(([deviceId, stats]) => ({ deviceId, ...stats }))
    .sort((a, b) => b.activeMs - a.activeMs)
}

export type HeatmapGrid = {
  pct: number[][]
  ms: number[][]
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function rollupWeekHeatmap(
  ranges: RangeRow[],
  dateRange: DateRange,
  mode: 'active' | 'lid-open',
): HeatmapGrid {
  const MS_PER_HOUR = 3_600_000
  const msGrid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  const dayCounts = Array(7).fill(0) as number[]

  let d = parseLocalDate(dateRange.from)
  const end = parseLocalDate(dateRange.to)
  while (d <= end) {
    const dow = d.getDay()
    dayCounts[dow === 0 ? 6 : dow - 1]++
    d = addDays(d, 1)
  }

  for (const r of ranges) {
    const totalDuration = r.ended_at - r.started_at
    if (totalDuration <= 0) continue

    let weight: number
    if (mode === 'active') {
      weight = activeDuration(r) / totalDuration
    } else {
      weight = r.lid_open ? 1 : 0
    }
    if (weight === 0) continue

    let cursor = r.started_at
    while (cursor < r.ended_at) {
      const dt = new Date(cursor)
      const dow = dt.getDay()
      const dayIdx = dow === 0 ? 6 : dow - 1
      const hour = dt.getHours()

      const nextHour = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), hour + 1)
      const segEnd = Math.min(nextHour.getTime(), r.ended_at)
      msGrid[dayIdx][hour] += (segEnd - cursor) * weight
      cursor = segEnd
    }
  }

  const pct = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => {
      const total = dayCounts[day] * MS_PER_HOUR
      return total > 0 ? Math.min(msGrid[day][hour] / total, 1) : 0
    }),
  )

  return { pct, ms: msGrid }
}

export function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}
