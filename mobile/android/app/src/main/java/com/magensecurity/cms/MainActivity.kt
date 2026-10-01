package com.magensecurity.cms

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * Loads the live CMS website in a native WebView, mirroring the desktop
 * Electron wrapper: same live app, no offline support, external links open
 * in the system browser instead of inside the app.
 *
 * Push notification additions (2026-10-01):
 * - Requests POST_NOTIFICATIONS permission on Android 13+ at startup.
 * - Injects a "MagenBridge" JavaScript object into every page so the React
 *   app can call window.MagenBridge.getFcmToken() to retrieve the device's
 *   FCM token and register it with the backend.
 */
class MainActivity : AppCompatActivity() {

    // Same live URL the desktop app loads. Unlike desktop's config.json
    // (which can be edited without a rebuild), changing this on mobile
    // requires a new build -- acceptable for now since the URL is stable.
    private val appUrl = "https://company-management-system-chi.vercel.app"
    private val appHost = Uri.parse(appUrl).host

    private lateinit var webView: WebView
    private lateinit var splashOverlay: View

    // ------------------------------------------------------------------ //
    // Android 13+ notification permission
    // ------------------------------------------------------------------ //

    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            // Granted or denied — no further action needed here. If denied
            // the app still works; the user just won't get push notifications
            // until they grant the permission from system Settings.
        }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            when {
                ContextCompat.checkSelfPermission(
                    this, Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED -> {
                    // Already granted — nothing to do.
                }
                else -> {
                    // Ask. The system dialog only shows once; after a denial
                    // Android will silently ignore further requests.
                    requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        }
        // Below Android 13 the permission is granted automatically.
    }

    // ------------------------------------------------------------------ //
    // JavaScript bridge — exposes FCM token to the React web app
    // ------------------------------------------------------------------ //

    inner class MagenBridge(private val context: Context) {

        /**
         * Called from the web app to retrieve this device's FCM token.
         * Returns the token string, or an empty string if no token has
         * been stored yet (e.g. on first launch before FCM responds).
         *
         * Usage from React:
         *   const token = window.MagenBridge?.getFcmToken?.() ?? "";
         */
        @JavascriptInterface
        fun getFcmToken(): String {
            return context.getSharedPreferences(MagenFcmService.PREFS_NAME, Context.MODE_PRIVATE)
                .getString(MagenFcmService.KEY_FCM_TOKEN, "") ?: ""
        }

        /**
         * Returns "android" so the web app knows which platform it's on and
         * can show/hide mobile-specific UI if needed.
         */
        @JavascriptInterface
        fun getPlatform(): String = "android"
    }

    // ------------------------------------------------------------------ //
    // Activity lifecycle
    // ------------------------------------------------------------------ //

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        splashOverlay = findViewById(R.id.splashOverlay)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true

        // Inject the native bridge — available as window.MagenBridge in JS.
        webView.addJavascriptInterface(MagenBridge(this), "MagenBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                // Keep navigation within the CMS domain inside the app;
                // anything else (e.g. a link to an external site) opens in
                // the system browser instead, same as the desktop app.
                return if (url.host == appHost) {
                    false
                } else {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                }
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                // Hide the splash once the first page has actually loaded --
                // same "don't dismiss until ready" idea as the desktop app's
                // ready-to-show handling.
                splashOverlay.visibility = View.GONE
            }
        }

        webView.loadUrl(appUrl)

        // Back button navigates the WebView's own history first, and only
        // exits the app once there's nothing left to go back to.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        // Ask for notification permission (Android 13+). We do this after
        // the WebView is set up so the UI is visible before the dialog
        // appears, giving it context.
        askNotificationPermission()
    }
}
