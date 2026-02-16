package com.voiceagent.gemini.audio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withContext

/**
 * Manages PCM 16-bit mono audio at 24kHz for recording (AudioRecord) and playback (AudioTrack).
 * Playback is queued so chunks play sequentially without overlapping (no garbling).
 */
object AudioConstants {
    const val SAMPLE_RATE = 24_000
    const val CHANNEL_CONFIG_IN = android.media.AudioFormat.CHANNEL_IN_MONO
    const val CHANNEL_CONFIG_OUT = AudioFormat.CHANNEL_OUT_MONO
    const val ENCODING = AudioFormat.ENCODING_PCM_16BIT
    const val BYTES_PER_SAMPLE = 2

    /** ~100ms of audio: 24_000 * 2 * 0.1 = 4800 bytes */
    const val RECORD_CHUNK_SIZE_SAMPLES = 1_200
    const val RECORD_CHUNK_SIZE_BYTES = RECORD_CHUNK_SIZE_SAMPLES * BYTES_PER_SAMPLE
}

class AudioHandler(private val scope: CoroutineScope) {

    private var audioRecord: AudioRecord? = null
    private var audioTrack: AudioTrack? = null
    private var recordJob: Job? = null
    private var playbackChannel = Channel<ByteArray>(Channel.UNLIMITED)
    private var playbackJob: Job? = null
    private val playbackLock = Any()

    private val minRecordBufferSize = AudioRecord.getMinBufferSize(
        AudioConstants.SAMPLE_RATE,
        AudioConstants.CHANNEL_CONFIG_IN,
        AudioConstants.ENCODING
    )

    private val minPlayBufferSize = AudioTrack.getMinBufferSize(
        AudioConstants.SAMPLE_RATE,
        AudioConstants.CHANNEL_CONFIG_OUT,
        AudioConstants.ENCODING
    )

    fun startRecording(onChunk: suspend (ByteArray) -> Unit): Boolean {
        if (audioRecord != null) return false
        val bufferSize = maxOf(minRecordBufferSize, AudioConstants.RECORD_CHUNK_SIZE_BYTES * 2)
        val record = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                AudioConstants.SAMPLE_RATE,
                AudioConstants.CHANNEL_CONFIG_IN,
                AudioConstants.ENCODING,
                bufferSize
            )
        } catch (e: SecurityException) {
            return false
        }
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            return false
        }
        audioRecord = record
        recordJob = scope.launch(Dispatchers.IO) {
            record.startRecording()
            val buffer = ByteArray(AudioConstants.RECORD_CHUNK_SIZE_BYTES)
            while (recordJob?.isActive == true && record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                val read = record.read(buffer, 0, buffer.size)
                if (read > 0) onChunk(buffer.copyOf(read))
            }
        }
        return true
    }

    fun stopRecording() {
        recordJob?.cancel()
        recordJob = null
        audioRecord?.apply {
            if (recordingState == AudioRecord.RECORDSTATE_RECORDING) stop()
            release()
        }
        audioRecord = null
    }

    private fun ensurePlaybackConsumer(): Channel<ByteArray> = synchronized(playbackLock) {
        if (playbackJob == null || !playbackJob!!.isActive) {
            playbackChannel = Channel(Channel.UNLIMITED)
            val ch = playbackChannel
            playbackJob = scope.launch(Dispatchers.IO) {
                val track = audioTrack ?: createAudioTrack().also { audioTrack = it }
                track.play()
                for (chunk in ch) {
                    if (chunk.isNotEmpty()) track.write(chunk, 0, chunk.size, AudioTrack.WRITE_BLOCKING)
                }
            }
        }
        playbackChannel
    }

    fun playPcmChunk(pcmData: ByteArray) {
        if (pcmData.isEmpty()) return
        val ch = ensurePlaybackConsumer()
        scope.launch(Dispatchers.IO) { ch.send(pcmData) }
    }

    private fun createAudioTrack(): AudioTrack {
        val bufferSize = maxOf(minPlayBufferSize, AudioConstants.RECORD_CHUNK_SIZE_BYTES * 4)
        return AudioTrack.Builder()
            .setAudioFormat(
                android.media.AudioFormat.Builder()
                    .setEncoding(AudioConstants.ENCODING)
                    .setSampleRate(AudioConstants.SAMPLE_RATE)
                    .setChannelMask(AudioConstants.CHANNEL_CONFIG_OUT)
                    .build()
            )
            .setBufferSizeInBytes(bufferSize)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
            .apply { setVolume(AudioTrack.getMaxVolume()) }
    }

    fun stopPlayback() {
        playbackJob?.cancel()
        playbackJob = null
        playbackChannel.close()
        playbackChannel = Channel(Channel.UNLIMITED)
        audioTrack?.apply {
            if (playState == AudioTrack.PLAYSTATE_PLAYING) stop()
            release()
        }
        audioTrack = null
    }

    fun release() {
        stopRecording()
        stopPlayback()
    }
}
