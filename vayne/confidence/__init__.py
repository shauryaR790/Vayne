"""Evidence-driven confidence engine.

Confidence emerges from a weighted feature vector built out of the concrete
evidence the engine already recorded — never a base score or a fixed default.
Every finding produces four independent, explainable dimensions:

* Observation confidence — how certain are we the finding exists?
* Exploit confidence     — how likely can it be exploited?
* Impact confidence      — how certain are we it affects business operations?
* Overall confidence     — an evidence-weighted combination of the above.
"""

from vayne.confidence.finding_confidence import (
    ConfidenceResult,
    compute_finding_confidence,
)

__all__ = ["ConfidenceResult", "compute_finding_confidence"]
