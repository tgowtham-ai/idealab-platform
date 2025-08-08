FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Use better npm install command
RUN npm ci --omit=dev --no-audit --no-fund

# Copy backend source
COPY backend/ ./

# Create user and directories
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p logs uploads && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE $PORT

CMD ["node", "server.js"]