# Multi-stage build for smaller image

# ---- Build Stage ----
FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm install --production

# ---- Runtime Stage ----
FROM node:20-alpine
WORKDIR /app

# Runtime-only dependencies (no build tools)
RUN apk add --no-cache dumb-init

# Copy production node_modules from build stage
COPY --from=build /app/node_modules ./node_modules

# Copy application source
COPY server.js launcher.js ./
COPY package.json ./
COPY public ./public
COPY data/playlists ./default_playlists

# Create data and uploads directories
RUN mkdir -p data uploads && chown -R node:node data uploads /app

# Run as non-root user for security
USER node

EXPOSE 3001

# Use dumb-init as PID 1 to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
