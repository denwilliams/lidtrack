import type { Context } from 'hono'
import type { Env } from '../types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 92

function parseQuery(c: Context<{ Bindings: Env }>) {
  const from = c.req.query('from') ?? ''
  const to = c.req.query('to') ?? ''
  const device_id = c.req.query('device_id') ?? null

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return { error: 'from and to must be YYYY-MM-DD' as const }
  }

  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000
  if (days < 0 || days > MAX_DAYS) {
    return { error: `range must be 0–${MAX_DAYS} days` as const }
  }

  return { from, to, device_id }
}

export async function getRanges(c: Context<{ Bindings: Env }>) {
  const q = parseQuery(c)
  if ('error' in q) return c.json({ error: q.error }, 400)

  const { from, to, device_id } = q

  const stmt = device_id
    ? c.env.DB
        .prepare('SELECT * FROM ranges WHERE local_date >= ? AND local_date <= ? AND device_id = ? ORDER BY started_at')
        .bind(from, to, device_id)
    : c.env.DB
        .prepare('SELECT * FROM ranges WHERE local_date >= ? AND local_date <= ? ORDER BY started_at')
        .bind(from, to)

  const { results } = await stmt.all()
  return c.json(results)
}

export async function getEvents(c: Context<{ Bindings: Env }>) {
  const q = parseQuery(c)
  if ('error' in q) return c.json({ error: q.error }, 400)

  const { from, to, device_id } = q

  const stmt = device_id
    ? c.env.DB
        .prepare('SELECT * FROM events WHERE local_date >= ? AND local_date <= ? AND device_id = ? ORDER BY occurred_at')
        .bind(from, to, device_id)
    : c.env.DB
        .prepare('SELECT * FROM events WHERE local_date >= ? AND local_date <= ? ORDER BY occurred_at')
        .bind(from, to)

  const { results } = await stmt.all()
  return c.json(results)
}

export async function getDevices(c: Context<{ Bindings: Env }>) {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM devices ORDER BY last_seen DESC')
    .all()
  return c.json(results)
}
