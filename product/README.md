# VAYNE Product Shell

Brutalist test UI + API around **VAYNE Core** (engine is frozen — this layer only calls `analyze()`).

## Architecture

```text
product/frontend  →  POST /api/analyze
product/backend   →  InvestigationService → vayne_runner.analyze()
PostgreSQL      →  investigations, attack_paths, graph_*, findings
filesystem      →  product/storage/{investigation_id}/*.json
VAYNE Core        →  unchanged (vayne/orchestrator/pipeline.py)
```

## Quick start (backend)

```bash
# From repo root, with venv active
pip install -e .
pip install alembic httpx

# Optional: start Postgres (docker compose)
docker compose up -d postgres

export DATABASE_URL=postgresql://vayne:vayne@localhost:5432/vayne
export VAYNE_STORAGE=product/storage/investigations

# Migrate (optional — app also calls init_db on startup)
alembic -c product/database/alembic.ini upgrade head

# Run API
uvicorn product.backend.main:app --reload --port 8000
```

## Quick start (frontend)

```bash
cd product/frontend
npm install
set NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
npm run dev
```

Open http://localhost:3000 — upload `examples/metasploit.xml`, click **Analyze**.

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analyze` | Upload scan files (multipart) |
| GET | `/api/investigation/{id}` | Summary + attack paths |
| GET | `/api/investigation/{id}/graph` | Graph nodes/edges |
| GET | `/api/path/{id}` | Path proofs + story |
| GET | `/api/investigation/{id}/proof` | proof.txt |

## Tests

```bash
pytest tests/product/ -v
pytest -q   # full suite including engine (208+) + product (8)
```

## Expected Metasploitable verification

```text
paths: 4
confidence: 83, 92, 100, 100
risk: 6.5, 7.2, 8.6, 8.6
category: remote_rce
attack surface: Critical
proof.txt: present
```
