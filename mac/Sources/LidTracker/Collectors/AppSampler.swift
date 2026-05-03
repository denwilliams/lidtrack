import AppKit
import CoreGraphics
import Foundation

// Fires every 30 seconds. Captures foreground app + idle time.
final class AppSampler {
    var onSample: ((_ bundleId: String?, _ appName: String?, _ idleSecs: Int) -> Void)?

    private var timer: Timer?

    func start() {
        let t = Timer(timeInterval: 30, repeats: true) { [weak self] _ in self?.capture() }
        t.tolerance = 5
        RunLoop.main.add(t, forMode: .common)
        timer = t
        capture()
    }

    private func capture() {
        let app = NSWorkspace.shared.frontmostApplication
        let bundleId = app?.bundleIdentifier
        let appName = app?.localizedName

        let idleSecs = Int(CGEventSource.secondsSinceLastEventType(
            .combinedSessionState,
            eventType: CGEventType(rawValue: ~0)!
        ))

        onSample?(bundleId, appName, idleSecs)
    }
}
