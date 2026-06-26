FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy server code
COPY server.js mcp.js ./
COPY server/ ./server/
COPY db/ ./db/
COPY .env.example ./

# Copy built frontend
COPY dist/ ./dist/

# Create data directory for SQLite
RUN mkdir -p /app/data /app/logs

# Environment
ENV NODE_ENV=production
ENV PORT=5000
ENV DB_PATH=/app/data/1ai-ads.db

EXPOSE 5000

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "import('http').then(h=>h.get('http://localhost:5000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1)))"

CMD ["node", "server.js"]
