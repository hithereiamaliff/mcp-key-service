FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json tsconfig.json ./
RUN npm ci

# Build TypeScript
COPY src/ ./src/
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Create non-root user and data directory
RUN addgroup -g 1001 -S nodejs && \
    adduser -S keyservice -u 1001 && \
    mkdir -p /app/data && \
    chown -R keyservice:nodejs /app

USER keyservice

EXPOSE 8090

ENV PORT=8090
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8090/health || exit 1

CMD ["node", "dist/server.js"]
