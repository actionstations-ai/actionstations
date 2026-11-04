import XCTest
@testable import Player

final class PinTests: XCTestCase {
    func testSha256OfKnownInput() {
        let hash = Pin.sha256(of: Data("abc".utf8))
        XCTAssertEqual(Pin.fingerprint(hash),
                       "BA:78:16:BF:8F:01:CF:EA:41:41:40:DE:5D:AE:22:23:B0:03:61:A3:96:17:7A:9C:B4:10:FF:61:F2:00:15:AD")
    }

    func testPinComparisonAcceptsOnlyTheSameCertificate() {
        let der = Data("certificate".utf8)
        let pin = Pin.sha256(of: der)
        XCTAssertTrue(Pin.matches(certificateDER: der, pin: pin))
        XCTAssertFalse(Pin.matches(certificateDER: Data("other".utf8), pin: pin))
    }

    func testDecodeRoundTripsBase64url() {
        let bytes = Data((0..<32).map { UInt8(truncatingIfNeeded: $0 * 8 + 1) })
        let text = bytes.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        XCTAssertEqual(text.count, 43)
        XCTAssertEqual(Pin.decode(text), bytes)
    }

    func testDecodeRejectsWrongLengthAndBadCharacters() {
        XCTAssertNil(Pin.decode("short"))
        XCTAssertNil(Pin.decode(String(repeating: "!", count: 43)))
    }

    func testFingerprintIsUppercaseColonPairs() {
        XCTAssertEqual(Pin.fingerprint(Data([0x01, 0xAB, 0xFF])), "01:AB:FF")
    }
}
