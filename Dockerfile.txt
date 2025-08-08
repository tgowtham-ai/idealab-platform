FROM node:18-alpine

WORKDIR /app

# Copy backend files
COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/ ./

# Create user and directories
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p logs uploads && \
    chown -R nodejs:nodejs logs uploads

USER nodejs

EXPOSE $PORT

CMD ["node", "server.js"]