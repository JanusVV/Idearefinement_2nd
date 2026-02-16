package com.voiceagent.gemini

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the voice session alive when the app
 * goes to the background. Displays a persistent notification so the
 * system does not kill the audio or WebSocket connection.
 */
class VoiceSessionService : Service() {

    inner class LocalBinder : Binder() {
        val service get() = this@VoiceSessionService
    }

    private val binder = LocalBinder()
    private var isSessionActive = false

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startSession()
            ACTION_STOP -> stopSession()
        }
        return START_NOT_STICKY
    }

    fun startSession() {
        if (isSessionActive) return
        isSessionActive = true

        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        SessionState.isActive = true
    }

    fun stopSession() {
        isSessionActive = false
        SessionState.isActive = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        isSessionActive = false
        SessionState.isActive = false
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Voice Session",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Active voice refinement session"
                setShowBadge(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = PendingIntent.getService(
            this, 1,
            Intent(this, VoiceSessionService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Voice Session Active")
            .setContentText("Idea refinement session is running")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopIntent)
            .build()
    }

    companion object {
        const val ACTION_START = "com.voiceagent.gemini.START_SESSION"
        const val ACTION_STOP = "com.voiceagent.gemini.STOP_SESSION"
        private const val CHANNEL_ID = "voice_session"
        private const val NOTIFICATION_ID = 1001
    }
}

/**
 * Global flag indicating whether a voice session is currently active.
 * Used by CallScreeningService to decide whether to reject calls.
 */
object SessionState {
    @Volatile
    var isActive: Boolean = false
}
