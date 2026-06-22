# ─────────────────────────────────────────────────────────────────
# Stage 1: Build the React frontend
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build-frontend

WORKDIR /app/frontend-react

# Install deps first (better layer caching)
COPY frontend-react/package.json frontend-react/package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY frontend-react/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────
# Stage 2: Production — Hugging Face Spaces
#
# Key requirements for HF Spaces:
#   • Port MUST be 7860 (Hugging Face requirement)
#   • Runs as non-root user (uid=1000 on HF)
#   • Secrets injected via HF Space Secrets (set in Space Settings)
#   • NO local MongoDB — use MongoDB Atlas free tier as MONGO_URI
#   • Replica-set check is SKIPPED (Atlas handles this transparently)
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# ── Backend dependencies ──────────────────────────────────────────
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev --legacy-peer-deps

# ── Backend source ────────────────────────────────────────────────
COPY backend/ ./backend/

# ── Built React SPA ───────────────────────────────────────────────
COPY --from=build-frontend /app/frontend-react/dist ./frontend-react/dist

# ── Entrypoint script ─────────────────────────────────────────────
COPY docker-entrypoint.hf.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# ── Directories & permissions ─────────────────────────────────────
RUN mkdir -p /app/logs /app/tmp && chown -R node:node /app

USER node

# ─────────────────────────────────────────────────────────────────
# Non-secret defaults
# ─────────────────────────────────────────────────────────────────
# ⚠  DO NOT bake secrets here.
#    Set the following in your HF Space → Settings → Repository Secrets:
#
#    Required:
#      MONGO_URI              — MongoDB Atlas connection string (free tier works)
#      SESSION_SECRET         — random 64-char hex string
#      JWT_SECRET             — random 64-char hex string
#      SUPER_ADMIN_PASSWORD   — initial super-admin password
#
#    Optional / OAuth:
#      GOOGLE_CLIENT_ID
#      GOOGLE_CLIENT_SECRET
#      GOOGLE_CALLBACK_URL    — e.g. https://<your-space>.hf.space/auth/google/callback
#
# ─────────────────────────────────────────────────────────────────
ENV PORT=7860
ENV NODE_ENV=production
# CORS_ORIGIN will be your HF Space URL — set as a Space Secret or override below
ENV CORS_ORIGIN=https://your-space-name.hf.space
ENV GOOGLE_DEFAULT_ROLE=viewer

# Hugging Face Spaces requires port 7860
EXPOSE 7860

CMD ["/app/docker-entrypoint.sh"]
