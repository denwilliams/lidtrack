import type { RangeRow } from '../api/types'

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

export function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}
