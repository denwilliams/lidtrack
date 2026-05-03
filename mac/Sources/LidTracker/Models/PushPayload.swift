import Foundation

struct PushRange: Encodable {
    let id: String
    let startedAt: Int64
    let endedAt: Int64
    let bundleId: String?
    let appName: String?
    let ssid: String?
    let lidOpen: Bool
    let activeCount: Int
    let idleCount: Int

    enum CodingKeys: String, CodingKey {
        case id
        case startedAt   = "started_at"
        case endedAt     = "ended_at"
        case bundleId    = "bundle_id"
        case appName     = "app_name"
        case ssid
        case lidOpen     = "lid_open"
        case activeCount = "active_count"
        case idleCount   = "idle_count"
    }
}

struct PushEvent: Encodable {
    let id: String
    let type: String
    let occurredAt: Int64
    let payload: [String: String]

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case occurredAt = "occurred_at"
        case payload
    }
}

struct DayPayload: Encodable {
    let deviceId: String
    let deviceName: String
    let tz: String
    let localDate: String
    let ranges: [PushRange]
    let events: [PushEvent]

    enum CodingKeys: String, CodingKey {
        case deviceId   = "device_id"
        case deviceName = "device_name"
        case tz
        case localDate  = "local_date"
        case ranges
        case events
    }
}
