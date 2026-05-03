import SwiftUI

struct MenuBarView: View {
    @ObservedObject var controller: AppController
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().padding(.vertical, 4)
            statsRow
            Divider().padding(.vertical, 4)
            syncStatus
            Divider().padding(.vertical, 4)
            footer
        }
        .padding(12)
        .frame(width: 260)
    }

    private var header: some View {
        HStack {
            Image(systemName: controller.isLidOpen ? "laptopcomputer" : "laptopcomputer.slash")
                .foregroundStyle(controller.isLidOpen ? .green : .secondary)
            Text("LidTracker")
                .font(.headline)
            Spacer()
            if let ssid = controller.currentSSID {
                Text(ssid)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var statsRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label("\(controller.todayActiveMinutes)m active today", systemImage: "clock")
                .font(.subheadline)
            if let app = controller.lastAppName {
                Label(app, systemImage: "app.fill")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var syncStatus: some View {
        HStack(spacing: 6) {
            if controller.syncManager.isSyncing {
                ProgressView().scaleEffect(0.6).frame(width: 14, height: 14)
                Text("Syncing…").font(.caption).foregroundStyle(.secondary)
            } else if let err = controller.syncManager.lastError {
                Image(systemName: "exclamationmark.triangle").foregroundStyle(.orange).font(.caption)
                Text(err).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            } else if let date = controller.syncManager.lastSyncDate {
                Image(systemName: "checkmark.circle").foregroundStyle(.green).font(.caption)
                Text("Synced \(date.formatted(.relative(presentation: .named)))").font(.caption).foregroundStyle(.secondary)
            } else {
                Image(systemName: "icloud.slash").foregroundStyle(.secondary).font(.caption)
                Text(controller.isConfigured ? "Not yet synced" : "Not configured").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var footer: some View {
        HStack {
            Button("Settings…") {
                NSApp.activate(ignoringOtherApps: true)
                openSettings()
            }
                .buttonStyle(.plain)
                .font(.subheadline)
            Spacer()
            Button("Quit") { NSApplication.shared.terminate(nil) }
                .buttonStyle(.plain)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}
