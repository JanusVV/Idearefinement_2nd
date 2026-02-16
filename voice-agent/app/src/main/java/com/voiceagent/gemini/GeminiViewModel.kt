package com.voiceagent.gemini

import android.Manifest
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voiceagent.gemini.audio.AudioHandler
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import java.util.UUID
import kotlin.math.sqrt

private const val TRANSCRIPT_FLUSH_MS = 700L
private const val ECHO_SUPPRESS_MS = 800L
private const val ECHO_MATCH_MIN_LEN = 20
private const val RECENT_MODEL_TRANSCRIPT_MAX = 1500
private const val SILENCE_MS = 1000L
private const val VOLUME_THRESHOLD = 0.003
private const val ECHO_GATE_RMS_THRESHOLD = 0.02

class GeminiViewModel : ViewModel() {

    private val apiKey: String
        get() = BuildConfig.GEMINI_API_KEY

    private val liveService by lazy { DirectGeminiLiveService(apiKey) }
    private val audioHandler = AudioHandler(viewModelScope)

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private val _isActive = MutableStateFlow(false)
    val isActive: StateFlow<Boolean> = _isActive.asStateFlow()

    private val _isConnecting = MutableStateFlow(false)
    val isConnecting: StateFlow<Boolean> = _isConnecting.asStateFlow()

    private val _isThinkingOrSpeaking = MutableStateFlow(false)
    val isThinkingOrSpeaking: StateFlow<Boolean> = _isThinkingOrSpeaking.asStateFlow()

    private val _error = MutableSharedFlow<Throwable>(replay = 0)
    val error: SharedFlow<Throwable> = _error.asSharedFlow()

    private var liveSession: DirectLiveSession? = null
    private var receiveJob: Job? = null

    private var lastModelOutputTime = 0L
    private var recentModelTranscript = ""
    private var userTranscriptBuffer = ""
    private var modelTranscriptBuffer = ""
    private var userFlushJob: Job? = null
    private var modelFlushJob: Job? = null
    private var silenceStartMs: Long? = null
    private var lastWasSpeaking = false
    @Volatile private var currentMicRms = 0.0

    fun hasRecordAudioPermissionGranted(hasPermission: Boolean): Boolean = hasPermission

    private fun normalizeForEchoMatch(s: String): String =
        s.trim().replace(Regex("\\s+"), " ").replace(Regex("[.,!?;:'\"]"), "").lowercase()

    private fun isLikelyEchoFromModel(inputText: String): Boolean {
        val normalized = normalizeForEchoMatch(inputText)
        if (normalized.length < ECHO_MATCH_MIN_LEN) return false
        val recent = normalizeForEchoMatch(recentModelTranscript)
        if (recent.isEmpty()) return false
        return recent.contains(normalized) || normalized.contains(recent)
    }

    private fun flushUserTranscript() {
        userFlushJob?.cancel()
        userFlushJob = null
        if (userTranscriptBuffer.isNotBlank()) {
            _messages.update { it + ChatMessage(UUID.randomUUID().toString(), userTranscriptBuffer.trim(), isUser = true) }
            userTranscriptBuffer = ""
        }
    }

    private fun flushModelTranscript() {
        modelFlushJob?.cancel()
        modelFlushJob = null
        if (modelTranscriptBuffer.isNotBlank()) {
            _messages.update { it + ChatMessage(UUID.randomUUID().toString(), modelTranscriptBuffer.trim(), isUser = false) }
            modelTranscriptBuffer = ""
        }
    }

    fun startConversation() {
        viewModelScope.launch {
            if (apiKey.isBlank()) {
                _error.emit(IllegalStateException("Set GEMINI_API_KEY in local.properties (get key at https://aistudio.google.com/apikey)"))
                return@launch
            }
            _isConnecting.value = true
            try {
                val session = liveService.connect()
                liveSession = session
                _isActive.value = true
                startReceiveFlow(session)
                startRecording(session)
            } catch (e: Exception) {
                _error.emit(e)
                _isActive.value = false
            } finally {
                _isConnecting.value = false
            }
        }
    }

    fun endConversation() {
        receiveJob?.cancel()
        receiveJob = null
        userFlushJob?.cancel()
        userFlushJob = null
        modelFlushJob?.cancel()
        modelFlushJob = null
        flushUserTranscript()
        flushModelTranscript()
        audioHandler.stopRecording()
        audioHandler.release()
        liveSession?.close()
        liveSession = null
        _isActive.value = false
        _isThinkingOrSpeaking.value = false
    }

    private fun startReceiveFlow(session: DirectLiveSession) {
        receiveJob = viewModelScope.launch {
            liveService.receive(session)
                .catch { e -> _error.emit(e) }
                .collect { msg ->
                    when (msg) {
                        is ServerMessage.TurnComplete -> {
                            _isThinkingOrSpeaking.value = false
                            flushUserTranscript()
                            flushModelTranscript()
                        }
                        is ServerMessage.Content -> {
                            val r = msg.result
                            r.userTranscript?.takeIf { it.isNotBlank() }?.let { text ->
                                val now = System.currentTimeMillis()
                                val inTimeWindow = now - lastModelOutputTime < ECHO_SUPPRESS_MS
                                val matchesModel = isLikelyEchoFromModel(text)
                                val userSpeakingLoud = currentMicRms > ECHO_GATE_RMS_THRESHOLD
                                // Content match always suppresses; time window only suppresses if mic is quiet
                                val suppress = matchesModel || (inTimeWindow && !userSpeakingLoud)
                                if (!suppress) {
                                    userTranscriptBuffer += text
                                    userFlushJob?.cancel()
                                    userFlushJob = launch { delay(TRANSCRIPT_FLUSH_MS); flushUserTranscript() }
                                }
                            }
                            r.modelTranscript?.takeIf { it.isNotBlank() }?.let { text ->
                                lastModelOutputTime = System.currentTimeMillis()
                                _isThinkingOrSpeaking.value = true
                                modelTranscriptBuffer += text
                                recentModelTranscript += text
                                if (recentModelTranscript.length > RECENT_MODEL_TRANSCRIPT_MAX) {
                                    recentModelTranscript = recentModelTranscript.takeLast(RECENT_MODEL_TRANSCRIPT_MAX)
                                }
                                modelFlushJob?.cancel()
                                modelFlushJob = launch { delay(TRANSCRIPT_FLUSH_MS); flushModelTranscript() }
                            }
                            r.audioChunks.forEach { pcm -> audioHandler.playPcmChunk(pcm) }
                            if (r.modelTranscript != null || r.audioChunks.isNotEmpty()) {
                                lastModelOutputTime = System.currentTimeMillis()
                                _isThinkingOrSpeaking.value = true
                            }
                        }
                        is ServerMessage.Error -> _error.emit(msg.throwable)
                    }
                }
        }
    }

    private fun rmsFromPcm16(chunk: ByteArray): Double {
        if (chunk.size < 2) return 0.0
        var sum = 0.0
        var i = 0
        while (i < chunk.size - 1) {
            val s = ((chunk[i + 1].toInt() shl 8) or (chunk[i].toInt() and 0xff)).toShort().toInt() / 32768.0
            sum += s * s
            i += 2
        }
        return sqrt(sum / (chunk.size / 2))
    }

    private fun startRecording(session: DirectLiveSession) {
        var localSilenceStart: Long? = null
        var localLastWasSpeaking = false
        val started = audioHandler.startRecording { chunk ->
            viewModelScope.launch(Dispatchers.IO) {
                val rms = rmsFromPcm16(chunk)
                currentMicRms = rms
                val speaking = rms > VOLUME_THRESHOLD
                val now = System.currentTimeMillis()
                if (speaking) {
                    localSilenceStart = null
                    localLastWasSpeaking = true
                } else if (localLastWasSpeaking) {
                    if (localSilenceStart == null) localSilenceStart = now
                    else if (now - (localSilenceStart ?: 0) >= SILENCE_MS) {
                        session.sendAudioStreamEnd()
                        localSilenceStart = null
                        localLastWasSpeaking = false
                    }
                }
                if (!_isThinkingOrSpeaking.value) {
                    liveService.sendAudioRealtime(session, chunk)
                }
            }
        }
        if (!started) {
            viewModelScope.launch { _error.emit(SecurityException("RECORD_AUDIO permission required")) }
        }
    }

    override fun onCleared() {
        super.onCleared()
        endConversation()
    }
}
