export type RangeRow = {
  id: string
  device_id: string
  local_date: string
  started_at: number
  ended_at: number
  bundle_id: string | null
  app_name: string | null
  ssid: string | null
  lid_open: number
  active_count: number
  idle_count: number
}

export type EventRow = {
  id: string
  device_id: string
  local_date: string
  type: 'lid_open' | 'lid_close' | 'wifi_change'
  occurred_at: number
  payload: string
}

export type DeviceRow = {
  device_id: string
  name: string
  tz: string
  last_seen: number
}

export type DateRange = {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
}
