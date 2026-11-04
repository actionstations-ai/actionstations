package ai.actionstations.player

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.EditText
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.app.AlertDialog
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

/** Where a session is joined: Scan the code, Paste a link, or Share a link to the app; plus About. */
class LauncherActivity : ComponentActivity() {

    private val scanner = registerForActivityResult(ScanContract()) { result ->
        result.contents?.let { openInvite(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The launcher follows the system again: only the player view keeps the screen on.
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_launcher)
        applySystemBarInsets(findViewById(R.id.launcher_root))

        findViewById<View>(R.id.button_scan).setOnClickListener { scanCode() }
        findViewById<View>(R.id.button_paste).setOnClickListener { showPasteDialog() }
        findViewById<View>(R.id.button_demo).setOnClickListener {
            startActivity(Intent(this, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_DEMO, true))
        }
        findViewById<View>(R.id.button_about).setOnClickListener { showAbout() }

        if (savedInstanceState == null) handleShare(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    private fun handleShare(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return
        val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
        intent.removeExtra(Intent.EXTRA_TEXT) // the invite is never kept on the intent
        openInvite(text)
    }

    private fun scanCode() {
        val options = ScanOptions()
            .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            .setPrompt(getString(R.string.scan_prompt))
            .setBeepEnabled(false)
            .setOrientationLocked(false)
        scanner.launch(options)
    }

    private fun showPasteDialog() {
        val field = EditText(this).apply {
            hint = getString(R.string.paste_hint)
            contentDescription = getString(R.string.paste_hint)
            minHeight = (48 * resources.displayMetrics.density).toInt()
            setSingleLine(false)
            minLines = 2
            maxLines = 4
        }
        val container = android.widget.FrameLayout(this).apply {
            val pad = (20 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad / 2, pad, 0)
            addView(field, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle(R.string.paste_title)
            .setView(container)
            .setPositiveButton(R.string.paste_open, null)
            .setNegativeButton(R.string.cancel, null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                if (Invite.parse(field.text.toString()) == null) {
                    field.error = getString(R.string.not_a_session_link)
                } else {
                    val text = field.text.toString()
                    field.setText("")
                    dialog.dismiss()
                    openInvite(text)
                }
            }
        }
        dialog.show()
    }

    private fun showAbout() {
        AlertDialog.Builder(this)
            .setTitle(R.string.about_title)
            .setMessage(getString(R.string.about_body, BuildConfig.VERSION_NAME))
            .setPositiveButton(R.string.close, null)
            .show()
    }

    private fun openInvite(text: String) {
        val invite = Invite.parse(text)
        if (invite == null) {
            Toast.makeText(this, R.string.not_a_session_link, Toast.LENGTH_LONG).show()
            return
        }
        SessionHolder.current = invite
        startActivity(Intent(this, PlayerActivity::class.java))
    }
}

/** Pads [root] by the system bars so content is not drawn under them (edge-to-edge on Android 15+). */
fun ComponentActivity.applySystemBarInsets(root: View) {
    ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
        insets
    }
}

/** The invite in use, in memory only (never an intent extra, a preference or a file). */
object SessionHolder {
    @Volatile
    var current: Invite? = null
}
