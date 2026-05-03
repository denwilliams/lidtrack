import type { Context } from 'hono'
import type { Env, AccessIdentity, DayPayload, PushRange, PushEvent } from '../types'

type Variables = { identity: AccessIdentity }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validatePayload(body: unknown): body is DayPayload {
  if (!body || typeof body !== 'object') return false
  const p = body as Record<string, unknown>
  if (typeof p.device_name !== 'string' || !p.device_name) return false
  if (typeof p.tz !== 'string' || !p.tz) return false
  if (typeof p.local_date !== 'string' || !DATE_RE.test(p.local_date)) return false
  if (!Array.isArray(p.ranges) || !Array.isArray(p.events)) return false
  for (const r of p.ranges as unknown[]) {
    if (!r || typeof r !== 'object') return false
    const rr = r as Record<string, unknown>
    if (typeof rr.id !== 'string' || !UUID_RE.test(rr.id)) return false
    if (typeof rr.started_at !== 'number' || typeof rr.ended_at !== 'number') return false
    if (typeof rr.lid_open !== 'boolean') return false
    if (typeof rr.active_count !== 'number' || typeof rr.idle_count !== 'number') return false
  }
  for (const e of p.events as unknown[]) {
    if (!e || typeof e !== 'object') return false
    const ee = e as Record<string, unknown>
    if (typeof ee.id !== 'string' || !UUID_RE.test(ee.id)) return false
    if (typeof ee.type !== 'string' || !ee.type) return false
    if (typeof ee.occurred_at !== 'number') return false
  }
  return true
}

export async function postDays(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const body = await c.req.json().catch(() => null)
  if (!validatePayload(body)) {
    return c.json({ error: 'invalid payload' }, 400)
  }

  // Device identity comes from the Access JWT, not the client payload.
  const identity = c.get('identity')
  const deviceId = identity.common_name ?? identity.sub

  const { device_name, tz, local_date, ranges, events } = body

  const already = await c.env.DB
    .prepare('SELECT 1 FROM synced_days WHERE device_id = ? AND local_date = ?')
    .bind(deviceId, local_date)
    .first()

  if (already) {
    return c.json({ ok: true, already_synced: true })
  }

  const now = Date.now()

  const statements: D1PreparedStatement[] = []

  for (const r of ranges as PushRange[]) {
    statements.push(
      c.env.DB
        .prepare(`INSERT OR IGNORE INTO ranges
          (id, device_id, local_date, started_at, ended_at, bundle_id, app_name, ssid, lid_open, active_count, idle_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          r.id, deviceId, local_date,
          r.started_at, r.ended_at,
          r.bundle_id ?? null, r.app_name ?? null, r.ssid ?? null,
          r.lid_open ? 1 : 0,
          r.active_count, r.idle_count,
        )
    )
  }

  for (const e of events as PushEvent[]) {
    statements.push(
      c.env.DB
        .prepare(`INSERT OR IGNORE INTO events
          (id, device_id, local_date, type, occurred_at, payload)
          VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(
          e.id, deviceId, local_date,
          e.type, e.occurred_at,
          JSON.stringify(e.payload),
        )
    )
  }

  statements.push(
    c.env.DB
      .prepare(`INSERT OR REPLACE INTO devices (device_id, name, tz, last_seen) VALUES (?, ?, ?, ?)`)
      .bind(deviceId, device_name, tz, now)
  )

  statements.push(
    c.env.DB
      .prepare(`INSERT INTO synced_days (device_id, local_date, synced_at) VALUES (?, ?, ?)`)
      .bind(deviceId, local_date, now)
  )

  await c.env.DB.batch(statements)

  return c.json({ ok: true })
}
