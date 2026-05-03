import Foundation

struct Sample {
    let id: String
    let occurredAt: Int64    // unix epoch ms
    let localDate: String    // YYYY-MM-DD in Mac's local TZ
    let bundleId: String?
    let appName: String?
    let ssid: String?
    let idleSecs: Int
    let lidOpen: Bool
}

struct LidTrackerEvent {
    let id: String
    let type: EventType
    let occurredAt: Int64
    let localDate: String
    let payload: [String: String]

    enum EventType: String {
        case lidOpen    = "lid_open"
        case lidClose   = "lid_close"
        case wifiChange = "wifi_change"
    }
}
