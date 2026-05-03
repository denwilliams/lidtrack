import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Env, AccessIdentity } from './types'
import { postDays } from './routes/days'
import { getRanges, getEvents, getDevices } from './routes/ranges'

type Variables = { identity: AccessIdentity }

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use('*', cors({
  origin: (origin) => origin, // reflect origin — all requests are already Access-authenticated
  allowHeaders: ['CF-Access-Client-Id', 'CF-Access-Client-Secret', 'Content-Type'],
  credentials: true,
}))

// Verify Cloudflare Access JWT. By the time we run, Access has already
// authenticated the request — this is defence-in-depth against someone
// hitting a workers.dev URL directly (which is also disabled via wrangler.toml).
app.use('*', async (c, next) => {
  const token = c.req.header('Cf-Access-Jwt-Assertion')
  if (!token) return c.json({ error: 'unauthorized' }, 401)

  const jwks = createRemoteJWKSet(
    new URL(`https://${c.env.TEAM_DOMAIN}/cdn-cgi/access/certs`)
  )

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${c.env.TEAM_DOMAIN}`,
      audience: c.env.AUD_TAG,
    })
    c.set('identity', payload)
  } catch {
    return c.json({ error: 'unauthorized' }, 401)
  }

  await next()
})

app.post('/days', postDays)
app.get('/ranges', getRanges)
app.get('/events', getEvents)
app.get('/devices', getDevices)

export default app
