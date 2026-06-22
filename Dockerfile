# ─────────────────────────────────────────────────────────────────
# Stage 1: Build the React frontend
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build-frontend

WORKDIR /app/frontend-react

COPY frontend-react/package.json frontend-react/package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY frontend-react/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────
# Stage 2: Production — Hugging Face Spaces (local MongoDB)
#
# • Port MUST be 7860 (HF requirement)
# • MongoDB 7 runs locally inside the container — no Atlas needed
# • MONGO_URI defaults to mongodb://127.0.0.1:27017/isomac_db
# • Only SESSION_SECRET, JWT_SECRET, SUPER_ADMIN_PASSWORD needed
#   as HF Space Secrets
# ─────────────────────────────────────────────────────────────────

# Use Debian-based node image so apt-get can install MongoDB easily
FROM node:20-bookworm-slim AS production

# ── Install MongoDB 7 via official apt repo ───────────────────────
# We need ca-certificates for curl to download via HTTPS
RUN apt-get update && apt-get install -y \
        curl \
        gnupg \
        ca-certificates \
    && curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor \
    && echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
        https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" \
        > /etc/apt/sources.list.d/mongodb-org-7.0.list \
    && apt-get update \
    && apt-get install -y mongodb-org \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

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

# ── MongoDB data directory + app dirs ─────────────────────────────
RUN mkdir -p /data/db /app/logs /app/tmp && \
    chown -R node:node /app /data/db

USER node

# ─────────────────────────────────────────────────────────────────
# Non-secret defaults (safe to bake in)
# ─────────────────────────────────────────────────────────────────
# MONGO_URI points to the local MongoDB running in this container.
# Override by setting it as an HF Space Secret to use Atlas instead.
ENV MONGO_URI=mongodb://127.0.0.1:27017/isomac_db
ENV PORT=7860
ENV NODE_ENV=production
ENV HF_SPACE=true
ENV CORS_ORIGIN=https://sachinpal4355-isomac.hf.space
ENV GOOGLE_DEFAULT_ROLE=viewer

# ─────────────────────────────────────────────────────────────────
# HF Space → Settings → Variables and secrets:
#
#   Required:
#     SESSION_SECRET       — random 64-char hex
#     JWT_SECRET           — random 64-char hex
#     SUPER_ADMIN_PASSWORD — your admin login password
#
#   Optional:
#     MONGO_URI            — only if you want external Atlas DB
#     GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL
# ─────────────────────────────────────────────────────────────────

EXPOSE 7860

CMD ["/app/docker-entrypoint.sh"]
