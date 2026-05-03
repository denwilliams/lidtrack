import { useQuery } from '@tanstack/react-query'
import { fetchDevices, fetchRanges, fetchEvents } from '../api/client'
import type { DateRange } from '../api/types'

export function useDevices() {
  return useQuery({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    staleTime: 5 * 60_000,
  })
}

export function useRanges(range: DateRange, deviceId?: string) {
  return useQuery({
    queryKey: ['ranges', range.from, range.to, deviceId],
    queryFn: () => fetchRanges(range.from, range.to, deviceId),
    staleTime: 60_000,
    enabled: !!range.from && !!range.to,
  })
}

export function useEvents(range: DateRange, deviceId?: string) {
  return useQuery({
    queryKey: ['events', range.from, range.to, deviceId],
    queryFn: () => fetchEvents(range.from, range.to, deviceId),
    staleTime: 60_000,
    enabled: !!range.from && !!range.to,
  })
}
