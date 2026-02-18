package com.voiceagent.gemini

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

/**
 * Securely stores backend URL and API key using EncryptedSharedPreferences.
 * Falls back to BuildConfig defaults if not set.
 */
class SettingsRepository(context: Context) {

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        "voiceagent_secure_prefs",
        MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    var backendUrl: String
        get() = prefs.getString(KEY_URL, null)
            ?: BuildConfig.BACKEND_URL.ifBlank { "" }
        set(value) = prefs.edit().putString(KEY_URL, value).apply()

    var fallbackUrl: String
        get() = prefs.getString(KEY_FALLBACK_URL, null)
            ?: BuildConfig.FALLBACK_URL.ifBlank { "" }
        set(value) = prefs.edit().putString(KEY_FALLBACK_URL, value).apply()

    var apiKey: String
        get() = prefs.getString(KEY_API_KEY, null)
            ?: BuildConfig.BACKEND_API_KEY.ifBlank { "" }
        set(value) = prefs.edit().putString(KEY_API_KEY, value).apply()

    val isConfigured: Boolean
        get() = backendUrl.isNotBlank() && apiKey.isNotBlank()

    companion object {
        private const val KEY_URL = "backend_url"
        private const val KEY_FALLBACK_URL = "fallback_url"
        private const val KEY_API_KEY = "backend_api_key"
    }
}
