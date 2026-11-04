import XCTest
@testable import Player

final class OriginPolicyTests: XCTestCase {
    private func policy(_ url: String) throws -> OriginPolicy {
        let fragment = String(repeating: "A", count: 220)
        return OriginPolicy(invite: try Invite.parse("\(url)/s/AbCdEfGhIjKlMnOpQrStUv#\(fragment)").get())
    }

    func testSessionOriginStaysInTheWebView() throws {
        let p = try policy("https://192.168.4.20:8485")
        XCTAssertTrue(p.stays(URL(string: "https://192.168.4.20:8485/assets/app.js")!))
        XCTAssertTrue(p.stays(URL(string: "about:blank")!))
    }

    func testOtherHostPortOrSchemeLeaves() throws {
        let p = try policy("https://192.168.4.20:8485")
        for other in ["https://example.org/", "https://192.168.4.20:9000/", "http://192.168.4.20:8485/", "https://192.168.4.21:8485/"] {
            XCTAssertFalse(p.stays(URL(string: other)!), other)
        }
    }

    func testDefaultPortsAreEqual() throws {
        let p = try policy("https://relay.actionstations.ai")
        XCTAssertTrue(p.stays(URL(string: "https://relay.actionstations.ai:443/x")!))
    }

    func testMediaCaptureOnlyForTheSessionOrigin() throws {
        let p = try policy("https://192.168.4.20:8485")
        XCTAssertTrue(p.isSessionOrigin(scheme: "https", host: "192.168.4.20", port: 8485))
        XCTAssertFalse(p.isSessionOrigin(scheme: "https", host: "evil.example", port: 8485))
    }

    func testOnlyWebLinksOpenExternally() {
        XCTAssertTrue(OriginPolicy.opensInSystemBrowser(URL(string: "https://example.org")!))
        XCTAssertFalse(OriginPolicy.opensInSystemBrowser(URL(string: "javascript:alert(1)")!))
        XCTAssertFalse(OriginPolicy.opensInSystemBrowser(URL(string: "file:///etc/passwd")!))
    }
}

final class DemoSchemeHandlerTests: XCTestCase {
    func testPathsStayInsideTheDemoFolder() {
        let handler = DemoSchemeHandler(root: URL(fileURLWithPath: "/tmp/demo-root"))
        XCTAssertEqual(handler.fileURL(forPath: "/assets/app.js")?.path, "/tmp/demo-root/assets/app.js")
        XCTAssertEqual(handler.fileURL(forPath: "/")?.path, "/tmp/demo-root/index.html")
        XCTAssertNil(handler.fileURL(forPath: "/../secret"))
        XCTAssertNil(handler.fileURL(forPath: "/%2e%2e/secret"))
        XCTAssertNil(handler.fileURL(forPath: "/assets/../../secret"))
    }

    func testDemoTargetHasNoPinAndItsOwnOrigin() {
        XCTAssertNil(PlayerTarget.demo.pin)
        XCTAssertTrue(PlayerTarget.demo.policy.stays(URL(string: "asdemo://demo/assets/x.js")!))
        XCTAssertFalse(PlayerTarget.demo.policy.stays(URL(string: "https://example.org")!))
    }
}
