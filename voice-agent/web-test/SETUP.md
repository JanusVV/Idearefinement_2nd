# Web test – Gemini Live API (no Firebase)

This page talks to the **Gemini Live API** directly over WebSocket using an **API key**. No Firebase project is required.

## What you need

1. **Gemini API key**  
   Get one at [Google AI Studio](https://aistudio.google.com/apikey).

2. **config.js**  
   Copy `config.example.js` to `config.js` and set your key:
   ```js
   export const GEMINI_API_KEY = 'your-actual-api-key';
   ```
   Do not commit `config.js` (it is in `.gitignore`).

3. **Serve over HTTP**  
   Open the page via a local server (mic and modules need a real origin). Examples:
   ```bash
   cd web-test
   npx -y serve .
   # then open http://localhost:3000
   ```
   or:
   ```bash
   cd web-test
   python -m http.server 8080
   # then open http://localhost:8080
   ```

4. **Use the app**  
   Click “Start conversation”, allow the microphone when asked, and speak. The model replies with audio and transcript lines appear.

## Model

The test uses **`gemini-2.5-flash-native-audio-preview-12-2025`** (Live API native audio). You can change the `MODEL` constant in `index.html` if you want to try another Live-capable model.

## Troubleshooting

- **“Missing config.js”** – Create `config.js` from `config.example.js` and set `GEMINI_API_KEY`.
- **CORS / module errors** – Serve the folder with a local server; do not open the HTML file directly.
- **Mic not working** – Use HTTPS or `localhost` and grant microphone permission.
- **WebSocket / 4xx errors** – Check that the API key is valid and that the Gemini API is enabled for your Google Cloud project (if required for your key).
