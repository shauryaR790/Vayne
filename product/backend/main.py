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

from product.backend.db.session import init_db
from product.backend.logging_config import configure_logging
from product.backend.routes import analyst_chat, attack_paths, dev, investigations, proof, upload

logger = configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o.strip()],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    tb = traceback.format_exc()
    # Print the FULL traceback in the terminal instead of swallowing it, so we
    # know exactly which parser or stage failed.
    logger.error("Unhandled exception on %s:\n%s", request.url.path, tb)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "stage": "internal",
            "error": str(exc),
            "error_kind": "internal_error",
            "details": tb,
            "path": str(request.url.path),
        },
    )


app.include_router(upload.router)
app.include_router(investigations.router)
app.include_router(attack_paths.router)
app.include_router(proof.router)
app.include_router(analyst_chat.router)
app.include_router(dev.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "vayne-product-api"}


@app.get("/api/health")
def api_health() -> dict[str, str]:
    return {"status": "ok", "service": "vayne-product-api"}
