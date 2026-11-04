import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the bundled practice page at asdemo://demo/… from the `Demo` folder only.
final class DemoSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL

    init(root: URL? = Bundle.main.url(forResource: "Demo", withExtension: nil)) {
        self.root = (root ?? URL(fileURLWithPath: "/nonexistent")).standardizedFileURL
    }

    /// Resolves a request path inside the demo folder; nil for anything that escapes it.
    func fileURL(forPath path: String) -> URL? {
        let relative = path.removingPercentEncoding ?? path
        let trimmed = relative.hasPrefix("/") ? String(relative.dropFirst()) : relative
        let candidate = root.appendingPathComponent(trimmed.isEmpty ? "index.html" : trimmed).standardizedFileURL
        return candidate.path.hasPrefix(root.path + "/") ? candidate : nil
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, let file = fileURL(forPath: url.path),
              let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let type = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": type, "Content-Length": "\(data.count)"])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
