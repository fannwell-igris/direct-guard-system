package com.magensecurity.cms

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.animation.LinearInterpolator
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ImageView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

/**
 * Loads the live CMS website in a native WebView, mirroring the desktop
 * Electron wrapper: same live app, external links open in the system
 * browser instead of inside the app. Unlike desktop, this WebView had no
 * offline page of its own, so a lost connection used to just show a blank
 * white screen -- errorOverlay below replaces that with a stalled-car
 * animation plus a retry button.
 */
class MainActivity : AppCompatActivity() {

    // Same live URL the desktop app loads. Unlike desktop's config.json
    // (which can be edited without a rebuild), changing this on mobile
    // requires a new build -- acceptable for now since the URL is stable.
    private val appUrl = "https://company-management-system-chi.vercel.app"
    private val appHost = Uri.parse(appUrl).host

    private lateinit var webView: WebView
    private lateinit var splashOverlay: View
    private lateinit var errorOverlay: View
    private lateinit var retryButton: Button
    private lateinit var vehicleImage: ImageView
    private lateinit var smokePuff: ImageView

    private var breakdownAnimator: AnimatorSet? = null

    // Set when the current main-frame load has failed (e.g. no internet);
    // cleared at the start of every new load. onPageFinished checks this to
    // decide whether the load actually succeeded, since WebView still calls
    // onPageFinished after a failed load.
    private var currentLoadFailed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        splashOverlay = findViewById(R.id.splashOverlay)
        errorOverlay = findViewById(R.id.errorOverlay)
        retryButton = findViewById(R.id.retryButton)
        vehicleImage = findViewById(R.id.vehicleImage)
        smokePuff = findViewById(R.id.smokePuff)

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
                currentLoadFailed = false
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                super.onReceivedError(view, request, error)
                // Only react to the main page failing to load -- a failed
                // sub-resource (an image, a tracking script, etc.) shouldn't
                // blank out an otherwise-working page.
                if (request.isForMainFrame) {
                    currentLoadFailed = true
                    showOfflineState()
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                if (!currentLoadFailed) {
                    // A real page loaded successfully -- make sure both
                    // overlays are out of the way, whichever was showing.
                    hideOfflineState()
                    splashOverlay.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                }
            }
        }

        retryButton.setOnClickListener {
            hideOfflineState()
            splashOverlay.visibility = View.VISIBLE
            webView.loadUrl(appUrl)
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

    private fun showOfflineState() {
        splashOverlay.visibility = View.GONE
        webView.visibility = View.GONE
        errorOverlay.visibility = View.VISIBLE
        startBreakdownAnimation()
    }

    private fun hideOfflineState() {
        errorOverlay.visibility = View.GONE
        stopBreakdownAnimation()
    }

    /** Rocks the car side to side and puffs a smoke ring above it, on loop. */
    private fun startBreakdownAnimation() {
        if (breakdownAnimator?.isRunning == true) return

        val rock = ObjectAnimator.ofFloat(vehicleImage, View.ROTATION, -4f, 4f).apply {
            duration = 260
            repeatCount = ObjectAnimator.INFINITE
            repeatMode = ObjectAnimator.REVERSE
            interpolator = LinearInterpolator()
        }
        val puffAlpha = ObjectAnimator.ofFloat(smokePuff, View.ALPHA, 0f, 0.85f, 0f).apply {
            duration = 1400
            repeatCount = ObjectAnimator.INFINITE
        }
        val puffRise = ObjectAnimator.ofFloat(smokePuff, View.TRANSLATION_Y, 12f, -34f).apply {
            duration = 1400
            repeatCount = ObjectAnimator.INFINITE
        }
        val puffScaleX = ObjectAnimator.ofFloat(smokePuff, View.SCALE_X, 0.5f, 1.3f).apply {
            duration = 1400
            repeatCount = ObjectAnimator.INFINITE
        }
        val puffScaleY = ObjectAnimator.ofFloat(smokePuff, View.SCALE_Y, 0.5f, 1.3f).apply {
            duration = 1400
            repeatCount = ObjectAnimator.INFINITE
        }

        breakdownAnimator = AnimatorSet().apply {
            playTogether(rock, puffAlpha, puffRise, puffScaleX, puffScaleY)
            start()
        }
    }

    private fun stopBreakdownAnimation() {
        breakdownAnimator?.cancel()
        breakdownAnimator = null
        vehicleImage.rotation = 0f
        smokePuff.alpha = 0f
        smokePuff.translationY = 0f
        smokePuff.scaleX = 1f
        smokePuff.scaleY = 1f
    }
}
