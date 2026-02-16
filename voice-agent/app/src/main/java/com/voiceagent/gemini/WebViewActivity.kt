package com.voiceagent.gemini

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Hosts the web-based voice client inside a WebView while keeping native
 * services (foreground service for background audio, call screening) active.
 */
class WebViewActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var settings: SettingsRepository
    private var pendingPermissionRequest: PermissionRequest? = null

    private val micPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val pending = pendingPermissionRequest
        if (granted && pending != null) {
            pending.grant(pending.resources)
        } else {
            pending?.deny()
        }
        pendingPermissionRequest = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        settings = SettingsRepository(applicationContext)

        webView = WebView(this).apply {
            settings.also { ws ->
                ws.javaScriptEnabled = true
                ws.domStorageEnabled = true
                ws.mediaPlaybackRequiresUserGesture = false
                ws.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                ws.allowFileAccess = false
                ws.allowContentAccess = false
                @Suppress("DEPRECATION")
                ws.databaseEnabled = true
            }
        }
        setContentView(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                injectConfig(view)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val resources = request.resources
                if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                    if (ContextCompat.checkSelfPermission(
                            this@WebViewActivity,
                            Manifest.permission.RECORD_AUDIO
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        request.grant(resources)
                    } else {
                        pendingPermissionRequest = request
                        micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                } else {
                    request.deny()
                }
            }
        }

        webView.addJavascriptInterface(SessionBridge(), "Android")

        webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    private fun injectConfig(view: WebView) {
        val geminiKey = BuildConfig.GEMINI_API_KEY
        val backendUrl = settings.backendUrl.replace("'", "\\'")
        val backendApiKey = settings.apiKey.replace("'", "\\'")

        val script = """
            window.VOICE_AGENT_CONFIG = {
                GEMINI_API_KEY: '${geminiKey.replace("'", "\\'")}',
                BACKEND_URL: '$backendUrl',
                API_KEY: '$backendApiKey'
            };
        """.trimIndent()

        view.evaluateJavascript(script, null)
    }

    inner class SessionBridge {
        @JavascriptInterface
        fun startSession() {
            val intent = Intent(this@WebViewActivity, VoiceSessionService::class.java).apply {
                action = VoiceSessionService.ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        }

        @JavascriptInterface
        fun stopSession() {
            val intent = Intent(this@WebViewActivity, VoiceSessionService::class.java).apply {
                action = VoiceSessionService.ACTION_STOP
            }
            startService(intent)
        }
    }

    @Deprecated("Use OnBackPressedDispatcher")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
