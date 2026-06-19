# Stage 1: Build the React frontend
FROM node:20 AS build-frontend
WORKDIR /app/frontend-react
COPY frontend-react/package.json frontend-react/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY frontend-react/ ./
RUN npm run build

# Stage 2: Production environment
FROM node:20-bookworm-slim AS production

# Install MongoDB and necessary packages
RUN apt-get update && apt-get install -y gnupg wget curl && \
    wget -qO- https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg && \
    echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list && \
    apt-get update && \
    apt-get install -y mongodb-org-server mongodb-mongosh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set up app directory
WORKDIR /app

# Copy backend dependencies
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --legacy-peer-deps

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend assets
COPY --from=build-frontend /app/frontend-react/dist ./frontend-react/dist

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose the default port (Hugging Face routes here)
EXPOSE 7860

# Use the existing node user (UID 1000) for Hugging Face Spaces security
RUN mkdir -p /app/data/db /app/logs && chown -R node:node /app

USER node

# Non-secret environment defaults
# IMPORTANT: All secrets below must be set as Hugging Face Space Secrets
# Go to: HF Space → Settings → Variables and secrets
# Required secrets: SESSION_SECRET, JWT_SECRET, SUPER_ADMIN_PASSWORD,
#                   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
ENV PORT=7860
ENV MONGO_URI=mongodb://127.0.0.1:27017/isomac_db?replicaSet=rs0
ENV NODE_ENV=production
ENV CORS_ORIGIN=https://sachinpal4355-isomac.hf.space
ENV GOOGLE_CALLBACK_URL=https://sachinpal4355-isomac.hf.space/auth/google/callback
ENV GOOGLE_DEFAULT_ROLE=viewer

ENTRYPOINT ["/app/docker-entrypoint.sh"]
