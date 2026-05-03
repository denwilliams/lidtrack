import CoreWLAN
import CoreLocation
import Foundation

// Reads the current SSID and fires callbacks on SSID change.
// Requires Location Services authorization (prompted by CLLocationManager).
final class WiFiCollector: NSObject {
    var onSSIDChange: ((String?) -> Void)?

    private(set) var currentSSID: String?
    private let client = CWWiFiClient.shared()
    private let locationManager = CLLocationManager()

    func start() {
        locationManager.delegate = self
        locationManager.requestWhenInUseAuthorization()

        client.delegate = self
        try? client.startMonitoringEvent(with: .ssidDidChange)
        currentSSID = client.interface()?.ssid()
    }
}

extension WiFiCollector: CWEventDelegate {
    func ssidDidChangeForWiFiInterface(withName _: String) {
        let new = client.interface()?.ssid()
        guard new != currentSSID else { return }
        currentSSID = new
        onSSIDChange?(new)
    }
}

extension WiFiCollector: CLLocationManagerDelegate {
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorized || manager.authorizationStatus == .authorizedAlways {
            currentSSID = client.interface()?.ssid()
        }
    }
}
