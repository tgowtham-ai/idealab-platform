FROM node:18-alpine

WORKDIR /app

# Copy package.json only (no lock file needed)
COPY backend/package.json ./

# Use npm install instead of npm ci
RUN npm install --only=production

# Copy backend source
COPY backend/ ./

# Create user and permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p logs uploads && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE $PORT

CMD ["node", "server.js"]