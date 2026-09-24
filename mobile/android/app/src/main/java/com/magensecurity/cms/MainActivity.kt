package com.magensecurity.cms

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

/**
 * Loads the live CMS website in a native WebView, mirroring the desktop
 * Electron wrapper: same live app, no offline support, external links open
 * in the system browser instead of inside the app.
 */
class MainActivity : AppCompatActivity() {

    // Same live URL the desktop app loads. Unlike desktop's config.json
    // (which can be edited without a rebuild), changing this on mobile
    // requires a new build -- acceptable for now since the URL is stable.
    private val appUrl = "https://company-management-system-chi.vercel.app"
    private val appHost = Uri.parse(appUrl).host

    private lateinit var webView: WebView
    private lateinit var splashOverlay: View

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        splashOverlay = findViewById(R.id.splashOverlay)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true

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
    }
}
