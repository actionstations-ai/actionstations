package ai.actionstations.player

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts

/**
 * The player view (spec 0446 FR-3..FR-6): the session's player page full screen, pinned TLS, the
 * session origin only, a slim bar with the host, Leave and Reload.
 */
class PlayerActivity : ComponentActivity() {

    private var invite: Invite? = null
    private var demo = false
    private var assetLoader: WebViewAssetLoader? = null
    private var policy: OriginPolicy? = null
    private var webView: WebView? = null
    private lateinit var root: FrameLayout
    private var errorView: TextView? = null

    /** Fingerprints the player has compared and accepted in this view (unpinned invites only). */
    private val acceptedFingerprints = mutableSetOf<String>()
    private var certDialogShowing = false
    private var pendingPermissionRequest: PermissionRequest? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            finishPermissionRequest()
        }

    private val fileLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
            fileCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        demo = intent.getBooleanExtra(EXTRA_DEMO, false)
        val current = SessionHolder.current
        if (demo) {
            // The practice session runs from bundled assets: no invite, no pin, no network.
            assetLoader = WebViewAssetLoader.Builder()
                .setDomain(DEMO_HOST)
                .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
                .build()
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            title = getString(R.string.demo_title)
            root = FrameLayout(this)
            setContentView(root)
            applySystemBarInsets(root)
            buildWebView(null)
            onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = confirmLeave()
            })
            return
        }
        if (current == null) { // process was recreated: the invite is memory-only, so go back to the launcher
            finish()
            return
        }
        invite = current
        policy = OriginPolicy(current)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        title = current.host
        root = FrameLayout(this)
        setContentView(root)
        applySystemBarInsets(root)
        buildWebView(current)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = confirmLeave()
        })
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.player_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        R.id.action_leave -> { confirmLeave(); true }
        R.id.action_reload -> { reload(); true }
        else -> super.onOptionsItemSelected(item)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(current: Invite?) {
        val view = WebView(this)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            safeBrowsingEnabled = false // Safe Browsing would send visited URLs to Google
            setSupportMultipleWindows(false)
            setGeolocationEnabled(false)
        }
        view.contentDescription = getString(R.string.app_name)
        view.webViewClient = sessionClient()
        view.webChromeClient = sessionChrome()
        view.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        root.addView(view)
        webView = view
        view.loadUrl(current?.loadUrl ?: DEMO_URL)
    }

    private fun sessionClient() = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (demo) return !(request.url.scheme == "https" && request.url.host == DEMO_HOST)
            if (policy?.allows(url) == true) return false
            if (policy?.canOpenExternally(url) == true) {
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) { Log.e(TAG, "no_browser") }
            }
            return true
        }

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): android.webkit.WebResourceResponse? {
            val loader = assetLoader ?: return null
            // Demo mode: bundled assets or a blocked empty response, never the network.
            return loader.shouldInterceptRequest(request.url)
                ?: android.webkit.WebResourceResponse("text/plain", "utf-8", 404, "Not found", emptyMap(), java.io.ByteArrayInputStream(ByteArray(0)))
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            errorView?.let { root.removeView(it); errorView = null }
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            handleSslError(handler, error)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame && errorView == null) {
                Log.e(TAG, "load_failed:${error.errorCode}")
                showError(getString(R.string.load_failed))
            }
        }
    }

    private fun handleSslError(handler: SslErrorHandler, error: SslError) {
        val current = invite ?: return handler.cancel()
        val host = Uri.parse(error.url).host
        val der = try { error.certificate.x509Certificate?.encoded } catch (_: Exception) { null }
        if (der == null || policy?.sameHost(host) != true) return handler.cancel()
        val pin = current.pin
        when {
            pin != null && Pin.matches(der, pin) -> handler.proceed()
            pin != null -> { // a pin mismatch is a hard stop and is never overridable
                handler.cancel()
                showError(getString(R.string.pin_mismatch))
            }
            Pin.fingerprintOf(der) in acceptedFingerprints -> handler.proceed()
            else -> askPlayerToCompare(handler, Pin.fingerprintOf(der))
        }
    }

    private fun askPlayerToCompare(handler: SslErrorHandler, fingerprint: String) {
        if (certDialogShowing) return handler.cancel()
        certDialogShowing = true
        AlertDialog.Builder(this)
            .setTitle(R.string.cert_title)
            .setMessage(getString(R.string.cert_body, fingerprint))
            .setCancelable(false)
            .setPositiveButton(R.string.cert_continue) { _, _ ->
                certDialogShowing = false
                acceptedFingerprints.add(fingerprint)
                handler.proceed()
            }
            .setNegativeButton(R.string.cancel) { _, _ ->
                certDialogShowing = false
                handler.cancel()
                leave()
            }
            .show()
    }

    private fun sessionChrome() = object : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread { handlePermissionRequest(request) }
        }

        override fun onShowFileChooser(
            view: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams,
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            return try {
                fileLauncher.launch(params.createIntent())
                true
            } catch (_: Exception) {
                fileCallback = null
                false
            }
        }
    }

    private fun handlePermissionRequest(request: PermissionRequest) {
        val originUri = request.origin
        val origin = Origin.of(originUri.scheme.orEmpty(), originUri.host.orEmpty(), originUri.port.let {
            if (it != -1) it else if (originUri.scheme == "https") 443 else 80
        })
        if (demo || origin != invite?.origin) return request.deny()
        val needed = request.resources.mapNotNull {
            when (it) {
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
                else -> null
            }
        }
        if (needed.isEmpty()) return request.deny()
        val missing = needed.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) return grantFor(request)
        pendingPermissionRequest?.deny()
        pendingPermissionRequest = request
        permissionLauncher.launch(missing.toTypedArray())
    }

    private fun finishPermissionRequest() {
        val request = pendingPermissionRequest ?: return
        pendingPermissionRequest = null
        grantFor(request)
    }

    /** Grants only the resources whose runtime permission is held; denial leaves the rest of the page working. */
    private fun grantFor(request: PermissionRequest) {
        val allowed = request.resources.filter {
            when (it) {
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> has(Manifest.permission.RECORD_AUDIO)
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> has(Manifest.permission.CAMERA)
                else -> false
            }
        }
        if (allowed.isEmpty()) request.deny() else request.grant(allowed.toTypedArray())
    }

    private fun has(permission: String) = checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun reload() {
        val view = webView ?: return
        errorView?.let { root.removeView(it); errorView = null }
        if (view.url == null) view.loadUrl(invite?.loadUrl ?: DEMO_URL) else view.reload()
    }

    private fun showError(message: String) {
        errorView?.let { root.removeView(it) }
        val text = TextView(this).apply {
            this.text = message
            textSize = 18f
            setTextColor(getColor(R.color.text))
            setBackgroundColor(getColor(R.color.bg))
            setPadding(48, 48, 48, 48)
            gravity = android.view.Gravity.CENTER
            contentDescription = message
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_ASSERTIVE
        }
        errorView = text
        root.addView(text, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    }

    private fun confirmLeave() {
        AlertDialog.Builder(this)
            .setTitle(R.string.leave_title)
            .setMessage(R.string.leave_body)
            .setPositiveButton(R.string.leave_confirm) { _, _ -> leave() }
            .setNegativeButton(R.string.stay, null)
            .show()
    }

    /** Drops the invite, releases the web view and returns to the launcher. */
    private fun leave() {
        SessionHolder.current = null
        invite = null
        destroyWebView()
        finish()
    }

    private fun destroyWebView() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        pendingPermissionRequest?.deny()
        pendingPermissionRequest = null
        webView?.let {
            root.removeView(it)
            it.stopLoading()
            it.loadUrl("about:blank")
            it.destroy()
        }
        webView = null
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
    }

    override fun onPause() {
        webView?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        destroyWebView()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_DEMO = "demo"
        const val DEMO_HOST = "appassets.androidplatform.net"
        const val DEMO_URL = "https://$DEMO_HOST/assets/demo/index.html"
        const val TAG = "ASPlayer" // log lines carry error codes only, never the invite
    }
}
