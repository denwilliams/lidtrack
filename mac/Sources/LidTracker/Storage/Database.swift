import Foundation
import SQLite

// All database operations run on a private serial queue.
final class Database {
    private let db: Connection
    private let queue = DispatchQueue(label: "net.denwilliams.lidtracker.db")

    // MARK: Table/column definitions

    private let samplesTable   = Table("samples")
    private let eventsTable    = Table("events")
    private let syncedTable    = Table("synced_days")

    private let colId          = Expression<String>("id")
    private let colOccurredAt  = Expression<Int64>("occurred_at")
    private let colLocalDate   = Expression<String>("local_date")
    private let colBundleId    = Expression<String?>("bundle_id")
    private let colAppName     = Expression<String?>("app_name")
    private let colSsid        = Expression<String?>("ssid")
    private let colIdleSecs    = Expression<Int>("idle_secs")
    private let colLidOpen     = Expression<Bool>("lid_open")
    private let colType        = Expression<String>("type")
    private let colPayload     = Expression<String>("payload")
    private let colSyncedAt    = Expression<Int64>("synced_at")

    init() throws {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("LidTracker", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        db = try Connection(dir.appendingPathComponent("events.db").path)
        try migrate()
    }

    private func migrate() throws {
        try db.run(samplesTable.create(ifNotExists: true) { t in
            t.column(colId, primaryKey: true)
            t.column(colOccurredAt)
            t.column(colLocalDate)
            t.column(colBundleId)
            t.column(colAppName)
            t.column(colSsid)
            t.column(colIdleSecs)
            t.column(colLidOpen)
        })

        try db.run(eventsTable.create(ifNotExists: true) { t in
            t.column(colId, primaryKey: true)
            t.column(colType)
            t.column(colOccurredAt)
            t.column(colLocalDate)
            t.column(colPayload)
        })

        try db.run(syncedTable.create(ifNotExists: true) { t in
            t.column(colLocalDate, primaryKey: true)
            t.column(colSyncedAt)
        })
    }

    // MARK: Writes

    func insertSample(_ s: Sample) {
        queue.async { [self] in
            let insert = samplesTable.insert(or: .ignore,
                colId        <- s.id,
                colOccurredAt <- s.occurredAt,
                colLocalDate <- s.localDate,
                colBundleId  <- s.bundleId,
                colAppName   <- s.appName,
                colSsid      <- s.ssid,
                colIdleSecs  <- s.idleSecs,
                colLidOpen   <- s.lidOpen
            )
            _ = try? db.run(insert)
        }
    }

    func insertEvent(_ e: LidTrackerEvent) {
        queue.async { [self] in
            let payloadJson = (try? JSONEncoder().encode(e.payload)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
            let insert = eventsTable.insert(or: .ignore,
                colId        <- e.id,
                colType      <- e.type.rawValue,
                colOccurredAt <- e.occurredAt,
                colLocalDate <- e.localDate,
                colPayload   <- payloadJson
            )
            _ = try? db.run(insert)
        }
    }

    func markSynced(localDate: String) {
        queue.async { [self] in
            let upsert = syncedTable.insert(or: .replace,
                colLocalDate <- localDate,
                colSyncedAt  <- Int64(Date().timeIntervalSince1970 * 1000)
            )
            _ = try? db.run(upsert)
        }
    }

    func pruneSyncedDay(_ localDate: String) {
        queue.async { [self] in
            _ = try? db.run(samplesTable.filter(colLocalDate == localDate).delete())
            _ = try? db.run(eventsTable.filter(colLocalDate == localDate).delete())
        }
    }

    // MARK: Reads

    func unsyncedDates(before today: String) -> [String] {
        queue.sync {
            let synced = (try? db.prepare(syncedTable.select(colLocalDate)).map { $0[colLocalDate] }).flatMap { Set($0) } ?? []
            let all = (try? db.prepare(samplesTable.select(colLocalDate).filter(colLocalDate < today).group(colLocalDate)).map { $0[colLocalDate] }) ?? []
            return all.filter { !synced.contains($0) }
        }
    }

    func samples(for localDate: String) -> [Sample] {
        queue.sync {
            let rows = try? db.prepare(samplesTable.filter(colLocalDate == localDate).order(colOccurredAt))
            return rows?.map { row in
                Sample(
                    id: row[colId],
                    occurredAt: row[colOccurredAt],
                    localDate: row[colLocalDate],
                    bundleId: row[colBundleId],
                    appName: row[colAppName],
                    ssid: row[colSsid],
                    idleSecs: row[colIdleSecs],
                    lidOpen: row[colLidOpen]
                )
            } ?? []
        }
    }

    func events(for localDate: String) -> [LidTrackerEvent] {
        queue.sync {
            let rows = try? db.prepare(eventsTable.filter(colLocalDate == localDate).order(colOccurredAt))
            return rows?.compactMap { row -> LidTrackerEvent? in
                guard let type = LidTrackerEvent.EventType(rawValue: row[colType]) else { return nil }
                let payloadData = row[colPayload].data(using: .utf8) ?? Data()
                let payload = (try? JSONDecoder().decode([String: String].self, from: payloadData)) ?? [:]
                return LidTrackerEvent(
                    id: row[colId],
                    type: type,
                    occurredAt: row[colOccurredAt],
                    localDate: row[colLocalDate],
                    payload: payload
                )
            } ?? []
        }
    }

    func todayStats() -> (activeSessions: Int, activeMinutes: Int) {
        queue.sync {
            let today = localDateString()
            let rows = try? db.prepare(samplesTable.filter(colLocalDate == today && colLidOpen == true))
            let samples = rows?.map { $0[colIdleSecs] } ?? []
            let active = samples.filter { $0 <= 60 }
            return (activeSessions: samples.count, activeMinutes: active.count / 2)
        }
    }
}

func localDateString(from date: Date = Date()) -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.locale = Locale(identifier: "en_US_POSIX")
    return f.string(from: date)
}

func nowMs() -> Int64 {
    Int64(Date().timeIntervalSince1970 * 1000)
}
