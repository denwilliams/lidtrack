import Foundation

@MainActor
final class SyncManager: ObservableObject {
    @Published private(set) var lastSyncDate: Date?
    @Published private(set) var isSyncing = false
    @Published private(set) var lastError: String?

    private let db: Database

    init(db: Database) {
        self.db = db
    }

    // Call on: app launch, midnight timer, didWakeNotification.
    func syncIfNeeded() async {
        guard let creds = KeychainStore.load() else { return }
        guard !isSyncing else { return }

        let today = localDateString()
        let pending = db.unsyncedDates(before: today)
        guard !pending.isEmpty else { return }

        isSyncing = true
        lastError = nil

        let client = APIClient(creds: creds)
        let deviceId = creds.clientId  // used only for payload; server overrides via JWT

        for date in pending.sorted() {
            let samples = db.samples(for: date)
            let events  = db.events(for: date)

            let ranges = DayCoalescer.coalesce(samples: samples)
            let pushEvents = events.map { e in
                PushEvent(id: e.id, type: e.type.rawValue, occurredAt: e.occurredAt, payload: e.payload)
            }

            let payload = DayPayload(
                deviceId:   deviceId,
                deviceName: Host.current().localizedName ?? "Mac",
                tz:         TimeZone.current.identifier,
                localDate:  date,
                ranges:     ranges,
                events:     pushEvents
            )

            do {
                _ = try await client.pushDay(payload)
                db.markSynced(localDate: date)
                db.pruneSyncedDay(date)
            } catch {
                lastError = error.localizedDescription
                break
            }
        }

        isSyncing = false
        if lastError == nil { lastSyncDate = Date() }
    }
}
