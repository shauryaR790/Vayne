"""VAYNE Product API — wraps VAYNE Core as a black box."""

from __future__ import annotations

import os
import asyncio
import traceback
from contextlib import asynccontextmanager

from product.backend.env import load_repo_env

load_repo_env()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from product.backend.config import cors_allow_origin_regex, expose_error_details, public_error_message
from product.backend.db.session import init_db
from product.backend.logging_config import configure_logging
from product.backend.routes import analyst_chat, attack_paths, auth, dev, investigations, jobs, proof, upload
from product.backend.security import RateLimitMiddleware, SecurityHeadersMiddleware, validate_security_config

logger = configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_security_config()
    configure_logging()
    init_db()
    from product.backend.services.analyst_llm import warmup_analyst_llm

    asyncio.create_task(warmup_analyst_llm())
    yield


app = FastAPI(
    title="VAYNE Product API",
    version="1.0.0",
    description="Product shell around VAYNE Core — upload scans, receive investigations.",
    lifespan=lifespan,
)

origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")
_origin_regex = cors_allow_origin_regex()
_cors_kwargs: dict = {
    "allow_origins": [o.strip().rstrip("/") for o in origins if o.strip()],
    "allow_credentials": True,
    "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    "allow_headers": [
        "Authorization",
        "Content-Type",
        "X-Vayne-Workspace-Id",
        "Accept",
    ],
    "expose_headers": ["Retry-After"],
}
if _origin_regex:
    _cors_kwargs["allow_origin_regex"] = _origin_regex

app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CORSMiddleware, **_cors_kwargs)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    tb = traceback.format_exc()
    logger.error("Unhandled exception on %s:\n%s", request.url.path, tb)
    content: dict = {
        "success": False,
        "stage": "internal",
        "error": str(exc) if expose_error_details() else public_error_message(),
        "error_kind": "internal_error",
    }
    if expose_error_details():
        content["path"] = str(request.url.path)
        content["details"] = tb
    return JSONResponse(status_code=500, content=content)


app.include_router(upload.router)
app.include_router(jobs.router)
app.include_router(investigations.router)
app.include_router(attack_paths.router)
app.include_router(proof.router)
app.include_router(analyst_chat.router)
app.include_router(auth.router)
app.include_router(dev.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "vayne-product-api"}


@app.get("/api/health")
def api_health() -> dict[str, str]:
    return {"status": "ok", "service": "vayne-product-api"}
