#!/bin/sh
# ─────────────────────────────────────────────────────────────────
# ISOMAC — Hugging Face Spaces entrypoint
#
# Differences from the Azure entrypoint:
#   • Port 7860  (HF Spaces requirement)
#   • Replica-set check is DISABLED — MongoDB Atlas handles this
#     transparently; standalone rejection would break HF demos.
#   • Secrets come from HF Space Settings → Repository Secrets
# ─────────────────────────────────────────────────────────────────
set -e

# ── Required environment variable guard ──────────────────────────
if [ -z "$MONGO_URI" ]; then
  echo "❌  MONGO_URI is not set."
  echo "    Go to your HF Space → Settings → Repository Secrets and add MONGO_URI."
  echo "    Use a free MongoDB Atlas cluster: https://www.mongodb.com/atlas"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "❌  SESSION_SECRET is not set."
  echo "    Add it in HF Space → Settings → Repository Secrets."
  exit 1
fi

if [ -z "$JWT_SECRET" ]; then
  echo "❌  JWT_SECRET is not set."
  echo "    Add it in HF Space → Settings → Repository Secrets."
  exit 1
fi

echo "✅  Environment check passed."
echo "🚀  Starting ISOMAC on port ${PORT:-7860} ..."

# Signal to server.js that we are running on Hugging Face Spaces.
# This makes the replica-set check non-fatal (Atlas handles it transparently).
export HF_SPACE=true

exec node /app/backend/server.js
