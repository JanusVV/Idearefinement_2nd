# Build context must be IdeaRefinement root so voice-agent/web-test is available.
FROM node:20-alpine
RUN npm install -g serve
WORKDIR /app
COPY voice-agent/web-test /app
# Remove config.js if it was copied as a directory (e.g. from Docker volume on Windows). Then create a real file.
RUN rm -rf config.js && printf '%s\n' \
  'export const GEMINI_API_KEY = "YOUR_API_KEY_HERE";' \
  'export const BACKEND_URL = "";' \
  > config.js
ENV NODE_ENV=production
EXPOSE 3001
CMD ["serve", "-s", ".", "-l", "3001"]
