import { useState, useEffect } from 'react'
import { format, subDays } from 'date-fns'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'
import { RangePicker } from './components/RangePicker'
import { HeadlineNumbers } from './components/HeadlineNumbers'
import { BreakdownChart } from './components/BreakdownChart'
import { useDevices, useRanges } from './hooks/useData'
import { rollupByApp, rollupBySSID, rollupByDevice } from './lib/rollups'
import type { DateRange } from './api/types'

function defaultRange(): DateRange {
  const y = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  return { from: format(subDays(new Date(), 7), 'yyyy-MM-dd'), to: y }
}

function Dashboard() {
  const [range, setRange] = useState<DateRange>(defaultRange)
  const [deviceId, setDeviceId] = useState<string | undefined>()
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    fetch('/cdn-cgi/access/get-identity', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { email?: string } | null) => setUserEmail(data?.email ?? null))
      .catch(() => {})
  }, [])

  const { data: devices = [] } = useDevices()
  const { data: ranges = [], isLoading, error } = useRanges(range, deviceId)

  const appData = rollupByApp(ranges).map(s => ({ label: s.name, ms: s.activeMs }))
  const ssidData = rollupBySSID(ranges).map(s => ({ label: s.ssid, ms: s.activeMs }))
  const deviceData = rollupByDevice(ranges).map(s => {
    const dev = devices.find(d => d.device_id === s.deviceId)
    return { label: dev?.name ?? s.deviceId, ms: s.activeMs }
  })

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">LidTracker</h1>
        {userEmail && <span className="text-xs text-gray-500">{userEmail}</span>}
        {devices.length > 0 && (
          <select
            value={deviceId ?? ''}
            onChange={e => setDeviceId(e.target.value || undefined)}
            className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-1.5 text-gray-200"
          >
            <option value="">All devices</option>
            {devices.map(d => (
              <option key={d.device_id} value={d.device_id}>{d.name}</option>
            ))}
          </select>
        )}
      </header>

      <RangePicker value={range} onChange={setRange} />

      {isLoading && <p className="text-gray-500 text-sm">Loading…</p>}
      {error && <p className="text-red-400 text-sm">Failed to load: {String(error)}</p>}

      {!isLoading && !error && (
        <>
          <HeadlineNumbers ranges={ranges} />

          <div className="grid gap-4 sm:grid-cols-2">
            <BreakdownChart title="By app" data={appData} />
            <BreakdownChart title="By network" data={ssidData} color="#10b981" />
          </div>

          {deviceData.length > 1 && (
            <BreakdownChart title="By device" data={deviceData} color="#f59e0b" />
          )}

          {ranges.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-8">
              No data for this period. Data syncs at midnight each day.
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default function App() {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ error, resetErrorBoundary }) => (
            <div className="p-8 text-center">
              <p className="text-red-400 mb-4">{String(error)}</p>
              <button onClick={resetErrorBoundary} className="text-indigo-400 underline text-sm">
                Retry
              </button>
            </div>
          )}
        >
          <Dashboard />
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}
