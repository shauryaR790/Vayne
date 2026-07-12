"""Verification signal extraction.

Reads the raw scanner evidence backing a finding and decides how strongly the
observation was *verified* — not merely observed. A credentialed Nessus plugin
that logged in, a reproduced exploit, a replayed HTTP request with a matched
response, or a nuclei match with a captured response are genuine confirmations.
A bare banner is not.

This is the honest half of the validation loop: it upgrades confidence only when
real confirmation evidence is present in the input.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any

from vayne.models import CorrelatedFinding, Finding


class VerificationStrength(IntEnum):
    NONE = 0        # only observed (banner / passive)
    WEAK = 1        # corroborated by a second passive source
    STRONG = 2      # active technique (NSE/handshake/replay) matched
    CONFIRMED = 3   # authenticated check or reproduced exploit


_AUTHENTICATED_RE = re.compile(
    r"(?i)authenticated|credentialed|local\s?security\s?check|logged\s?in|"
    r"local check(?:s)? (?:passed|succeeded)|credential(?:ed)? scan"
)
_REPRODUCED_RE = re.compile(
    r"(?i)reproduced|exploit(?:ed| succeeded| confirmed)|proof.?of.?concept succeeded|"
    r"payload executed|command output|shell (?:obtained|returned)|verified exploitable"
)
_REPLAY_RE = re.compile(
    r"(?i)replay(?:ed)?|resent request|matched response|matched-at|response matched|"
    r"round-?trip confirmed|http/1\.[01]\" 200|status[- ]?code[:= ]?200"
)
_ACTIVE_PROBE_RE = re.compile(
    r"(?i)\bnse\b|-vuln|ssl-enum|smb-security|handshake|negotiat(?:e|ed)|"
    r"ssh2-enum|tls scan|cipher enumeration"
)


@dataclass
class VerificationEvidence:
    strength: int
    label: str
    method: str                     # authenticated | reproduced | replay | active_probe | corroboration | observed
    provenance: list[str]           # human-readable "tool: detail" lines
    authenticated: bool
    reproduced: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "strength": int(self.strength),
            "label": self.label,
            "method": self.method,
            "provenance": self.provenance,
            "authenticated": self.authenticated,
            "reproduced": self.reproduced,
        }


_STRENGTH_LABEL = {
    VerificationStrength.NONE: "Observed (unverified)",
    VerificationStrength.WEAK: "Corroborated",
    VerificationStrength.STRONG: "Actively probed",
    VerificationStrength.CONFIRMED: "Confirmed",
}


def _finding_blob(f: Finding) -> str:
    return " ".join(s for s in (f.title, f.evidence, f.description) if s)


def extract_verification(finding: CorrelatedFinding) -> VerificationEvidence:
    raws = finding.findings or []
    provenance: list[str] = []
    method = "observed"
    strength = VerificationStrength.NONE
    authenticated = False
    reproduced = False

    for f in raws:
        blob = _finding_blob(f)
        tool = f.source_tool or "scan"
        if _REPRODUCED_RE.search(blob):
            reproduced = True
            strength = max(strength, VerificationStrength.CONFIRMED)
            method = "reproduced"
            provenance.append(f"{tool}: reproduced/exploit-confirmed evidence")
        elif _AUTHENTICATED_RE.search(blob):
            authenticated = True
            strength = max(strength, VerificationStrength.CONFIRMED)
            if method not in ("reproduced",):
                method = "authenticated"
            provenance.append(f"{tool}: authenticated/credentialed check")
        elif _REPLAY_RE.search(blob):
            strength = max(strength, VerificationStrength.STRONG)
            if method in ("observed",):
                method = "replay"
            provenance.append(f"{tool}: replayed request / matched response")
        elif _ACTIVE_PROBE_RE.search(blob):
            strength = max(strength, VerificationStrength.STRONG)
            if method in ("observed",):
                method = "active_probe"
            provenance.append(f"{tool}: active probe (NSE/handshake) matched")

    # Corroboration: two independent passive sources is weak verification.
    distinct_tools = {(f.source_tool or "") for f in raws}
    if strength == VerificationStrength.NONE and len(distinct_tools) >= 2:
        strength = VerificationStrength.WEAK
        method = "corroboration"
        provenance.append(f"{len(distinct_tools)} independent sources corroborate the observation")

    label = _STRENGTH_LABEL[VerificationStrength(int(strength))]
    return VerificationEvidence(
        strength=int(strength),
        label=label,
        method=method,
        provenance=provenance[:6],
        authenticated=authenticated,
        reproduced=reproduced,
    )
