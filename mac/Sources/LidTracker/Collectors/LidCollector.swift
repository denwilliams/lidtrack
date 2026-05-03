import AppKit
import Foundation

final class LidCollector {
    var onLidOpen: (() -> Void)?
    var onLidClose: (() -> Void)?

    private(set) var isOpen: Bool = true

    func start() {
        NSWorkspace.shared.notificationCenter.addObserver(
            self,
            selector: #selector(systemWillSleep),
            name: NSWorkspace.willSleepNotification,
            object: nil
        )
        NSWorkspace.shared.notificationCenter.addObserver(
            self,
            selector: #selector(systemDidWake),
            name: NSWorkspace.didWakeNotification,
            object: nil
        )
    }

    @objc private func systemWillSleep() {
        isOpen = false
        onLidClose?()
    }

    @objc private func systemDidWake() {
        isOpen = true
        onLidOpen?()
    }
}
