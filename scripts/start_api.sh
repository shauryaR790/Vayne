#!/usr/bin/env bash
set -euo pipefail

export PYTHONPATH="${PYTHONPATH:-.}"

PORT="${PORT:-8000}"
exec python -m uvicorn product.backend.main:app --host 0.0.0.0 --port "${PORT}"
