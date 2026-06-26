# VAYNE

**VAYNE is not a vulnerability scanner.**

VAYNE is an AI security analyst that automates the manual validation of security findings produced by tools like Nmap, Nuclei, Burp Suite, Nessus, and OpenVAS.

Security analysts spend hours verifying hosts, confirming versions, checking exploit prerequisites, correlating multi-tool output, and eliminating false positives. VAYNE automates that workflow.

## Quick Start

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
pip install -e .

vayne validate examples/scan_results/
```

Or with explicit files:

```bash
vayne validate examples/scan_results/nuclei.json examples/scan_results/nmap.xml
```

## CLI

```bash
vayne validate <files-or-directory> [--name investigation-01]
vayne version
```

The CLI uses **Rich** for live analysis output:

- Pipeline stages (load → normalize → correlate → validate)
- Live thinking panel
- Per-finding validation reasoning
- Final investigation report with analyst recommendations

## Architecture

| Module | Purpose |
|--------|---------|
| `parsers/` | Nuclei JSON, Nmap XML, Burp XML, Nessus CSV, OpenVAS XML → common schema |
| `correlation/` | Merge findings across tools by host, service, CVE |
| `validation/` | Host alive, version confirmed, auth, prerequisites, exploitability |
| `false_positive/` | Classify confirmed / exploitable / manual review / false positive |
| `scoring/` | Exploitability score, business impact, time-to-exploit |
| `analyst/` | Narrative: why it matters, remediation, preconditions |
| `pipeline/` | Orchestrates the full investigation |
| `cli/` | Typer + Rich interactive terminal UX |
| `api/` | FastAPI health endpoint (async jobs via Celery scaffold) |

## Docker

```bash
docker compose up --build
```

Services: API (`:8000`), PostgreSQL, Redis, Celery worker.

## Tech Stack

- Python 3.12
- FastAPI
- Typer CLI
- Rich (terminal UI)
- PostgreSQL + Redis + Celery (scaffolded)

## What VAYNE Does NOT Build

- No frontend / dashboard
- No authentication
- No landing page
- No website scanner UI

VAYNE is a backend security analyst engine focused on **post-scan validation**.
