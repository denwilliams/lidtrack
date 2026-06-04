import { useState, useEffect, useMemo } from 'react'
import { format, subDays } from 'date-fns'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'
import { RangePicker } from './components/RangePicker'
import { HeadlineNumbers } from './components/HeadlineNumbers'
import { BreakdownChart } from './components/BreakdownChart'
import { WeekHeatmap } from './components/WeekHeatmap'
import { ReportView } from './components/ReportView'
import { useDevices, useRanges } from './hooks/useData'
import { rollupByApp, rollupBySSID, rollupByDevice, computeDayBlocks } from './lib/rollups'
import type { DateRange } from './api/types'

type View = 'dashboard' | 'report'

function defaultRange(): DateRange {
  const y = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  return { from: format(subDays(new Date(), 7), 'yyyy-MM-dd'), to: y }
}

function Dashboard() {
  const [range, setRange] = useState<DateRange>(defaultRange)
  const [deviceId, setDeviceId] = useState<string | undefined>()
  const [ssidFilter, setSsidFilter] = useState<string | undefined>()
  const [view, setView] = useState<View>('dashboard')
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    fetch('/cdn-cgi/access/get-identity', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { email?: string } | null) => setUserEmail(data?.email ?? null))
      .catch(() => {})
  }, [])

  const { data: devices = [] } = useDevices()
  const { data: ranges = [], isLoading, error } = useRanges(range, deviceId)

  const allSsids = useMemo(
    () => [...new Set(ranges.map(r => r.ssid ?? 'Unknown'))].sort(),
    [ranges],
  )

  const filteredRanges = useMemo(
    () => ssidFilter ? ranges.filter(r => (r.ssid ?? 'Unknown') === ssidFilter) : ranges,
    [ranges, ssidFilter],
  )

  const appData = rollupByApp(filteredRanges).map(s => ({ label: s.name, ms: s.activeMs }))
  const ssidData = rollupBySSID(filteredRanges).map(s => ({ label: s.ssid, ms: s.activeMs }))
  const deviceData = rollupByDevice(filteredRanges).map(s => {
    const dev = devices.find(d => d.device_id === s.deviceId)
    return { label: dev?.name ?? s.deviceId, ms: s.activeMs }
  })
  const reportDays = useMemo(() => computeDayBlocks(filteredRanges), [filteredRanges])

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">LidTracker</h1>
        {userEmail && <span className="text-xs text-gray-500">{userEmail}</span>}
        <div className="flex items-center gap-2">
          {allSsids.length > 1 && (
            <select
              value={ssidFilter ?? ''}
              onChange={e => setSsidFilter(e.target.value || undefined)}
              className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-1.5 text-gray-200"
            >
              <option value="">All networks</option>
              {allSsids.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
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
        </div>
      </header>

      <RangePicker value={range} onChange={setRange} />

      <div className="flex gap-1 bg-gray-800/60 rounded-lg p-1 w-fit">
        {(['dashboard', 'report'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === v
                ? 'bg-gray-700 text-gray-100'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-gray-500 text-sm">Loading…</p>}
      {error && <p className="text-red-400 text-sm">Failed to load: {String(error)}</p>}

      {!isLoading && !error && view === 'dashboard' && (
        <>
          <HeadlineNumbers ranges={filteredRanges} />

          <WeekHeatmap ranges={filteredRanges} dateRange={range} />

          <div className="grid gap-4 sm:grid-cols-2">
            <BreakdownChart title="By app" data={appData} />
            <BreakdownChart title="By network" data={ssidData} color="#10b981" />
          </div>

          {deviceData.length > 1 && (
            <BreakdownChart title="By device" data={deviceData} color="#f59e0b" />
          )}

          {filteredRanges.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-8">
              No data for this period. Data syncs at midnight each day.
            </p>
          )}
        </>
      )}

      {!isLoading && !error && view === 'report' && (
        <ReportView days={reportDays} allSsids={allSsids} ssidFilter={ssidFilter} />
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
