import type { RangeRow, EventRow, DeviceRow } from './types'

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' })

  // Access cookie expired — let Access handle the redirect.
  if (res.status === 401 || res.status === 302) {
    window.location.reload()
    return new Promise(() => {}) // never resolves
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export function fetchRanges(from: string, to: string, deviceId?: string): Promise<RangeRow[]> {
  const params = new URLSearchParams({ from, to })
  if (deviceId) params.set('device_id', deviceId)
  return apiFetch<RangeRow[]>(`/ranges?${params}`)
}

export function fetchEvents(from: string, to: string, deviceId?: string): Promise<EventRow[]> {
  const params = new URLSearchParams({ from, to })
  if (deviceId) params.set('device_id', deviceId)
  return apiFetch<EventRow[]>(`/events?${params}`)
}

export function fetchDevices(): Promise<DeviceRow[]> {
  return apiFetch<DeviceRow[]>('/devices')
}
