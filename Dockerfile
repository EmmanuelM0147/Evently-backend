# Multi-stage Docker build for production deployment
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY src/ ./src/
COPY docs/ ./docs/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S evently -u 1001

# Production stage
FROM node:18-alpine AS production

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# Create application user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S evently -u 1001

# Copy built application from builder stage
COPY --from=builder --chown=evently:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=evently:nodejs /app/src ./src
COPY --from=builder --chown=evently:nodejs /app/docs ./docs
COPY --from=builder --chown=evently:nodejs /app/package*.json ./

# Create logs directory
RUN mkdir -p logs && chown evently:nodejs logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info

# Expose port
EXPOSE 3000

# Switch to non-root user
USER evently

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/app.js"]