#!/bin/sh
# Write config.js from env (sourced from .env via docker-compose) so one key works for both backend and web.
cat > /app/config.js << EOF
export const GEMINI_API_KEY = "${GEMINI_API_KEY:-YOUR_API_KEY_HERE}";
export const BACKEND_URL = "${BACKEND_URL:-http://localhost:3002}";
export const API_KEY = "${API_KEY:-}";
EOF
exec serve -s . -l 3001
