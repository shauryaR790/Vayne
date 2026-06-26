"""Report generation — HTML, Markdown, JSON."""

from __future__ import annotations

import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from vayne.models import InvestigationReport

TEMPLATE_DIR = Path(__file__).parent / "templates"


def export_report(report: InvestigationReport, output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}

    json_path = output_dir / "investigation.json"
    json_path.write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
    paths["json"] = json_path

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    ctx = {
        "name": report.name,
        "target": report.target,
        "duration": round(report.duration_seconds, 1),
        "stats": report.stats,
        "findings": report.findings,
        "attack_paths": report.attack_paths,
    }

    md_tpl = env.get_template("report.md.j2")
    md_path = output_dir / "investigation.md"
    md_path.write_text(md_tpl.render(**ctx), encoding="utf-8")
    paths["markdown"] = md_path

    html_tpl = env.get_template("report.html.j2")
    html_path = output_dir / "investigation.html"
    html_path.write_text(html_tpl.render(**ctx), encoding="utf-8")
    paths["html"] = html_path

    return paths
