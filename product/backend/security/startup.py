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
    jwt_explicit = bool(os.getenv("VAYNE_JWT_SECRET", "").strip())
    pepper_explicit = bool(os.getenv("VAYNE_API_KEY_PEPPER", "").strip())

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

        # Only enforce secret strength when operators explicitly set them.
        # Missing secrets fall back to dev defaults (legacy Render/Vercel deploys).
        if jwt_explicit:
            if secret.lower() in _WEAK_SECRETS or len(secret) < 32:
                msg = (
                    "VAYNE_JWT_SECRET is too weak for production. "
                    "Use a random string of at least 32 characters."
                )
                logger.critical(msg)
                raise RuntimeError(msg)
        else:
            logger.warning(
                "VAYNE_JWT_SECRET not set — using dev default. "
                "Set a strong random secret before requiring auth in production."
            )

        if pepper_explicit:
            if pepper.lower() in _WEAK_SECRETS or len(pepper) < 32:
                msg = (
                    "VAYNE_API_KEY_PEPPER is too weak for production. "
                    "Use a random string of at least 32 characters."
                )
                logger.critical(msg)
                raise RuntimeError(msg)
            if secret == pepper:
                msg = "VAYNE_API_KEY_PEPPER must differ from VAYNE_JWT_SECRET in production."
                logger.critical(msg)
                raise RuntimeError(msg)

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
