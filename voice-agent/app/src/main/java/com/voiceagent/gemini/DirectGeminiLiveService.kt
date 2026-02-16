package com.voiceagent.gemini

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.Dispatchers
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val LIVE_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
// Use a Live API–supported model. Switch to gemini-3.0-flash when available for bidiGenerateContent.
private const val MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"

/**
 * Session handle for the direct Gemini Live API (no Firebase).
 */
class DirectLiveSession(
    private val webSocket: WebSocket,
    private val messageChannel: Channel<ServerMessage>
) {
    fun sendRealtimeAudio(pcmBase64: String) {
        val json = JSONObject().apply {
            put("realtimeInput", JSONObject().apply {
                put("audio", JSONObject().apply {
                    put("mimeType", "audio/pcm")
                    put("data", pcmBase64)
                })
            })
        }
        webSocket.send(json.toString())
    }

    fun sendAudioStreamEnd() {
        val json = JSONObject().apply {
            put("realtimeInput", JSONObject().apply {
                put("audioStreamEnd", true)
            })
        }
        webSocket.send(json.toString())
    }

    fun close() {
        webSocket.close(1000, null)
        messageChannel.close()
    }
}

sealed class ServerMessage {
    data class Content(val result: DirectGeminiLiveService.ContentResult) : ServerMessage()
    data class TurnComplete(val turnComplete: Boolean) : ServerMessage()
    data class Error(val throwable: Throwable) : ServerMessage()
}

/**
 * Gemini Live API via direct WebSocket (no Firebase). Requires a Gemini API key.
 */
class DirectGeminiLiveService(private val apiKey: String) {

    data class ContentResult(
        val userTranscript: String?,
        val modelTranscript: String?,
        val audioChunks: List<ByteArray>
    )

    suspend fun connect(): DirectLiveSession = withContext(Dispatchers.IO) {
        val messageChannel = Channel<ServerMessage>(Channel.UNLIMITED)
        val socketRef = AtomicReference<WebSocket?>(null)

        suspendCancellableCoroutine { cont ->
            val client = OkHttpClient.Builder().build()
            val request = Request.Builder()
                .url("$LIVE_WS_URL?key=${java.net.URLEncoder.encode(apiKey, "UTF-8")}")
                .build()

            val listener = object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: okhttp3.Response) {
                    socketRef.set(webSocket)
                    val setup = JSONObject().apply {
                        put("setup", JSONObject().apply {
                            put("model", "models/$MODEL")
                            put("generationConfig", JSONObject().apply {
                                put("responseModalities", org.json.JSONArray().put("AUDIO"))
                            })
                            put("systemInstruction", JSONObject().apply {
                                put("parts", org.json.JSONArray().put(JSONObject().apply {
                                    put("text", "You are a helpful voice assistant.")
                                }))
                            })
                            put("inputAudioTranscription", JSONObject())
                            put("outputAudioTranscription", JSONObject())
                        })
                    }
                    webSocket.send(setup.toString())
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    try {
                        val msg = JSONObject(text)
                        if (msg.has("setupComplete")) {
                            cont.resume(DirectLiveSession(webSocket, messageChannel))
                            return
                        }
                        if (msg.has("serverContent")) {
                            val c = msg.getJSONObject("serverContent")
                            val result = parseServerContent(c)
                            if (result != null) messageChannel.trySend(ServerMessage.Content(result))
                            if (c.optBoolean("turnComplete")) {
                                messageChannel.trySend(ServerMessage.TurnComplete(true))
                            }
                        }
                    } catch (e: Exception) {
                        messageChannel.trySend(ServerMessage.Error(e))
                    }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: okhttp3.Response?) {
                    if (!cont.isCompleted) cont.resumeWithException(t)
                    messageChannel.trySend(ServerMessage.Error(t))
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    messageChannel.close()
                }
            }

            val ws = client.newWebSocket(request, listener)
            cont.invokeOnCancellation { ws.close(1000, null) }
        }
    }

    fun receive(session: DirectLiveSession): Flow<ServerMessage> = session.messageChannel.receiveAsFlow()

    fun sendAudioRealtime(session: DirectLiveSession, pcmBytes: ByteArray) {
        val base64 = android.util.Base64.encodeToString(pcmBytes, android.util.Base64.NO_WRAP)
        session.sendRealtimeAudio(base64)
    }

    private fun parseServerContent(c: JSONObject): ContentResult? {
        val inputText = c.optJSONObject("inputTranscription")?.optString("text")?.takeIf { it.isNotBlank() }
        val outputText = c.optJSONObject("outputTranscription")?.optString("text")?.takeIf { it.isNotBlank() }
        val audioChunks = mutableListOf<ByteArray>()
        c.optJSONObject("modelTurn")?.optJSONArray("parts")?.let { parts ->
            for (i in 0 until parts.length()) {
                val part = parts.optJSONObject(i) ?: continue
                val inline = part.optJSONObject("inlineData") ?: continue
                val mime = inline.optString("mimeType", "")
                if (!mime.startsWith("audio/")) continue
                val data = inline.optString("data", "")
                if (data.isNotEmpty()) {
                    audioChunks.add(android.util.Base64.decode(data, android.util.Base64.DEFAULT))
                }
            }
        }
        return ContentResult(
            userTranscript = inputText,
            modelTranscript = outputText,
            audioChunks = audioChunks
        )
    }
}
