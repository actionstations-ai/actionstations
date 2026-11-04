import XCTest
@testable import Player

private struct Vector: Decodable {
    let name: String
    let url: String
    let appAccepts: Bool
    let pin: String?
    let host: String?
}

private struct Fixture: Decodable { let vectors: [Vector] }

final class InviteTests: XCTestCase {
    private func vectors() throws -> [Vector] {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "invites", withExtension: "json"))
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url)).vectors
    }

    func testSharedVectorsAreLoaded() throws {
        XCTAssertGreaterThan(try vectors().count, 15)
    }

    func testAppAcceptsExactlyWhatTheSharedVectorsSay() throws {
        for vector in try vectors() {
            let accepted = (try? Invite.parse(vector.url).get()) != nil
            XCTAssertEqual(accepted, vector.appAccepts, vector.name)
        }
    }

    func testPinIsExtractedAsColonHex() throws {
        for vector in try vectors() where vector.appAccepts {
            let invite = try Invite.parse(vector.url).get()
            XCTAssertEqual(invite.pin.map { Pin.fingerprint($0) }, vector.pin, vector.name)
        }
    }

    func testHostMatchesTheSharedVectors() throws {
        for vector in try vectors() where vector.appAccepts {
            XCTAssertEqual(try Invite.parse(vector.url).get().host, vector.host, vector.name)
        }
    }

    func testRoleHintIsParsed() throws {
        let vector = try XCTUnwrap(vectors().first { $0.name == "LAN link with role hint and pin" })
        XCTAssertEqual(try Invite.parse(vector.url).get().roleHint, "ops-director")
    }

    func testRefusalMessageIsTheSpecText() {
        guard case .failure(let error) = Invite.parse("hello") else { return XCTFail("accepted") }
        XCTAssertEqual(error.message, "This is not an Action Stations session link.")
    }

    func testSurroundingWhitespaceIsIgnored() throws {
        let vector = try XCTUnwrap(vectors().first { $0.name == "relay link, no pin" })
        XCTAssertNoThrow(try Invite.parse("  \(vector.url)\n").get())
    }

    func testPrivateHostRanges() {
        for host in ["10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.0.9", "169.254.1.1", "127.0.0.1", "localhost", "printer.local", "::1"] {
            XCTAssertTrue(Invite.isPrivateHost(host), host)
        }
        for host in ["172.15.0.1", "172.32.0.1", "8.8.8.8", "example.org", "192.169.0.1", "10.0.0"] {
            XCTAssertFalse(Invite.isPrivateHost(host), host)
        }
    }
}
