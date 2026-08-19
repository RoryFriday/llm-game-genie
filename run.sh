#!/usr/bin/env bash
set -euo pipefail

# Load .env if present (copy .env.example to .env and fill in your keys)
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Ensure at least one provider key is set
if [ -z "${GEMINI_API_KEY:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: No API key found."
  echo "Set GEMINI_API_KEY or ANTHROPIC_API_KEY in your environment or in a .env file."
  echo "See .env.example for the template."
  exit 1
fi

# Default provider to gemini if not set
export LLM_PROVIDER="${LLM_PROVIDER:-gemini}"

npm install --silent
npm start
