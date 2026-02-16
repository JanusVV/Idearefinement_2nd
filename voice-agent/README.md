# Voice Agent – Gemini Voice-to-Voice (no Firebase)

Native Android app (Kotlin + Jetpack Compose) and a web test page for real-time voice conversation with **Gemini** via the **Gemini Live API** over WebSocket. No Firebase: you use a **Gemini API key** only.

## Features

- **Talk and get spoken responses**: You speak; the model responds with audio.
- **Live transcription**: Conversation is transcribed in a scrolling chat (you and the model).
- **Single-screen UI** (Android): Voice activity indicator, transcript list, mic FAB (Start / End).

## Tech stack

- **Kotlin**, **Jetpack Compose** (Android)
- **Min SDK**: 26 · **Target SDK**: 35
- **Gemini Live API** over WebSocket ([direct API](https://ai.google.dev/gemini-api/docs/live)); **OkHttp** on Android
- **Audio**: 16-bit PCM @ 24 kHz (Android), 16 kHz send / 24 kHz receive (web)

---

## Android setup

1. **Gemini API key**  
   Get one at [Google AI Studio](https://aistudio.google.com/apikey).

2. **Configure the key**  
   In the project root, create or edit **`local.properties`** and add:
   ```properties
   GEMINI_API_KEY=your-actual-api-key
   ```
   Do not commit `local.properties` (it is in `.gitignore`).

3. **Build and run**  
   Open the project in Android Studio and run on a device or emulator (API 26+). Grant **microphone** when prompted.

---

## Web test setup

See **[web-test/SETUP.md](web-test/SETUP.md)**. In short: copy `web-test/config.example.js` to `web-test/config.js`, set `GEMINI_API_KEY`, then serve the `web-test` folder (e.g. `npx serve web-test`) and open the URL.

---

## Model

The app uses **`gemini-2.5-flash-native-audio-preview-12-2025`** (Live API native audio). To change it, edit the `MODEL` constant in:

- **Android**: `DirectGeminiLiveService.kt`
- **Web**: `web-test/index.html`

## Project structure (Android)

- `app/src/main/java/com/voiceagent/gemini/`
  - `MainActivity.kt` – Compose entry point
  - `MainScreen.kt` – UI: activity indicator, transcript list, FAB
  - `GeminiViewModel.kt` – Session state, permissions, message list, recording/receive
  - `DirectGeminiLiveService.kt` – WebSocket client for Gemini Live API (no Firebase)
  - `ChatMessage.kt` – Data class for transcript items
  - `audio/AudioHandler.kt` – `AudioRecord` (24 kHz PCM) and `AudioTrack` playback

## Notes

- **Latency**: Audio is sent in small chunks (~100 ms). Chunk size is in `AudioConstants` in `AudioHandler.kt`.
- **Echo**: For best results without headphones, consider `AcousticEchoCanceler` on the capture path (not included here).
