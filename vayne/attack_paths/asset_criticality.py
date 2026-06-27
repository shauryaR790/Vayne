"""Asset criticality classification for terminal targets and risk scoring."""

from __future__ import annotations

import re

ADMIN_ARN = re.compile(r"arn:aws:iam::\d+:role/(admin|root|super|poweruser)", re.I)
PROD_MARKERS = ("prod", "production", "payment", "pci", "billing")
K8S_MARKERS = ("kubernetes", "k8s", "eks", "kube-system", "cluster-admin")
VAULT_MARKERS = ("vault", "secretsmanager", "secrets manager", "keyvault")
DC_MARKERS = ("domain controller", "dc.", "active directory", "ldap")
S3_SENSITIVE = ("sensitive", "private", "confidential", "backup", "prod")

CRITICALITY_WEIGHTS: dict[str, float] = {
    "production_database": 10.0,
    "payment_system": 10.0,
    "domain_controller": 10.0,
    "cloud_root_role": 9.5,
    "secrets_manager": 9.0,
    "kubernetes_admin": 9.0,
    "admin_account": 8.5,
    "sensitive_bucket": 7.5,
    "credential_store": 7.0,
    "ssh_private_key": 8.0,
    "generic_database": 6.5,
    "generic_credential": 5.5,
    "generic_identity": 4.0,
    "unknown": 1.0,
}


def classify_criticality(node_id: str, node_data: dict) -> tuple[str, float]:
    nt = node_data.get("node_type", "")
    label = node_data.get("label", "").lower()
    evidence = " ".join(node_data.get("evidence", [])).lower()
    combined = f"{label} {evidence} {node_id.lower()}"

    if nt == "database":
        if any(m in combined for m in PROD_MARKERS):
            return "production_database", CRITICALITY_WEIGHTS["production_database"]
        if any(m in combined for m in ("payment", "pci", "billing")):
            return "payment_system", CRITICALITY_WEIGHTS["payment_system"]
        return "generic_database", CRITICALITY_WEIGHTS["generic_database"]

    if nt == "identity":
        if ADMIN_ARN.search(label) or "root" in label:
            return "cloud_root_role", CRITICALITY_WEIGHTS["cloud_root_role"]
        if "admin" in label:
            return "admin_account", CRITICALITY_WEIGHTS["admin_account"]
        if any(m in combined for m in K8S_MARKERS):
            return "kubernetes_admin", CRITICALITY_WEIGHTS["kubernetes_admin"]
        return "generic_identity", CRITICALITY_WEIGHTS["generic_identity"]

    if nt == "credential":
        if any(m in combined for m in ("ssh", "private key", "pem")):
            return "ssh_private_key", CRITICALITY_WEIGHTS["ssh_private_key"]
        if any(m in combined for m in VAULT_MARKERS):
            return "secrets_manager", CRITICALITY_WEIGHTS["secrets_manager"]
        return "generic_credential", CRITICALITY_WEIGHTS["generic_credential"]

    if nt == "endpoint":
        if any(m in combined for m in VAULT_MARKERS):
            return "secrets_manager", CRITICALITY_WEIGHTS["secrets_manager"]
        if any(m in combined for m in DC_MARKERS):
            return "domain_controller", CRITICALITY_WEIGHTS["domain_controller"]
        if any(m in combined for m in K8S_MARKERS):
            return "kubernetes_admin", CRITICALITY_WEIGHTS["kubernetes_admin"]
        if "bucket" in combined and any(m in combined for m in S3_SENSITIVE):
            return "sensitive_bucket", CRITICALITY_WEIGHTS["sensitive_bucket"]

    return "unknown", CRITICALITY_WEIGHTS["unknown"]


def terminal_priority(node_id: str, node_data: dict) -> int:
    """Higher = more valuable attack goal."""
    category, weight = classify_criticality(node_id, node_data)
    return int(weight * 10)
