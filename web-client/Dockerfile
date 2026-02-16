# Build context must be IdeaRefinement root so voice-agent/web-test is available.
FROM node:20-alpine
RUN npm install -g serve
WORKDIR /app
COPY voice-agent/web-test /app
COPY web-client/entrypoint.sh /entrypoint.sh
RUN rm -rf config.js && chmod +x /entrypoint.sh
ENV NODE_ENV=production
EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
