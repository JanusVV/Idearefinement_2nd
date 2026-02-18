# Voice Agent – Gemini Voice-to-Voice (WebView Hybrid)

Android WebView wrapper and a standalone web client for real-time voice conversation with **Gemini** via the **Gemini Live API** over WebSocket. The web page handles all voice I/O and UI; the Android app provides native services (foreground audio, call screening) and injects backend configuration.

## Features

- **Talk and get spoken responses**: You speak; the model responds with audio.
- **Live transcription**: Conversation is transcribed in a scrolling chat.
- **Backend integration**: Registry patches, agent dispatch, and project management via the IdeaRefinement backend.

## Tech stack

- **Kotlin** (Android wrapper), **Jetpack Compose** (settings screen)
- **Min SDK**: 26 · **Target SDK**: 35
- **Gemini Live API** over WebSocket (browser-native, no SDK)
- **Audio**: 16-bit PCM @ 16 kHz send / 24 kHz receive (via AudioWorklet)

---

## Android setup

1. **Gemini API key**
   Get one at [Google AI Studio](https://aistudio.google.com/apikey).

2. **Configure**
   In `voice-agent/`, create or edit **`local.properties`**:
   ```properties
   sdk.dir=<path-to-android-sdk>
   GEMINI_API_KEY=<your-gemini-api-key>
   BACKEND_URL=http://<your-server-ip>:3002
   FALLBACK_URL=http://localhost:3002
   BACKEND_API_KEY=<your-backend-api-key>
   ```
   Do not commit `local.properties` (it is in `.gitignore`).

3. **Build and run**
   Open `voice-agent/` in Android Studio and run on a device (API 26+). Grant **microphone** when prompted. The backend URL can also be changed at runtime in the app's **Settings** screen.

---

## Web client setup

See **[web-test/SETUP.md](web-test/SETUP.md)**. In short: copy `web-test/config.example.js` to `web-test/config.js`, set `GEMINI_API_KEY` and `BACKEND_URL`, then serve the `web-test` folder (e.g. `npx serve web-test`) and open the URL.

---

## Model

The app uses **`gemini-2.5-flash-native-audio-preview-12-2025`** (Live API native audio). To change it, edit the `MODEL` constant in:

- `web-test/index.html`
- `app/src/main/assets/web/index.html`

## Project structure

- `app/src/main/java/com/voiceagent/gemini/`
  - `MainActivity.kt` – Entry point; shows settings if not configured, otherwise launches WebView
  - `WebViewActivity.kt` – Hosts the web client in a WebView, injects config via JS bridge
  - `SettingsScreen.kt` – Compose UI for backend URL, fallback URL, and API key
  - `SettingsRepository.kt` – Encrypted storage for settings (EncryptedSharedPreferences)
  - `VoiceSessionService.kt` – Foreground service to keep audio alive in background
  - `VoiceCallScreeningService.kt` – Rejects incoming calls during active voice sessions
  - `VoiceAgentApplication.kt` – Application class
- `app/src/main/assets/web/` – Bundled web client (same as `web-test/` but reads config from Android bridge)
- `web-test/` – Standalone web client (reads config from `config.js`)
