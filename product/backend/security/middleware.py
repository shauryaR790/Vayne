"""Production security middleware and helpers."""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from product.backend.config import is_production, rate_limit_settings

logger = logging.getLogger("vayne.security")

_RATE_LOCK = Lock()
_RATE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "").strip()
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
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
    """Simple in-memory rate limits for auth and upload endpoints."""

    _RULES: dict[tuple[str, str], tuple[int, int]] = {
        ("POST", "/api/auth/login"): (10, 60),
        ("POST", "/api/auth/register"): (5, 60),
        ("POST", "/api/auth/api-keys"): (5, 3600),
        ("POST", "/api/analyze"): (20, 60),
    }

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        settings = rate_limit_settings()
        if not settings["enabled"]:
            return await call_next(request)

        rule = self._RULES.get((request.method.upper(), request.url.path))
        if not rule:
            return await call_next(request)

        limit, window = rule
        ip = client_ip(request)
        key = f"{request.method}:{request.url.path}:{ip}"
        if not rate_limit_allow(key, limit=limit, window_seconds=window):
            logger.warning("Rate limit exceeded for %s from %s", request.url.path, ip)
            return Response(
                content='{"detail":"Too many requests. Try again later."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(window)},
            )
        return await call_next(request)
