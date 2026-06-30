"""Temporary migration — remove duplicate investigations by investigation_key."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from product.backend.env import load_repo_env

load_repo_env()


def clear_duplicate_investigations(*, dry_run: bool = False) -> dict[str, int]:
    """
    Group investigations by investigation_key, keep the newest, delete duplicates.

    Investigations missing a key are backfilled from on-disk artifacts when possible.
    """
    from product.backend.config import get_storage_root
    from product.backend.db.session import SessionLocal, init_db
    from product.backend.models.investigation import InvestigationORM
    from product.backend.services.investigation_key import compute_key_from_export_dir
    from product.backend.services.investigation_service import InvestigationService

    init_db()
    db = SessionLocal()
    storage = get_storage_root()
    svc = InvestigationService(db, storage)

    try:
        rows = db.query(InvestigationORM).all()
        backfilled = 0

        for inv in rows:
            if inv.investigation_key:
                continue
            export_dir = svc.export_dir(inv.id)
            if not export_dir.exists():
                continue
            report = svc.get_report_view(inv.id) or {}
            risk = int(report.get("attack_surface_score") or inv.attack_surface_score or 0)
            source = inv.source_filename or inv.name or ""
            inv.investigation_key = compute_key_from_export_dir(source, export_dir, risk)
            if not inv.source_filename and source:
                inv.source_filename = source
            backfilled += 1

        if backfilled:
            db.commit()
            print(f"backfilled investigation_key for {backfilled} rows", flush=True)

        rows = (
            db.query(InvestigationORM)
            .order_by(
                InvestigationORM.updated_at.desc(),
                InvestigationORM.created_at.desc(),
            )
            .all()
        )

        groups: dict[str, list[InvestigationORM]] = {}
        orphan: list[InvestigationORM] = []

        for inv in rows:
            if inv.investigation_key:
                groups.setdefault(inv.investigation_key, []).append(inv)
            else:
                orphan.append(inv)

        deleted = 0
        kept = 0

        for key, items in groups.items():
            if len(items) <= 1:
                kept += len(items)
                continue

            keeper = items[0]
            dupes = items[1:]
            kept += 1
            print(
                f"key {key[:12]}… keep {keeper.id} delete {len(dupes)} duplicate(s)",
                flush=True,
            )

            for dupe in dupes:
                if dry_run:
                    deleted += 1
                    continue
                svc.delete_investigation(dupe.id)
                deleted += 1

        result = {
            "total": len(rows),
            "unique_groups": len(groups),
            "kept": kept + len(orphan),
            "deleted": deleted,
            "orphan_without_key": len(orphan),
            "backfilled": backfilled,
        }
        print(json.dumps(result, indent=2), flush=True)
        return result
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Remove duplicate investigations by investigation_key",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report duplicates without deleting",
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="Override DATABASE_URL (default: .env or SQLite dev db)",
    )
    args = parser.parse_args()
    if args.database_url:
        import os

        os.environ["DATABASE_URL"] = args.database_url
    clear_duplicate_investigations(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
