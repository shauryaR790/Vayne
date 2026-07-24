"""Startup validation for production security configuration."""

from __future__ import annotations

import logging
import os

from product.backend.config import is_production, jwt_settings

logger = logging.getLogger("vayne.security")

_WEAK_SECRETS = {
    "",
    "vayne-dev-only-change-me",
    "change-me-in-production",
    "secret",
    "changeme",
}


def validate_security_config() -> None:
    """Fail fast when production is misconfigured."""
    settings = jwt_settings()
    secret = settings["secret"]
    pepper = settings["api_key_pepper"]

    # Never allow LLM secrets to be mirrored into frontend-public env names.
    for leaked in (
        "NEXT_PUBLIC_VAYNE_LLM_API_KEY",
        "NEXT_PUBLIC_OPENAI_API_KEY",
        "NEXT_PUBLIC_API_KEY",
    ):
        if os.getenv(leaked, "").strip():
            raise RuntimeError(
                f"{leaked} must never be set — LLM API keys stay server-side only "
                "(use VAYNE_LLM_API_KEY on the backend)."
            )

    if is_production():
        llm_key = os.getenv("VAYNE_LLM_API_KEY", "").strip()
        if llm_key and len(llm_key) < 20:
            raise RuntimeError("VAYNE_LLM_API_KEY looks invalid in production.")

        if secret.lower() in _WEAK_SECRETS or len(secret) < 32:
            raise RuntimeError(
                "VAYNE_JWT_SECRET must be set to a random string of at least 32 characters in production."
            )
        if pepper.lower() in _WEAK_SECRETS or len(pepper) < 32:
            raise RuntimeError(
                "VAYNE_API_KEY_PEPPER must be set to a random string of at least 32 characters in production."
            )
        if secret == pepper:
            raise RuntimeError("VAYNE_API_KEY_PEPPER must differ from VAYNE_JWT_SECRET in production.")

        dev_tools = os.getenv("VAYNE_DEV_TOOLS", "false").lower() in ("1", "true", "yes")
        if dev_tools:
            raise RuntimeError("VAYNE_DEV_TOOLS must be false in production.")

        expose = os.getenv("VAYNE_EXPOSE_ERROR_DETAILS", "").lower() in ("1", "true", "yes")
        if expose:
            raise RuntimeError("VAYNE_EXPOSE_ERROR_DETAILS must be false in production.")

        logger.info("Production security configuration validated.")
        return

    if secret.lower() in _WEAK_SECRETS:
        logger.warning(
            "Using default JWT secret — set VAYNE_JWT_SECRET before deploying to production."
        )
