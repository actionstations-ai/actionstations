import WebKit

#if DEBUG
extension WebCoordinator {
    /// DEBUG only: `-seat "Communications Lead"` picks that seat and joins, for simulator checks without a tap tool.
    func debugAutoSeat(_ webView: WKWebView) {
        let args = ProcessInfo.processInfo.arguments
        guard let flag = args.firstIndex(of: "-seat"), flag + 1 < args.count else { return }
        let name = args[flag + 1].replacingOccurrences(of: "'", with: "")
        let js = """
        (function(){var l=[...document.querySelectorAll('label,[role=radio],li')].find(e=>e.textContent.includes('\(name)'));
        if(!l)return 'no seat';(l.querySelector('input')||l).click();
        setTimeout(function(){var b=[...document.querySelectorAll('button')].reverse().find(b=>/join|take|seat|enter/i.test(b.textContent)&&!b.disabled);if(b)b.click();},600);return 'ok';})()
        """
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { webView.evaluateJavaScript(js) }
    }
}
#endif
