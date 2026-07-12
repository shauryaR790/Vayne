"""Binned reliability calibration + evaluation.

A ``Calibrator`` holds one calibration map per *family* (e.g. ``"hypothesis"``,
``"business_impact"``). A map is a monotonic, binned reliability curve fit from
labeled ``(raw_probability, outcome)`` pairs: each bin's calibrated value is the
observed success frequency in that bin, isotonically smoothed so the curve never
decreases. Calibrated lookups linearly interpolate between bin centers.

With no data, ``calibrate`` returns the raw value and marks it uncalibrated —
an honest default that changes no existing numbers.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class CalibratedValue:
    raw: float
    calibrated: float
    calibrated_flag: bool
    method: str
    samples: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "raw": round(self.raw, 4),
            "calibrated": round(self.calibrated, 4),
            "is_calibrated": self.calibrated_flag,
            "method": self.method,
            "samples": self.samples,
        }


@dataclass
class _FamilyMap:
    # Sorted bin centers in [0,1] and their calibrated frequencies.
    centers: list[float]
    values: list[float]
    samples: int

    def lookup(self, raw: float) -> float:
        if not self.centers:
            return raw
        if raw <= self.centers[0]:
            return self.values[0]
        if raw >= self.centers[-1]:
            return self.values[-1]
        for i in range(1, len(self.centers)):
            if raw <= self.centers[i]:
                lo_c, hi_c = self.centers[i - 1], self.centers[i]
                lo_v, hi_v = self.values[i - 1], self.values[i]
                if hi_c == lo_c:
                    return hi_v
                t = (raw - lo_c) / (hi_c - lo_c)
                return lo_v + t * (hi_v - lo_v)
        return self.values[-1]


def _isotonic(values: list[float]) -> list[float]:
    """Pool-adjacent-violators — enforce a non-decreasing curve."""
    out = list(values)
    weights = [1.0] * len(out)
    i = 0
    while i < len(out) - 1:
        if out[i] > out[i + 1]:
            merged = (out[i] * weights[i] + out[i + 1] * weights[i + 1]) / (weights[i] + weights[i + 1])
            out[i] = merged
            weights[i] += weights[i + 1]
            del out[i + 1]
            del weights[i + 1]
            if i > 0:
                i -= 1
        else:
            i += 1
    # Re-expand pooled blocks back to original length.
    expanded: list[float] = []
    idx = 0
    for v, w in zip(out, weights):
        expanded.extend([v] * int(w))
    return expanded[: len(values)] or list(values)


class Calibrator:
    def __init__(self, bins: int = 10) -> None:
        self.bins = max(2, bins)
        self._families: dict[str, _FamilyMap] = {}

    # -- fitting -------------------------------------------------------------
    def fit(self, family: str, samples: list[tuple[float, bool]]) -> None:
        """Fit a family map from (raw_probability in [0,1], outcome) pairs."""
        clean = [(min(1.0, max(0.0, float(p))), bool(o)) for p, o in samples]
        if not clean:
            return
        edges = [i / self.bins for i in range(self.bins + 1)]
        centers: list[float] = []
        freqs: list[float] = []
        for b in range(self.bins):
            lo, hi = edges[b], edges[b + 1]
            bucket = [o for p, o in clean if (lo <= p < hi) or (b == self.bins - 1 and p == hi)]
            if not bucket:
                continue
            centers.append((lo + hi) / 2)
            freqs.append(sum(1 for o in bucket if o) / len(bucket))
        if not centers:
            return
        smoothed = _isotonic(freqs)
        self._families[family] = _FamilyMap(centers=centers, values=smoothed, samples=len(clean))

    # -- application ---------------------------------------------------------
    def calibrate(self, raw: float, family: str = "default") -> CalibratedValue:
        raw = float(raw)
        scale = 100.0 if raw > 1.0 else 1.0
        r01 = raw / scale
        fam = self._families.get(family)
        if fam is None:
            return CalibratedValue(raw=raw, calibrated=raw, calibrated_flag=False,
                                   method="identity (uncalibrated heuristic prior)", samples=0)
        cal01 = fam.lookup(r01)
        return CalibratedValue(
            raw=raw,
            calibrated=cal01 * scale,
            calibrated_flag=True,
            method=f"binned reliability curve ({self.bins} bins, isotonic)",
            samples=fam.samples,
        )

    # -- persistence ---------------------------------------------------------
    def to_dict(self) -> dict[str, Any]:
        return {
            "bins": self.bins,
            "families": {
                name: {"centers": fm.centers, "values": fm.values, "samples": fm.samples}
                for name, fm in self._families.items()
            },
        }

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Calibrator":
        cal = cls(bins=int(data.get("bins", 10)))
        for name, fm in (data.get("families") or {}).items():
            cal._families[name] = _FamilyMap(
                centers=[float(x) for x in fm.get("centers", [])],
                values=[float(x) for x in fm.get("values", [])],
                samples=int(fm.get("samples", 0)),
            )
        return cal

    @classmethod
    def load(cls, path: Path) -> "Calibrator":
        if not path.exists():
            return cls()
        try:
            return cls.from_dict(json.loads(path.read_text(encoding="utf-8", errors="replace")))
        except (ValueError, OSError):
            return cls()


_DEFAULT: Calibrator | None = None


def default_calibrator() -> Calibrator:
    """Process-wide calibrator, loaded from disk if a fitted model exists."""
    global _DEFAULT
    if _DEFAULT is None:
        from pathlib import Path as _P

        candidates = [
            _P("vayne/calibration/data/calibration.json"),
            _P("calibration.json"),
        ]
        for c in candidates:
            if c.exists():
                _DEFAULT = Calibrator.load(c)
                break
        else:
            _DEFAULT = Calibrator()
    return _DEFAULT


def evaluate_calibration(samples: list[tuple[float, bool]], bins: int = 10) -> dict[str, Any]:
    """Brier score + expected calibration error for (probability, outcome) pairs."""
    clean = [(min(1.0, max(0.0, float(p))), 1.0 if o else 0.0) for p, o in samples]
    n = len(clean)
    if n == 0:
        return {"samples": 0, "brier": None, "ece": None, "bins": []}
    brier = sum((p - o) ** 2 for p, o in clean) / n
    edges = [i / bins for i in range(bins + 1)]
    ece = 0.0
    report: list[dict[str, Any]] = []
    for b in range(bins):
        lo, hi = edges[b], edges[b + 1]
        bucket = [(p, o) for p, o in clean if (lo <= p < hi) or (b == bins - 1 and p == hi)]
        if not bucket:
            continue
        avg_p = sum(p for p, _ in bucket) / len(bucket)
        avg_o = sum(o for _, o in bucket) / len(bucket)
        gap = abs(avg_p - avg_o)
        ece += (len(bucket) / n) * gap
        report.append({
            "range": [round(lo, 2), round(hi, 2)],
            "count": len(bucket),
            "mean_predicted": round(avg_p, 4),
            "observed_frequency": round(avg_o, 4),
            "gap": round(gap, 4),
        })
    return {"samples": n, "brier": round(brier, 4), "ece": round(ece, 4), "bins": report}
