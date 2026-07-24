"""Production security middleware and helpers."""

from __future__ import annotations

import logging
import re
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from product.backend.config import is_production, rate_limit_settings

logger = logging.getLogger("vayne.security")

_RATE_LOCK = Lock()
_RATE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)

# Exact path rules: (method, path) -> (limit, window_seconds)
_EXACT_RULES: dict[tuple[str, str], tuple[int, int]] = {
    ("POST", "/api/auth/login"): (10, 60),
    ("POST", "/api/auth/register"): (5, 60),
    ("POST", "/api/auth/api-keys"): (5, 3600),
    ("POST", "/api/analyze"): (20, 60),
    ("POST", "/api/chat"): (8, 60),
    ("GET", "/api/chat/quota"): (30, 60),
    ("GET", "/api/analyst/status"): (30, 60),
}

# Pattern rules for investigation-scoped LLM routes
_PATTERN_RULES: list[tuple[str, re.Pattern[str], int, int]] = [
    ("POST", re.compile(r"^/api/investigation/[^/]+/chat$"), 8, 60),
    ("GET", re.compile(r"^/api/investigation/[^/]+/brief$"), 6, 60),
]


def client_ip(request: Request) -> str:
    # Prefer peer IP. Only trust X-Forwarded-For when behind a known proxy
    # (production). Spoofable headers must not bypass rate limits in local/dev.
    if is_production():
        forwarded = request.headers.get("X-Forwarded-For", "").strip()
        if forwarded:
            return forwarded.split(",", 1)[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def rate_limit_allow(key: str, *, limit: int, window_seconds: int) -> bool:
    now = time.monotonic()
    cutoff = now - window_seconds
    with _RATE_LOCK:
        bucket = _RATE_BUCKETS[key]
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


def _match_rule(method: str, path: str) -> tuple[int, int] | None:
    exact = _EXACT_RULES.get((method, path))
    if exact:
        return exact
    for rule_method, pattern, limit, window in _PATTERN_RULES:
        if rule_method == method and pattern.match(path):
            return limit, window
    return None


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-site"
        if is_production():
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory rate limits for auth, upload, and LLM endpoints."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        settings = rate_limit_settings()
        if not settings["enabled"]:
            return await call_next(request)

        method = request.method.upper()
        path = request.url.path
        rule = _match_rule(method, path)
        if not rule:
            return await call_next(request)

        limit, window = rule
        ip = client_ip(request)
        key = f"{method}:{path}:{ip}"
        if not rate_limit_allow(key, limit=limit, window_seconds=window):
            logger.warning("Rate limit exceeded for %s from %s", path, ip)
            return Response(
                content='{"detail":"Too many requests. Try again later."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(window)},
            )
        return await call_next(request)
