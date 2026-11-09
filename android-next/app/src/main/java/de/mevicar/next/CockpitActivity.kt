package de.mevicar.next

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * Uses the live MeviCar Next interface without changing MeviCar Classic.
 * The native player is reachable only from the official page main frame.
 */
class CockpitActivity : Activity() {
    private lateinit var web: WebView
    private val page = "https://eskiya771.github.io/mevicar-cockpit-demo/"
    private val allowedOrigin = "https://eskiya771.github.io"

    @Suppress("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            setContentView(TextView(this).apply {
                text = "Android System WebView aktualisieren: Sichere Native-Player-Schnittstelle fehlt."
                textSize = 18f
            })
            return
        }

        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = false
        web.settings.mediaPlaybackRequiresUserGesture = true
        web.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                // The cockpit runs only on its own HTTPS application path.
                return !url.startsWith(page)
            }
        }

        WebViewCompat.addWebMessageListener(
            web, "MeviNativePlayer", setOf(allowedOrigin)
        ) { view, message, sourceOrigin, isMainFrame, _ ->
            if (!isMainFrame || sourceOrigin.toString() != allowedOrigin ||
                view.url?.startsWith(page) != true) return@addWebMessageListener
            try {
                val payload = JSONObject(message.data ?: return@addWebMessageListener)
                if (payload.optString("action") != "play") return@addWebMessageListener
                val url = payload.optString("url")
                if (!StreamUrlPolicy.accepts(url)) return@addWebMessageListener
                val title = payload.optString("title").take(120)
                startActivity(
                    Intent(this, NativePlayerActivity::class.java)
                        .putExtra(NativePlayerActivity.EXTRA_URL, url)
                        .putExtra(NativePlayerActivity.EXTRA_TITLE, title)
                )
            } catch (_: Exception) { /* Reject malformed messages. */ }
        }
        setContentView(web)
        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(page)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::web.isInitialized) web.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Deprecated in Android framework")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack()
        else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
