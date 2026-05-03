import Foundation

// Coalesces raw 30s samples into contiguous ranges.
// Two consecutive samples belong to the same range when they share
// (bundle_id, ssid, lid_open) and their timestamps are at most 60s apart.
enum DayCoalescer {
    static func coalesce(samples: [Sample]) -> [PushRange] {
        guard !samples.isEmpty else { return [] }

        var ranges: [PushRange] = []
        var groupStart = samples[0]
        var lastSample = samples[0]
        var activeCount = samples[0].idleSecs <= 60 ? 1 : 0
        var idleCount   = samples[0].idleSecs <= 60 ? 0 : 1

        func flush() {
            ranges.append(PushRange(
                id: UUID().uuidString,
                startedAt: groupStart.occurredAt,
                endedAt: lastSample.occurredAt,
                bundleId: groupStart.bundleId,
                appName: groupStart.appName,
                ssid: groupStart.ssid,
                lidOpen: groupStart.lidOpen,
                activeCount: activeCount,
                idleCount: idleCount
            ))
        }

        for sample in samples.dropFirst() {
            let gapMs = sample.occurredAt - lastSample.occurredAt
            let sameGroup = sample.bundleId == lastSample.bundleId
                && sample.ssid == lastSample.ssid
                && sample.lidOpen == lastSample.lidOpen
                && gapMs <= 60_000

            if sameGroup {
                if sample.idleSecs <= 60 { activeCount += 1 } else { idleCount += 1 }
            } else {
                flush()
                groupStart = sample
                activeCount = sample.idleSecs <= 60 ? 1 : 0
                idleCount   = sample.idleSecs <= 60 ? 0 : 1
            }
            lastSample = sample
        }
        flush()
        return ranges
    }
}
