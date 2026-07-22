"""Shared product backend config."""

from __future__ import annotations

import os
from pathlib import Path


def get_storage_root() -> Path:
    return Path(os.getenv("VAYNE_STORAGE", "product/storage/investigations"))


def is_production() -> bool:
    env = os.getenv("VAYNE_ENV", os.getenv("ENV", "development")).strip().lower()
    return env in {"production", "prod"}


def expose_error_details() -> bool:
    flag = os.getenv("VAYNE_EXPOSE_ERROR_DETAILS", "").strip().lower()
    if flag in {"0", "false", "no"}:
        return False
    if flag in {"1", "true", "yes"}:
        return True
    return not is_production()


def upload_limits() -> dict[str, int]:
    return {
        "max_files": int(os.getenv("VAYNE_MAX_UPLOAD_FILES", "100")),
        "max_file_bytes": int(os.getenv("VAYNE_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024))),
        "max_total_bytes": int(
            os.getenv("VAYNE_MAX_TOTAL_UPLOAD_BYTES", str(200 * 1024 * 1024))
        ),
    }


def jwt_settings() -> dict:
    secret = os.getenv("VAYNE_JWT_SECRET", "").strip()
    if not secret:
        secret = "vayne-dev-only-change-me"
    return {
        "secret": secret,
        "ttl_hours": int(os.getenv("VAYNE_JWT_TTL_HOURS", "168")),
        "api_key_pepper": os.getenv("VAYNE_API_KEY_PEPPER", secret),
    }


def auth_required() -> bool:
    flag = os.getenv("VAYNE_REQUIRE_AUTH", "").strip().lower()
    if flag in {"1", "true", "yes"}:
        return True
    if flag in {"0", "false", "no"}:
        return False
    return is_production()


def async_analyze_enabled() -> bool:
    flag = os.getenv("VAYNE_ASYNC_ANALYZE", "").strip().lower()
    if flag in {"0", "false", "no"}:
        return False
    if flag in {"1", "true", "yes"}:
        return bool(os.getenv("REDIS_URL", "").strip())
    return bool(os.getenv("REDIS_URL", "").strip())


def redis_url() -> str:
    return os.getenv("REDIS_URL", "redis://localhost:6379/0").strip()


def allow_registration() -> bool:
    flag = os.getenv("VAYNE_ALLOW_REGISTRATION", "").strip().lower()
    if flag in {"1", "true", "yes"}:
        return True
    if flag in {"0", "false", "no"}:
        return False
    return not is_production()


def rate_limit_settings() -> dict:
    return {
        "enabled": os.getenv("VAYNE_RATE_LIMIT", "true").lower() not in ("0", "false", "no"),
    }


def cors_allow_origin_regex() -> str | None:
    if is_production():
        return None
    return (
        r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$"
        r"|https://([a-z0-9-]+\.)*vercel\.app$"
    )


def public_error_message() -> str:
    return "An internal error occurred. Contact support if this persists."


def sanitize_client_error(message: str | None) -> str:
    if expose_error_details():
        return message or public_error_message()
    return public_error_message()
