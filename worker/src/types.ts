export type Env = {
  DB: D1Database
  TEAM_DOMAIN: string
  AUD_TAG: string
  ASSETS: Fetcher
}

export type AccessIdentity = {
  email?: string
  common_name?: string
  sub?: string
}

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
  type: string
  occurred_at: number
  payload: string
}

export type DeviceRow = {
  device_id: string
  name: string
  tz: string
  last_seen: number
}

export type PushRange = {
  id: string
  started_at: number
  ended_at: number
  bundle_id?: string | null
  app_name?: string | null
  ssid?: string | null
  lid_open: boolean
  active_count: number
  idle_count: number
}

export type PushEvent = {
  id: string
  type: string
  occurred_at: number
  payload: Record<string, unknown>
}

export type DayPayload = {
  device_id: string
  device_name: string
  tz: string
  local_date: string
  ranges: PushRange[]
  events: PushEvent[]
}
