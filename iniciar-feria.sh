#!/usr/bin/env bash
# Arranque para la feria: un solo proceso, sin internet.
# Compila la aplicación Angular (si hace falta), deja los datos de ejemplo como nuevos y
# levanta FastAPI sirviendo API + aplicación en http://localhost:8100
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d frontend/dist/frontend/browser ] || [ "${1:-}" = "--compilar" ]; then
  echo "▸ Compilando la aplicación…"
  (cd frontend && npx ng build)
fi

echo "▸ Recargando datos de ejemplo…"
(cd backend && uv run alembic upgrade head && uv run python -m app.seed --reiniciar)

echo "▸ Abrir http://localhost:8100  (Ctrl+C para detener)"
cd backend && exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8100
