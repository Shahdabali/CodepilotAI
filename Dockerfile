# Multi-stage Dockerfile for CodePilot AI Autonomous Coding Agent
FROM node:20-slim AS builder

WORKDIR /app

# Copy root workspace configurations
COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install dependencies
RUN npm install

# Copy source trees
COPY backend ./backend
COPY frontend ./frontend

# Build both workspaces
RUN npm run build

# Production Runner
FROM node:20-slim AS runner

# Install essential dev tools needed by the autonomous coding agent (git, python, compilers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    python3-pip \
    ca-certificates \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy package descriptors
COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install backend production dependencies
RUN npm install --omit=dev --workspace=backend

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist

# Expose unified server port
EXPOSE 3000

# Start unified server (serves REST API, SSE, WebSockets, and frontend SPA)
CMD ["node", "backend/dist/server.js"]
