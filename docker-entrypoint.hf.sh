#!/bin/sh
# ─────────────────────────────────────────────────────────────────
# ISOMAC — Hugging Face Spaces entrypoint
#
# Starts a local MongoDB 7 instance, waits for it to be ready,
# then launches the Node.js backend.
#
# Secrets must be set in HF Space → Settings → Variables and secrets:
#   SESSION_SECRET, JWT_SECRET, SUPER_ADMIN_PASSWORD
# ─────────────────────────────────────────────────────────────────
set -e

# ── Default MONGO_URI to local instance if not set ───────────────
export MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/isomac_db}"
export HF_SPACE=true

# ── Required secrets guard ───────────────────────────────────────
if [ -z "$SESSION_SECRET" ]; then
  echo "❌  SESSION_SECRET is not set."
  echo "    Add it in HF Space → Settings → Variables and secrets."
  exit 1
fi

if [ -z "$JWT_SECRET" ]; then
  echo "❌  JWT_SECRET is not set."
  echo "    Add it in HF Space → Settings → Variables and secrets."
  exit 1
fi

# ── Start local MongoDB (only if MONGO_URI is local) ─────────────
case "$MONGO_URI" in
  mongodb://127.0.0.1:*|mongodb://localhost:*)
    echo "🍃  Starting local MongoDB..."
    mkdir -p /data/db
    mongod --dbpath /data/db \
           --bind_ip 127.0.0.1 \
           --port 27017 \
           --logpath /app/logs/mongod.log \
           --fork
    echo "⏳  Waiting for MongoDB to be ready..."
    for i in $(seq 1 30); do
      if mongosh --quiet --eval "db.runCommand({ ping: 1 })" > /dev/null 2>&1; then
        echo "✅  MongoDB is ready."
        break
      fi
      echo "   attempt $i/30..."
      sleep 1
    done
    ;;
  *)
    echo "🌐  Using external MongoDB: ${MONGO_URI%%@*}@..."
    ;;
esac

echo "✅  Environment check passed."
echo "🚀  Starting ISOMAC on port ${PORT:-7860} ..."

exec node /app/backend/server.js
