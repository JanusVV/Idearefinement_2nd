package com.voiceagent.gemini

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService

/**
 * Automatically rejects incoming phone calls while a voice session is active.
 * Requires the user to set this app as the default call screening app.
 * Works on API 29+ (Android 10).
 */
class VoiceCallScreeningService : CallScreeningService() {

    override fun onScreenCall(callDetails: Call.Details) {
        val direction = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            callDetails.callDirection
        } else {
            Call.Details.DIRECTION_INCOMING
        }

        if (direction == Call.Details.DIRECTION_INCOMING && SessionState.isActive) {
            val response = CallResponse.Builder()
                .setDisallowCall(true)
                .setRejectCall(true)
                .setSkipCallLog(false)
                .setSkipNotification(false)
                .build()
            respondToCall(callDetails, response)
        } else {
            respondToCall(callDetails, CallResponse.Builder().build())
        }
    }
}
