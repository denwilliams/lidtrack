import XCTest
@testable import LidTracker

final class DayCoalescerTests: XCTestCase {

    func testEmptySamplesProducesNoRanges() {
        XCTAssertEqual(DayCoalescer.coalesce(samples: []).count, 0)
    }

    func testConsecutiveSamplesWithSameContextMerge() {
        let base: Int64 = 1_000_000
        let samples = (0..<5).map { i in
            Sample(id: "\(i)", occurredAt: base + Int64(i) * 30_000,
                   localDate: "2026-01-01", bundleId: "com.apple.Safari",
                   appName: "Safari", ssid: "Home", idleSecs: 0, lidOpen: true)
        }
        let ranges = DayCoalescer.coalesce(samples: samples)
        XCTAssertEqual(ranges.count, 1)
        XCTAssertEqual(ranges[0].activeCount, 5)
        XCTAssertEqual(ranges[0].idleCount, 0)
    }

    func testAppChangeSplitsRange() {
        let base: Int64 = 1_000_000
        let s1 = Sample(id: "1", occurredAt: base,          localDate: "2026-01-01",
                        bundleId: "com.apple.Safari", appName: "Safari",
                        ssid: "Home", idleSecs: 0, lidOpen: true)
        let s2 = Sample(id: "2", occurredAt: base + 30_000, localDate: "2026-01-01",
                        bundleId: "com.apple.Xcode",  appName: "Xcode",
                        ssid: "Home", idleSecs: 0, lidOpen: true)
        let ranges = DayCoalescer.coalesce(samples: [s1, s2])
        XCTAssertEqual(ranges.count, 2)
    }

    func testGapLargerThan60sSplitsRange() {
        let base: Int64 = 1_000_000
        let s1 = Sample(id: "1", occurredAt: base,           localDate: "2026-01-01",
                        bundleId: "com.apple.Safari", appName: "Safari",
                        ssid: "Home", idleSecs: 0, lidOpen: true)
        let s2 = Sample(id: "2", occurredAt: base + 61_000,  localDate: "2026-01-01",
                        bundleId: "com.apple.Safari", appName: "Safari",
                        ssid: "Home", idleSecs: 0, lidOpen: true)
        let ranges = DayCoalescer.coalesce(samples: [s1, s2])
        XCTAssertEqual(ranges.count, 2)
    }

    func testIdleSamplesCountedCorrectly() {
        let base: Int64 = 1_000_000
        let samples = [
            Sample(id: "1", occurredAt: base,          localDate: "2026-01-01",
                   bundleId: nil, appName: nil, ssid: nil, idleSecs: 30,  lidOpen: true),
            Sample(id: "2", occurredAt: base + 30_000, localDate: "2026-01-01",
                   bundleId: nil, appName: nil, ssid: nil, idleSecs: 120, lidOpen: true),
        ]
        let ranges = DayCoalescer.coalesce(samples: samples)
        XCTAssertEqual(ranges[0].activeCount, 1)
        XCTAssertEqual(ranges[0].idleCount, 1)
    }
}
