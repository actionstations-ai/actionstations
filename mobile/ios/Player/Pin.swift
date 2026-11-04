import CryptoKit
import Foundation

/// Certificate pin helpers (spec 0446 FR-2). A pin is the SHA-256 of the leaf certificate's DER.
enum Pin {
    static let length = 32

    static func sha256(of der: Data) -> Data {
        Data(SHA256.hash(data: der))
    }

    /// Decodes the 43-character base64url form; nil unless it is exactly 32 bytes.
    static func decode(_ text: String) -> Data? {
        guard text.count == 43 else { return nil }
        var base64 = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64 += "="
        guard let data = Data(base64Encoded: base64), data.count == length else { return nil }
        return data
    }

    /// True when the certificate's hash equals the pin.
    static func matches(certificateDER der: Data, pin: Data) -> Bool {
        sha256(of: der) == pin
    }

    /// `AA:BB:…` uppercase hex pairs, the form the Facilitate page shows.
    static func fingerprint(_ hash: Data) -> String {
        hash.map { String(format: "%02X", $0) }.joined(separator: ":")
    }

    static func fingerprint(certificateDER der: Data) -> String {
        fingerprint(sha256(of: der))
    }
}
