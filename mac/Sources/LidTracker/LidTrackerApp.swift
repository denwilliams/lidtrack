import SwiftUI
import ServiceManagement

@main
struct LidTrackerApp: App {
    @StateObject private var controller = AppController()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(controller: controller)
        } label: {
            Image(systemName: controller.isLidOpen ? "laptopcomputer" : "laptopcomputer.slash")
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(controller: controller)
        }
    }
}
