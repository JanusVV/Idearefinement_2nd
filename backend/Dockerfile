FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
VOLUME /app/data
ENV REGISTRY_DATA_DIR=/app/data/projects
CMD ["node", "src/index.js"]
