import AppKit
import SwiftUI
import ServiceManagement

@MainActor
final class AppController: ObservableObject {
    @Published private(set) var isLidOpen = true
    @Published private(set) var currentSSID: String?
    @Published private(set) var todayActiveMinutes: Int = 0
    @Published private(set) var lastAppName: String?
    @Published var isConfigured: Bool

    let db: Database
    let syncManager: SyncManager

    private let lidCollector  = LidCollector()
    private let wifiCollector = WiFiCollector()
    private let appSampler    = AppSampler()
    private var midnightTimer: Timer?

    init() {
        let database = (try? Database()) ?? { fatalError("Failed to open database") }()
        db = database
        syncManager = SyncManager(db: database)
        isConfigured = KeychainStore.load() != nil

        setupCollectors()
        scheduleMidnightTimer()
        registerLoginItem()

        Task { await syncManager.syncIfNeeded() }
    }

    private func setupCollectors() {
        lidCollector.onLidOpen = { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                self.isLidOpen = true
                self.recordEvent(.lidOpen, payload: [:])
                await self.syncManager.syncIfNeeded()
            }
        }
        lidCollector.onLidClose = { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                self.isLidOpen = false
                self.recordEvent(.lidClose, payload: [:])
            }
        }

        wifiCollector.onSSIDChange = { [weak self] ssid in
            guard let self else { return }
            Task { @MainActor in
                self.currentSSID = ssid
                self.recordEvent(.wifiChange, payload: ssid.map { ["ssid": $0] } ?? [:])
            }
        }

        appSampler.onSample = { [weak self] bundleId, appName, idleSecs in
            guard let self else { return }
            Task { @MainActor in
                let sample = Sample(
                    id: UUID().uuidString,
                    occurredAt: nowMs(),
                    localDate: localDateString(),
                    bundleId: bundleId,
                    appName: appName,
                    ssid: self.wifiCollector.currentSSID,
                    idleSecs: idleSecs,
                    lidOpen: self.lidCollector.isOpen
                )
                self.db.insertSample(sample)
                let stats = self.db.todayStats()
                self.todayActiveMinutes = stats.activeMinutes
                self.lastAppName = appName ?? bundleId
            }
        }

        lidCollector.start()
        wifiCollector.start()
        appSampler.start()

        currentSSID = wifiCollector.currentSSID
    }

    private func recordEvent(_ type: LidTrackerEvent.EventType, payload: [String: String]) {
        let event = LidTrackerEvent(
            id: UUID().uuidString,
            type: type,
            occurredAt: nowMs(),
            localDate: localDateString(),
            payload: payload
        )
        db.insertEvent(event)
    }

    private func scheduleMidnightTimer() {
        var components = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        components.day = (components.day ?? 0) + 1
        components.hour = 0; components.minute = 0; components.second = 5
        guard let next = Calendar.current.date(from: components) else { return }
        let interval = next.timeIntervalSinceNow
        midnightTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.syncManager.syncIfNeeded()
                self?.scheduleMidnightTimer()
            }
        }
    }

    private func registerLoginItem() {
        try? SMAppService.mainApp.register()
    }
}
