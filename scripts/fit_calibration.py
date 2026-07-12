"""Fit VANE's probability calibrator from labeled outcomes.

Turns the calibration *framework* into a usable loop: feed it real
(prediction, outcome) pairs and it fits a binned isotonic reliability curve per
family, reports Brier score + expected calibration error before and after, and
writes the model to ``vayne/calibration/data/calibration.json`` where
``default_calibrator()`` picks it up automatically.

Input formats
-------------
JSON:  {"hypothesis": [[0.71, true], [0.44, false], ...],
        "business_impact": [[0.8, true], ...]}
CSV:   family,probability,outcome
       hypothesis,0.71,1
       business_impact,0.80,0

Usage
-----
    python scripts/fit_calibration.py labeled_outcomes.json
    python scripts/fit_calibration.py labeled_outcomes.csv --out vayne/calibration/data/calibration.json
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

from vayne.calibration import Calibrator, evaluate_calibration


def _load(path: Path) -> dict[str, list[tuple[float, bool]]]:
    data: dict[str, list[tuple[float, bool]]] = defaultdict(list)
    if path.suffix.lower() == ".csv":
        for row in csv.DictReader(path.read_text(encoding="utf-8").splitlines()):
            fam = (row.get("family") or "default").strip()
            prob = float(row["probability"])
            outcome = str(row["outcome"]).strip().lower() in ("1", "true", "yes", "t")
            data[fam].append((prob, outcome))
    else:
        raw = json.loads(path.read_text(encoding="utf-8"))
        for fam, pairs in raw.items():
            for p, o in pairs:
                data[fam].append((float(p), bool(o)))
    return data


def main() -> None:
    ap = argparse.ArgumentParser(description="Fit VANE probability calibration.")
    ap.add_argument("input", type=Path, help="labeled outcomes (.json or .csv)")
    ap.add_argument("--out", type=Path, default=Path("vayne/calibration/data/calibration.json"))
    ap.add_argument("--bins", type=int, default=10)
    args = ap.parse_args()

    families = _load(args.input)
    if not families:
        raise SystemExit("No labeled outcomes found.")

    cal = Calibrator(bins=args.bins)
    for fam, samples in families.items():
        before = evaluate_calibration(samples, bins=args.bins)
        cal.fit(fam, samples)
        after = evaluate_calibration(
            [(cal.calibrate(p, fam).calibrated / (100.0 if p > 1 else 1.0), o) for p, o in samples],
            bins=args.bins,
        )
        print(f"[{fam}] n={before['samples']}  "
              f"Brier {before['brier']} -> {after['brier']}  "
              f"ECE {before['ece']} -> {after['ece']}")

    cal.save(args.out)
    print(f"\nCalibration model written to {args.out}")
    print("default_calibrator() will now apply it automatically.")


if __name__ == "__main__":
    main()
