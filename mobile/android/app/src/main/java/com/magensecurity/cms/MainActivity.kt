package com.magensecurity.cms

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

/**
 * Loads the live CMS website in a native WebView, mirroring the desktop
 * Electron wrapper: same live app, external links open in the system
 * browser instead of inside the app.
 *
 * On top of the plain wrapper this adds:
 *  - a native "no connection" screen with a retry button, shown when the
 *    main page fails to load, instead of the browser's default error page;
 *  - support for file inputs in the CMS (e.g. uploading a document or an
 *    ID photo), including taking a new photo directly from the camera --
 *    neither works in a bare WebView without this wiring.
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

    // Pending callback the WebView is waiting on for a file-input result,
    // and the Uri we told the camera app to save its photo to.
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var cameraPhotoUri: Uri? = null

    private lateinit var fileChooserLauncher: ActivityResultLauncher<Intent>
    private lateinit var notificationPermissionLauncher: ActivityResultLauncher<String>

    /**
     * Bridge exposed to the CMS web app as `window.AndroidNative`. The web
     * app calls onLoggedIn/onLoggedOut from AuthContext.tsx right at login
     * and logout — a WebView SPA doesn't reload the page on either, so
     * there's no other reliable moment to notice a session starting or
     * ending. Guarded on the JS side with `typeof window.AndroidNative
     * !== "undefined"`, so it's a no-op on the plain website/desktop app.
     */
    private inner class NativeBridge {
        @JavascriptInterface
        fun onLoggedIn(authToken: String) {
            runOnUiThread { registerPushToken(applicationContext, authToken) }
        }

        @JavascriptInterface
        fun onLoggedOut() {
            runOnUiThread { unregisterStoredPushToken(applicationContext) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        createNotificationChannel(applicationContext)

        webView = findViewById(R.id.webView)
        splashOverlay = findViewById(R.id.splashOverlay)
        errorOverlay = findViewById(R.id.errorOverlay)
        retryButton = findViewById(R.id.retryButton)

        webView.addJavascriptInterface(NativeBridge(), "AndroidNative")

        notificationPermissionLauncher =
            registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* no-op either way */ }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        fileChooserLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            var results: Array<Uri>? = null
            if (result.resultCode == RESULT_OK) {
                val data = result.data
                val pickedUri = data?.data
                results = if (pickedUri != null) {
                    // Picked from gallery/files.
                    arrayOf(pickedUri)
                } else {
                    // No data means it came back from the camera -- use the
                    // Uri we handed it to save the photo to.
                    cameraPhotoUri?.let { arrayOf(it) }
                }
            }
            filePathCallback?.onReceiveValue(results)
            filePathCallback = null
        }

        retryButton.setOnClickListener { retryLoad() }

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
                // Hide the splash/error screens once the page has actually
                // loaded -- same "don't dismiss until ready" idea as the
                // desktop app's ready-to-show handling.
                splashOverlay.visibility = View.GONE
                errorOverlay.visibility = View.GONE
                webView.visibility = View.VISIBLE

                // Cold-start fallback: if the app opens straight into an
                // already-logged-in session (JWT still valid from
                // yesterday), NativeBridge.onLoggedIn never fires because
                // no fresh login happened this run. Check localStorage
                // directly so push registration still happens.
                view.evaluateJavascript(
                    "(function(){return window.localStorage.getItem('cms_token');})();"
                ) { value ->
                    val token = value?.trim('"')
                    if (!token.isNullOrEmpty() && token != "null") {
                        registerPushToken(applicationContext, token)
                    }
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                super.onReceivedError(view, request, error)
                // Only treat a failure to load the CMS page itself as fatal;
                // a failed sub-resource (an image, a font, an ad blocker
                // hiccup) shouldn't take over the whole screen.
                if (request.isForMainFrame) {
                    showError()
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                // Cancel any previous pending chooser before starting a new one.
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val photoFile = createImageFile()
                cameraPhotoUri = if (photoFile != null) {
                    FileProvider.getUriForFile(
                        this@MainActivity,
                        "$packageName.fileprovider",
                        photoFile
                    )
                } else {
                    null
                }

                val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                    putExtra(MediaStore.EXTRA_OUTPUT, cameraPhotoUri)
                    addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                }

                val contentIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }

                val chooserIntent = Intent.createChooser(contentIntent, "Choose file").apply {
                    if (cameraPhotoUri != null) {
                        putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
                    }
                }

                fileChooserLauncher.launch(chooserIntent)
                return true
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

    private fun showError() {
        splashOverlay.visibility = View.GONE
        webView.visibility = View.GONE
        errorOverlay.visibility = View.VISIBLE
    }

    private fun retryLoad() {
        errorOverlay.visibility = View.GONE
        splashOverlay.visibility = View.VISIBLE
        webView.loadUrl(appUrl)
    }

    /** A fresh temp jpg under cacheDir/camera/, matching file_paths.xml's cache-path. */
    private fun createImageFile(): File? {
        return try {
            val dir = File(cacheDir, "camera")
            if (!dir.exists()) dir.mkdirs()
            File.createTempFile("IMG_", ".jpg", dir)
        } catch (e: Exception) {
            null
        }
    }
}
