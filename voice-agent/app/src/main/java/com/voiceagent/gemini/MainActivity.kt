package com.voiceagent.gemini

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier

/**
 * Entry point. If backend settings are configured, launches the WebView
 * voice client immediately. Otherwise shows the settings screen first.
 */
class MainActivity : ComponentActivity() {

    private lateinit var settings: SettingsRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        settings = SettingsRepository(applicationContext)

        if (settings.isConfigured) {
            launchWebView()
            return
        }

        showSettings()
    }

    private fun launchWebView() {
        startActivity(Intent(this, WebViewActivity::class.java))
        finish()
    }

    private fun showSettings() {
        setContent {
            Surface(modifier = Modifier.fillMaxSize()) {
                SettingsScreen(
                    settings = settings,
                    onBack = {
                        if (settings.isConfigured) {
                            launchWebView()
                        }
                    }
                )
            }
        }
    }
}
