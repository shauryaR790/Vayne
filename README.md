# VAYNE

**VAYNE is not a vulnerability scanner.**
**VAYNE is not a chatbot.**
**VAYNE is not a dashboard.**

VAYNE is an **AI Security Analyst** that automates the work a human pentester performs **after** running security tools.

## Mission

Take noisy output from Nmap, Nuclei, Burp, Nessus, OpenVAS, Httpx, Naabu, and Katana — correlate everything, validate findings, remove false positives, identify attack paths, estimate exploitability, explain business impact, and provide remediation.

## Quick Start

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install -e .

vayne analyze examples/scan_results/
```

## CLI

```bash
vayne analyze ./scan_results/              # directory of scan files
vayne analyze nuclei.json nmap.xml         # explicit files
vayne analyze ./scans/ -n "prod-audit" -o ./reports/prod
vayne version
```

### Live terminal experience

- 7-stage pipeline with live progress
- **VAYNE THINKING** panel (reasoning like an AI analyst)
- Live stats: findings, attack paths, false positives, hours saved
- Per-finding validation output
- Final investigation report

## Architecture

```
vayne/
├── parsers/          # 8 scanner parsers → Finding + Asset
├── correlator/       # Merge duplicates, correlate by host/CVE/tech
├── validator/        # Host alive, version, auth, prerequisites
├── false_positive/   # Classification + analyst hours saved
├── attack_paths/     # NetworkX attack graph engine
├── exploitability/   # Risk scoring
├── analyst/          # Root cause, scenario, impact narratives
├── remediation/      # Immediate → long-term timelines
├── reporting/        # HTML, Markdown, JSON (Jinja2)
├── orchestrator/     # 7-stage pipeline
├── cli/              # Typer + Rich
└── api/              # FastAPI (health + future async jobs)
```

## Stack

Python 3.12 · Typer · Rich · Pydantic · FastAPI · PostgreSQL · Redis · Celery · NetworkX · Pandas · Jinja2 · Pytest

## Docker

```bash
docker compose up --build
```

## Tests

```bash
pytest tests/ -v
```

## What we do NOT build

- No frontend pages
- No dashboards
- No landing pages
- No website scanner UI

Build the analyst engine first.
